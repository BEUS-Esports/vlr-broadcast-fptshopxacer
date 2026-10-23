import { afterEach, describe, expect, it, vi } from 'vitest';
import { spectraFixture, gstackFixture } from '#lib/live/fixtures.ts';
import { defaultConfig } from './config';
import { createLiveCoordinator } from './coordinator';
import { externalGame } from '#lib/live/selectors.ts';
import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
import {
	lookupSpectraSupporter,
	startProviderSession,
	type ProviderTransportDependencies
} from './transport';

class FakeSocket {
	listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	emit = vi.fn();
	connect = vi.fn();
	disconnect = vi.fn();
	on(event: string, listener: (...args: unknown[]) => void) {
		const listeners = this.listeners.get(event) ?? new Set();
		listeners.add(listener);
		this.listeners.set(event, listeners);
		return this;
	}
	off(event: string, listener: (...args: unknown[]) => void) {
		this.listeners.get(event)?.delete(listener);
		return this;
	}
	receive(event: string, ...args: unknown[]) {
		for (const listener of this.listeners.get(event) ?? []) listener(...args);
	}
}
class FakeWebSocket extends EventTarget {
	close = vi.fn();
	open() {
		this.dispatchEvent(new Event('open'));
	}
	message(data: unknown) {
		this.dispatchEvent(new MessageEvent('message', { data }));
	}
}
function callbacks() {
	return {
		data: vi.fn(),
		error: vi.fn(),
		parseError: vi.fn(),
		diagnostic: vi.fn(),
		connected: vi.fn()
	};
}
const config = { ...defaultConfig, groupCode: 'group', accessKey: 'private&key' };
const options = (provider: 'spectra' | 'gstack', events = callbacks()) => ({
	provider,
	config,
	generation: 2,
	selectedGameId: 'game-1',
	callbacks: events
});
async function settle() {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}
afterEach(() => {
	vi.useRealTimers();
});

describe('Spectra transport', () => {
	it('requires usable match data within five seconds of logon', () => {
		vi.useFakeTimers();
		const socket = new FakeSocket(),
			events = callbacks();
		const stop = startProviderSession(options('spectra', events), { createSocket: () => socket });
		try {
			socket.receive('connect');
			socket.receive('logon_success');
			vi.advanceTimersByTime(4000);
			socket.receive('match_data', '{');
			vi.advanceTimersByTime(1000);
			expect(events.error).toHaveBeenCalledExactlyOnceWith(
				'ValoSpectra match data timed out. Check the group code and retry.'
			);
			expect(socket.disconnect).toHaveBeenCalledTimes(1);
			socket.receive('match_data', JSON.stringify(spectraFixture()));
			expect(events.data).not.toHaveBeenCalled();
		} finally {
			stop();
		}
	});
	it('uses Socket.IO logon and gates match data until acknowledgment', () => {
		const socket = new FakeSocket(),
			events = callbacks();
		const createSocket = vi.fn(() => socket);
		const stop = startProviderSession(options('spectra', events), {
			createSocket,
			now: () => 1000
		});
		expect(createSocket).toHaveBeenCalledWith(
			config.spectraSocketUrl,
			expect.objectContaining({ reconnection: false, forceNew: true, autoConnect: false })
		);
		socket.receive('match_data', JSON.stringify(spectraFixture()));
		expect(events.data).not.toHaveBeenCalled();
		socket.receive('connect');
		expect(socket.emit).toHaveBeenCalledWith('logon', JSON.stringify({ groupCode: 'group' }));
		socket.receive('logon_success');
		socket.receive('match_data', JSON.stringify(spectraFixture()));
		expect(events.connected).toHaveBeenCalledTimes(1);
		expect(events.data).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: 'spectra',
				generation: 2,
				receivedAt: 1000,
				selectedGameId: 'game-1'
			})
		);
		stop();
		stop();
		expect(socket.disconnect).toHaveBeenCalledTimes(1);
		socket.receive('match_data', JSON.stringify(spectraFixture()));
		expect(events.data).toHaveBeenCalledTimes(1);
	});
	it('times out a silent handshake and uses credential-free transport errors', () => {
		vi.useFakeTimers();
		const socket = new FakeSocket(),
			events = callbacks();
		startProviderSession(options('spectra', events), { createSocket: () => socket });
		socket.receive('connect');
		vi.advanceTimersByTime(5000);
		expect(events.error).toHaveBeenCalledTimes(1);
		expect(socket.disconnect).toHaveBeenCalledTimes(1);
		socket.receive('connect_error', new Error(config.accessKey));
		expect(JSON.stringify(events.error.mock.calls)).not.toContain(config.accessKey);
	});
	it('reports malformed match data separately and retains missing auxiliary observations', () => {
		const socket = new FakeSocket(),
			events = callbacks();
		const stop = startProviderSession(options('spectra', events), { createSocket: () => socket });
		socket.receive('connect');
		socket.receive('logon_success');
		socket.receive('match_data', '{');
		expect(events.parseError).toHaveBeenCalledTimes(1);
		const wire = spectraFixture();
		wire.teams[0].players[0].auxiliaryAvailable.health = false;
		socket.receive('match_data', JSON.stringify(wire));
		expect(events.data.mock.calls[0][0].teams[0].players[0].health).toBeNull();
		expect(events.error).not.toHaveBeenCalled();
		stop();
	});
});

