import { io } from 'socket.io-client';
import type { LiveProviderId, LiveSessionStatus } from '#lib/live/types.ts';
import { boundedText } from '#lib/server/http.ts';
import type { LiveProviderConfig } from './config';
import type { ProviderCallbacks } from './coordinator';
import { createGStackAccumulator, normalizeGStack, parseGStackMessage } from './providers/gstack';
import { normalizeSpectra } from './providers/spectra';
import { logEvent } from '../logging';

type SocketLike = {
	io?: { engine?: { transport?: { name: string } } };
	on: (event: string, listener: (...args: unknown[]) => void) => unknown;
	off: (event: string, listener: (...args: unknown[]) => void) => unknown;
	emit: (event: string, data: string) => unknown;
	connect: () => unknown;
	disconnect: () => unknown;
};
export type ProviderTransportDependencies = {
	fetch: typeof globalThis.fetch;
	createSocket: (url: string, options: Record<string, unknown>) => SocketLike;
	createWebSocket: (
		url: string
	) => Pick<WebSocket, 'addEventListener' | 'removeEventListener' | 'close'>;
	now: () => number;
};
type SessionOptions = {
	provider: LiveProviderId;
	config: LiveProviderConfig;
	generation: number;
	selectedGameId: string | null;
	callbacks: ProviderCallbacks;
};
const timeoutMs = 5000;
const maxHttpBytes = 1_048_576;