describe('GStack snapshot + delta transport', () => {
	it('does not count unsupported JSON toward malformed failures, but still fails malformed known data', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		const stop = startProviderSession(options('gstack', events), {
			createWebSocket: () => socket,
			fetch: async () => new Response(JSON.stringify(gstackFixture()))
		});
		socket.open();
		await settle();
		const published = events.data.mock.calls.length;
		for (let i = 0; i < 5; i++) socket.message('[ExecuteJSON]: {"Scoreboard":{"FutureField":1}}');
		expect(events.error).not.toHaveBeenCalled();
		expect(events.parseError).not.toHaveBeenCalled();
		expect(socket.close).not.toHaveBeenCalled();
		expect(events.data).toHaveBeenCalledTimes(published);
		expect(events.diagnostic.mock.calls.at(-1)?.[0].unknown).toContain('FutureField');
		socket.message('[ExecuteScript]: SetRound(4,5)');
		expect(events.data.mock.calls.at(-1)?.[0].teams[0].score).toBe(4);
		for (let i = 0; i < 3; i++) socket.message('[ExecuteJSON]: {"Scoreboard":[]}');
		expect(events.error).toHaveBeenCalledTimes(1);
		expect(socket.close).toHaveBeenCalledTimes(1);
		stop();
	});
	it('reports bounded parsed commands and the successful resync time only in diagnostics', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		let receivedAt = 1234;
		const stop = startProviderSession(options('gstack', events), {
			createWebSocket: () => socket,
			fetch: async () => new Response(JSON.stringify(gstackFixture())),
			now: () => receivedAt
		});
		socket.open();
		await settle();
		expect(events.diagnostic.mock.calls.at(-1)?.[0]).toMatchObject({
			command: null,
			lastResyncAt: 1234
		});
		receivedAt = 2222;
		socket.message("[ExecuteScript]: SetPlayerKDA(0,1,'3','0','1')");
		expect(events.diagnostic.mock.calls.at(-1)?.[0]).toMatchObject({
			command: { name: 'SetPlayerKDA', args: [0, 1, '3', '0', '1'] },
			lastResyncAt: 1234
		});
		expect(JSON.stringify(events.data.mock.calls.at(-1)?.[0])).not.toContain('lastResyncAt');
		expect(JSON.stringify(events.data.mock.calls.at(-1)?.[0])).not.toContain('SetPlayerKDA');
		socket.message(`[ExecuteScript]: SetPlayerCreds(0,1,'${'0'.repeat(600)}')`);
		expect(events.diagnostic.mock.calls.at(-1)?.[0].command.args[2]).toHaveLength(512);
		expect(events.diagnostic.mock.calls.at(-1)?.[0].lastResyncAt).toBe(1234);
		socket.message('[ExecuteScript]: Unknown(1)');
		expect(events.diagnostic.mock.calls.at(-1)?.[0]).toMatchObject({
			command: null,
			lastResyncAt: 1234
		});
		stop();
	});
	it('retains malformed snapshot text for bounded admin diagnostics', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		startProviderSession(options('gstack', events), {
			createWebSocket: () => socket,
			fetch: async () => new Response('{invalid-json')
		});
		socket.open();
		await settle();
		expect(events.diagnostic.mock.calls.at(-1)?.[0]).toMatchObject({
			snapshot: '{invalid-json',
			issues: ['Could not parse or synchronize the latest GStack snapshot.']
		});
		expect(events.error).toHaveBeenCalledTimes(1);
	});
	it('keeps bounded diagnostic evidence for oversized and binary WS data', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		const stop = startProviderSession(options('gstack', events), {
			createWebSocket: () => socket,
			fetch: async () => new Response(JSON.stringify(gstackFixture()))
		});
		socket.open();
		await settle();
		socket.message('x'.repeat(65_537));
		expect(events.diagnostic.mock.calls.at(-1)?.[0].message).toBe('x'.repeat(16_384));
		socket.message(new ArrayBuffer(4));
		expect(events.diagnostic.mock.calls.at(-1)?.[0].message).toBe(
			'[unsupported non-text WebSocket message]'
		);
		expect(events.parseError).toHaveBeenCalledTimes(2);
		stop();
	});
	it('closes a silent WS attempt after five seconds', () => {
		vi.useFakeTimers();
		const socket = new FakeWebSocket(),
			events = callbacks();
		const stop = startProviderSession(options('gstack', events), { createWebSocket: () => socket });
		vi.advanceTimersByTime(5000);
		expect(events.error).toHaveBeenCalledTimes(1);
		expect(socket.close).toHaveBeenCalledTimes(1);
		stop();
		expect(socket.close).toHaveBeenCalledTimes(1);
	});
	it('uses the secure GStack WS port and aborts the whole attempt on close during synchronization', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		let signal: AbortSignal | undefined;
		const createWebSocket = vi.fn(() => socket);
		startProviderSession(
			{
				...options('gstack', events),
				config: { ...config, gstackUrl: 'https://gstack.local:57780/' }
			},
			{
				createWebSocket,
				fetch: (_url, init) =>
					new Promise((_resolve, reject) => {
						signal = init?.signal as AbortSignal;
						signal.addEventListener('abort', () => reject(new Error(config.accessKey)));
					})
			}
		);
		expect(createWebSocket).toHaveBeenCalledWith('wss://gstack.local:57773/');
		socket.open();
		socket.dispatchEvent(new Event('close'));
		await settle();
		expect(signal?.aborted).toBe(true);
		expect(events.error).toHaveBeenCalledTimes(1);
		expect(events.data).not.toHaveBeenCalled();
		expect(JSON.stringify(events.error.mock.calls)).not.toContain(config.accessKey);
	});
	it.each([
		new Response('bad', { status: 503 }),
		new Response('{}'),
		new Response(new Uint8Array([0xff, 0xff])),
		new Response('small', { headers: { 'content-length': '1048577' } })
	])('fails nonusable seed responses', async (response) => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		startProviderSession(options('gstack', events), {
			createWebSocket: () => socket,
			fetch: async () => response
		});
		socket.open();
		await settle();
		expect(events.error).toHaveBeenCalledTimes(1);
		expect(socket.close).toHaveBeenCalledTimes(1);
		expect(events.data).not.toHaveBeenCalled();
	});
	it('opens WS first and replays buffered deltas after the seed', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		let resolveSnapshot!: (response: Response) => void;
		const fetch = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveSnapshot = resolve;
				})
		);
		const createWebSocket = vi.fn(() => socket);
		const stop = startProviderSession(options('gstack', events), {
			fetch: fetch as unknown as typeof globalThis.fetch,
			createWebSocket,
			now: () => 1000
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(createWebSocket).toHaveBeenCalledWith('ws://localhost:57770/');
		socket.open();
		expect(fetch).toHaveBeenCalledWith(
			'http://localhost:57780/livenow',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		socket.message("[ExecuteScript]: SetPlayerKDA(0,1,'3','0','1')");
		expect(events.data).not.toHaveBeenCalled();
		resolveSnapshot(new Response(JSON.stringify(gstackFixture())));
		await settle();
		expect(events.data.mock.calls.at(-1)?.[0].teams[0].players[0].kills).toBe(3);
		expect(events.connected).toHaveBeenCalledTimes(1);
		socket.message('[ExecuteScript]: SetRefreshLogos(1)');
		expect(events.error).not.toHaveBeenCalled();
		expect(events.parseError).not.toHaveBeenCalled();
		expect(events.diagnostic.mock.calls.at(-1)?.[0]).toMatchObject({
			unknown: expect.stringContaining('SetRefreshLogos')
		});
		stop();
	});
	it('cleans up canceled startup and ignores late snapshot completion', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		let resolveSnapshot!: (response: Response) => void;
		let signal: AbortSignal | undefined;
		const fetch = vi.fn((_url: unknown, init?: RequestInit) => {
			signal = init?.signal as AbortSignal;
			return new Promise<Response>((resolve) => {
				resolveSnapshot = resolve;
			});
		});
		const stop = startProviderSession(options('gstack', events), {
			createWebSocket: () => socket,
			fetch: fetch as unknown as typeof globalThis.fetch
		});
		socket.open();
		stop();
		stop();
		expect(signal?.aborted).toBe(true);
		expect(socket.close).toHaveBeenCalledTimes(1);
		resolveSnapshot(new Response(JSON.stringify(gstackFixture())));
		await settle();
		expect(events.data).not.toHaveBeenCalled();
		expect(events.error).not.toHaveBeenCalled();
	});
	it('resynchronizes fresh state each attempt and fails bounded malformed known messages', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		const fetch = vi.fn(async () => new Response(JSON.stringify(gstackFixture())));
		const dependencies = {
			createWebSocket: () => socket,
			fetch: fetch as unknown as typeof globalThis.fetch
		};
		const stop = startProviderSession(options('gstack', events), dependencies);
		socket.open();
		await settle();
		socket.message('[ExecuteScript]: SetRound(4,5)');
		expect(events.data.mock.calls.at(-1)?.[0].teams[0].score).toBe(4);
		stop();
		const next = new FakeWebSocket();
		startProviderSession(options('gstack', events), {
			...dependencies,
			createWebSocket: () => next
		});
		next.open();
		await settle();
		expect(events.data.mock.calls.at(-1)?.[0].teams[0].score).toBe(0);
		for (let i = 0; i < 3; i++) next.message('[ExecuteScript]: SetPlayerHP(0,1,process.exit())');
		expect(events.error).toHaveBeenCalledTimes(1);
		expect(next.close).toHaveBeenCalledTimes(1);
	});
	it('fails oversized startup buffers and HTTP bodies without leaking provider errors', async () => {
		const socket = new FakeWebSocket(),
			events = callbacks();
		const stop = startProviderSession(options('gstack', events), {
			createWebSocket: () => socket,
			fetch: (() => new Promise(() => {})) as typeof globalThis.fetch
		});
		socket.open();
		for (let i = 0; i < 257; i++) socket.message('[ExecuteScript]: SetRound(0,0)');
		expect(events.error).toHaveBeenCalledTimes(1);
		stop();
		const second = new FakeWebSocket(),
			nextEvents = callbacks();
		startProviderSession(options('gstack', nextEvents), {
			createWebSocket: () => second,
			fetch: (async () => new Response('x'.repeat(1_048_577))) as typeof globalThis.fetch
		});
		second.open();
		await settle();
		expect(nextEvents.error).toHaveBeenCalledTimes(1);
		expect(second.close).toHaveBeenCalledTimes(1);
	});
});