/** One cancellable attempt; the coordinator exclusively owns retries and generations. */
export function startProviderSession(
	options: SessionOptions,
	overrides: Partial<ProviderTransportDependencies> = {}
): () => void {
	const dependencies: ProviderTransportDependencies = {
		fetch: globalThis.fetch,
		createSocket: (url, settings) => io(url, settings),
		createWebSocket: (url) => new WebSocket(url),
		now: Date.now,
		...overrides
	};
	const { provider, config, callbacks } = options;
	const startedAt = dependencies.now();
	let stage = 'connect';
	let endpoint = provider === 'spectra' ? config.spectraSocketUrl : config.gstackUrl;
	const secrets = [config.accessKey, config.groupCode];
	const log = (
		level: 'info' | 'warn',
		event: string,
		fields: Record<string, string | number | boolean | null | undefined> = {},
		cause?: unknown
	) =>
		logEvent(
			level,
			event,
			{
				provider,
				endpoint,
				generation: options.generation,
				selectedGameId: options.selectedGameId,
				stage,
				elapsedMs: dependencies.now() - startedAt,
				timeoutMs,
				...fields
			},
			cause,
			secrets
		);
	const controller = new AbortController();
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let close: (() => void) | undefined;
	const listeners: (() => void)[] = [];
	const context = () => ({
		generation: options.generation,
		selectedGameId: options.selectedGameId,
		receivedAt: dependencies.now()
	});
	function stop() {
		if (stopped) return;
		stopped = true;
		clearTimeout(timer);
		timer = undefined;
		controller.abort();
		for (const remove of listeners) remove();
		listeners.length = 0;
		try {
			close?.();
		} catch {
			/* An already closing upstream session needs no second cleanup. */
		}
	}
	function fail(message: string, reason = 'transport', cause?: unknown) {
		if (stopped) return;
		log('warn', 'live.session.failed', { reason }, cause);
		stop();
		callbacks.error(message);
	}
	function arm(message: string, nextStage = 'connect') {
		stage = nextStage;
		clearTimeout(timer);
		timer = setTimeout(() => fail(message, 'timeout'), timeoutMs);
	}
	try {
		if (provider === 'spectra') {
			log('info', 'live.session.start', { transports: 'polling,websocket' });
			const socket = dependencies.createSocket(config.spectraSocketUrl, {
				reconnection: false,
				forceNew: true,
				autoConnect: false,
				timeout: timeoutMs
			});
			close = () => socket.disconnect();
			let connected = false,
				loggedOn = false;
			const on = (event: string, handler: (...args: unknown[]) => void) => {
				const listener = (...args: unknown[]) => {
					if (!stopped) handler(...args);
				};
				socket.on(event, listener);
				listeners.push(() => {
					socket.off(event, listener);
				});
			};
			on('connect', () => {
				if (connected) return;
				connected = true;
				log('info', 'live.spectra.connected', { transport: socket.io?.engine?.transport?.name });
				arm('ValoSpectra logon timed out. Check the group code and retry.', 'logon');
				socket.emit('logon', JSON.stringify({ groupCode: config.groupCode }));
			});
			on('logon_success', () => {
				if (!connected || loggedOn) return;
				loggedOn = true;
				log('info', 'live.spectra.logged-on');
				arm('ValoSpectra match data timed out. Check the group code and retry.', 'match-data');
				callbacks.connected();
			});
			on('match_data', (input) => {
				if (!loggedOn) return;
				const result = normalizeSpectra(input, context());
				callbacks.diagnostic({
					provider,
					connected,
					loggedOn,
					matchData: typeof input === 'string' ? input.slice(0, 262_144) : input,
					issues: result.issues.slice(0, 30)
				});
				if (!result.state) {
					log('warn', 'live.spectra.invalid-data');
					callbacks.parseError('Malformed ValoSpectra match data. Inspect View Data.');
					return;
				}
				if (stage !== 'streaming') {
					stage = 'streaming';
					log('info', 'live.session.ready', { transport: socket.io?.engine?.transport?.name });
				}
				clearTimeout(timer);
				timer = undefined;
				callbacks.data(result.state);
			});
			on('connect_error', (cause) =>
				fail('Could not connect to ValoSpectra. Check Settings and retry.', 'connect_error', cause)
			);
			on('disconnect', (reason, description) =>
				fail('ValoSpectra disconnected. Retrying the provider session.', 'disconnect', {
					message: reason,
					description
				})
			);
			on('error', (cause) =>
				fail('ValoSpectra transport failed. Check Settings and retry.', 'error', cause)
			);
			arm('ValoSpectra connection timed out. Check Settings and retry.');
			socket.connect();
		} else {
			const address = new URL(config.gstackUrl);
			address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
			address.port = address.protocol === 'wss:' ? '57773' : '57770';
			endpoint = address.href;
			log('info', 'live.session.start', { transport: 'websocket' });
			const socket = dependencies.createWebSocket(address.href);
			close = () => socket.close();
			const accumulator = createGStackAccumulator();
			let seeded = false,
				opening = false,
				malformed = 0;
			let snapshot: unknown = null;
			let lastWsMessage: string | null = null;
			let command: { name: string; args: (string | number | boolean | null)[] } | null = null;
			let lastResyncAt: number | null = null;
			const buffered: string[] = [];
			let bufferSize = 0;
			const diagnostics = (issues: string[] = []) => {
				if (stopped) return;
				const latest = accumulator.getDiagnostics();
				callbacks.diagnostic({
					provider,
					snapshot,
					message: lastWsMessage ?? latest.lastMessage,
					command,
					lastResyncAt,
					unknown: latest.lastUnknownMessage,
					accumulator: accumulator.getSnapshot(),
					issues: issues.slice(0, 30)
				});
			};
			function malformedMessage() {
				if (++malformed >= 3) fail('Repeated malformed GStack data. Inspect View Data.');
				else callbacks.parseError('Malformed GStack data. Inspect View Data.');
			}
			function publish() {
				if (stopped) return;
				const result = normalizeGStack(accumulator.getSnapshot(), context());
				diagnostics(result.issues);
				if (!result.state) {
					malformedMessage();
					return;
				}
				malformed = 0;
				if (stage !== 'streaming') {
					stage = 'streaming';
					log('info', 'live.session.ready');
				}
				callbacks.data(result.state);
			}
			function apply(message: string, emit = true) {
				if (stopped) return;
				const parsed = parseGStackMessage(message);
				command =
					parsed.kind === 'script'
						? {
								name: parsed.name.slice(0, 64),
								args: parsed.args
									.slice(0, 8)
									.map((argument) =>
										typeof argument === 'string' ? argument.slice(0, 512) : argument
									)
							}
						: null;
				const result = accumulator.apply(message);
				if (!result.accepted) {
					diagnostics(result.issues);
					if (parsed.kind === 'invalid') malformedMessage();
					return;
				}
				if (emit) publish();
			}
			const on = (event: string, handler: EventListener) => {
				const listener: EventListener = (value) => {
					if (!stopped) handler(value);
				};
				socket.addEventListener(event, listener);
				listeners.push(() => socket.removeEventListener(event, listener));
			};
			on('open', () => {
				if (opening) return;
				opening = true;
				log('info', 'live.gstack.connected');
				arm('GStack synchronization timed out. Check Settings and retry.', 'snapshot');
				void (async () => {
					try {
						const response = await dependencies.fetch(new URL('/livenow', config.gstackUrl).href, {
							signal: controller.signal,
							cache: 'no-store',
							redirect: 'error'
						});
						if (stopped) return;
						if (!response.ok) {
							await response.body?.cancel();
							throw Object.assign(new Error('Snapshot HTTP failure'), { status: response.status });
						}
						const text = await boundedText(response, controller.signal, maxHttpBytes);
						if (stopped) return;
						snapshot = text.slice(0, 65_536);
						const parsed: unknown = JSON.parse(text);
						if (!accumulator.seed(parsed).accepted) throw new Error('Invalid snapshot');
						snapshot = parsed;
						seeded = true;
						clearTimeout(timer);
						timer = undefined;
						for (const message of buffered) {
							if (stopped) return;
							apply(message, false);
						}
						buffered.length = 0;
						bufferSize = 0;
						if (stopped) return;
						lastResyncAt = dependencies.now();
						callbacks.connected();
						publish();
					} catch (cause) {
						diagnostics(['Could not parse or synchronize the latest GStack snapshot.']);
						fail(
							'Could not synchronize GStack live data. Check Settings and retry.',
							'snapshot',
							cause instanceof SyntaxError ? new Error('Invalid snapshot JSON') : cause
						);
					}
				})();
			});
			on('message', (event) => {
				const message = (event as MessageEvent<unknown>).data;
				command = null;
				lastWsMessage =
					typeof message === 'string'
						? message.slice(0, 16_384)
						: '[unsupported non-text WebSocket message]';
				if (typeof message !== 'string' || message.length > 65_536) {
					diagnostics(['Unsupported or oversized GStack WebSocket data.']);
					malformedMessage();
					return;
				}
				if (!seeded) {
					buffered.push(message);
					bufferSize += message.length;
					if (buffered.length > 256 || bufferSize > maxHttpBytes)
						fail('GStack startup data exceeded the buffer limit. Retrying synchronization.');
				} else apply(message);
			});
			on('close', (event) =>
				fail('GStack disconnected. Retrying the provider session.', 'close', {
					code: (event as CloseEvent).code
				})
			);
			on('error', (event) =>
				fail(
					'GStack WebSocket failed. Check Settings and retry.',
					'error',
					(event as ErrorEvent).error
				)
			);
			arm('GStack connection timed out. Check Settings and retry.');
		}
	} catch (cause) {
		fail('Could not open the provider session. Check Settings and retry.', 'startup', cause);
	}
	return stop;
}