describe('idle provider recovery', () => {
	it.each(['spectra', 'gstack'] as const)(
		'falls back after a silent %s session cannot resynchronize and keeps recovery native',
		async (provider) => {
			vi.useFakeTimers();
			const spectraSockets: FakeSocket[] = [];
			const gstackSockets: FakeWebSocket[] = [];
			let available = true;
			const snapshot = {
				selection: { gameId: 'game-1' },
				competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
				teams: [{ entryId: 'a' }, { entryId: 'b' }],
				lineups: []
			} as unknown as BroadcastSnapshot;
			const coordinator = createLiveCoordinator({
				publish: vi.fn(),
				start: (provider, callbacks, generation) =>
					startProviderSession(
						{ ...options(provider), callbacks, generation },
						{
							createSocket: () => {
								const socket = new FakeSocket();
								spectraSockets.push(socket);
								return socket;
							},
							createWebSocket: () => {
								const socket = new FakeWebSocket();
								gstackSockets.push(socket);
								return socket;
							},
							fetch: async (_url, init) =>
								available
									? Response.json(gstackFixture())
									: new Promise<Response>((_resolve, reject) => {
											init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
										})
						}
					)
			});
			const connect = async () => {
				if (provider === 'spectra') {
					const socket = spectraSockets.at(-1)!;
					socket.receive('connect');
					socket.receive('logon_success');
					if (available) socket.receive('match_data', JSON.stringify(spectraFixture()));
				} else gstackSockets.at(-1)!.open();
				await settle();
			};
			const programState = () =>
				externalGame(snapshot, {
					version: 1,
					stream: { epoch: 'test', sequence: 1 },
					state: coordinator.getState(),
					status: coordinator.getStatus()
				});
			try {
				coordinator.bind(snapshot);
				coordinator.connect(provider);
				await connect();
				coordinator.confirmMapping(
					{
						teams: coordinator.getState()!.teams.map((team, i) => ({
							providerSide: team.providerSide,
							entryId: i ? 'b' : 'a'
						})),
						players: []
					},
					coordinator.getStatus().generation
				);
				coordinator.enableExternal();
				expect(programState()).not.toBeNull();
				available = false;
				await vi.advanceTimersByTimeAsync(30_000);
				expect([...spectraSockets, ...gstackSockets]).toHaveLength(2);
				await connect();
				await vi.advanceTimersByTimeAsync(5000);
				expect(coordinator.getStatus().health).toBe('retrying');
				for (const delay of [1000, 2000, 4000, 8000]) {
					await vi.advanceTimersByTimeAsync(delay);
					await connect();
					await vi.advanceTimersByTimeAsync(5000);
				}
				expect(coordinator.getStatus()).toMatchObject({ health: 'fallback', mode: 'native' });
				expect(programState()).toBeNull();
				available = true;
				await vi.advanceTimersByTimeAsync(8000);
				await connect();
				expect(coordinator.getStatus()).toMatchObject({ health: 'ready', mode: 'native' });
				expect(programState()).toBeNull();
				coordinator.enableExternal();
				expect(programState()).not.toBeNull();
			} finally {
				coordinator.dispose();
			}
			expect(vi.getTimerCount()).toBe(0);
		}
	);
});

describe('Spectra supporter lookup', () => {
	it.each([
		[true, 'supporter'],
		[false, 'required']
	] as const)(
		'maps HTTP200 boolean %s and encodes server-only access keys',
		async (isSupporter, result) => {
			const fetch = vi.fn<typeof globalThis.fetch>(
				async () => new Response(JSON.stringify({ id: 'org', name: 'Org', isSupporter }))
			);
			expect(
				await lookupSpectraSupporter(config, { fetch: fetch as unknown as typeof globalThis.fetch })
			).toBe(result);
			const url = new URL(String(fetch.mock.calls[0][0]));
			expect(url.pathname).toBe('/getOrgForKey');
			expect(url.searchParams.get('key')).toBe(config.accessKey);
		}
	);
	it('maps unauthorized/unavailable/malformed results without throwing', async () => {
		for (const [response, result] of [
			[new Response('', { status: 401 }), 'invalid-key'],
			[new Response('bad'), 'unknown'],
			[new Response('{}'), 'unknown']
		] as const) {
			expect(
				await lookupSpectraSupporter(config, {
					fetch: (async () => response) as typeof globalThis.fetch
				})
			).toBe(result);
		}
		expect(
			await lookupSpectraSupporter(config, {
				fetch: (async () => {
					throw new Error(config.accessKey);
				}) as typeof globalThis.fetch
			})
		).toBe('unknown');
	});
	it('aborts a silent lookup after five seconds', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | undefined;
		const fetch: ProviderTransportDependencies['fetch'] = (_url, init) =>
			new Promise((_resolve, reject) => {
				signal = init?.signal as AbortSignal;
				signal.addEventListener('abort', () => reject(new Error('abort')));
			});
		const promise = lookupSpectraSupporter(config, { fetch });
		await vi.advanceTimersByTimeAsync(5000);
		expect(await promise).toBe('unknown');
		expect(signal?.aborted).toBe(true);
	});
});