export async function lookupSpectraSupporter(
	config: LiveProviderConfig,
	overrides: Partial<ProviderTransportDependencies> = {}
): Promise<LiveSessionStatus['attribution']> {
	const now = overrides.now ?? Date.now;
	const startedAt = now();
	const log = (level: 'info' | 'warn', event: string, status?: number, cause?: unknown) =>
		logEvent(
			level,
			event,
			{
				provider: 'spectra',
				endpoint: config.spectraExtrasUrl,
				elapsedMs: now() - startedAt,
				timeoutMs,
				status,
				timedOut: controller.signal.aborted
			},
			cause,
			[config.accessKey, config.groupCode]
		);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	log('info', 'live.spectra.supporter.start');
	try {
		const address = new URL('/getOrgForKey', config.spectraExtrasUrl);
		address.searchParams.set('key', config.accessKey);
		const response = await (overrides.fetch ?? globalThis.fetch)(address.href, {
			signal: controller.signal,
			cache: 'no-store',
			redirect: 'error'
		});
		log(response.ok ? 'info' : 'warn', 'live.spectra.supporter.response', response.status);
		if (response.status === 401) {
			await response.body?.cancel();
			return 'invalid-key';
		}
		if (!response.ok) {
			await response.body?.cancel();
			return 'unknown';
		}
		const text = await boundedText(response, controller.signal, maxHttpBytes);
		const value: unknown = JSON.parse(text);
		if (value && typeof value === 'object') {
			const org = value as Record<string, unknown>;
			const supporter = Object.hasOwn(org, 'orgIsSupporter') ? org.orgIsSupporter : org.isSupporter;
			if (supporter === true) return 'supporter';
			if (supporter === false) return 'required';
		}
		log('warn', 'live.spectra.supporter.invalid-response', response.status);
		return 'unknown';
	} catch (cause) {
		log(
			'warn',
			'live.spectra.supporter.failed',
			undefined,
			cause instanceof SyntaxError ? new Error('Invalid supporter JSON') : cause
		);
		return 'unknown';
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}
