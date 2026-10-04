import { io } from 'socket.io-client';
import type { LiveProviderId, LiveSessionStatus } from '#lib/live/types.ts';
import type { LiveProviderConfig } from './config';
import type { ProviderCallbacks } from './coordinator';
import { createGStackAccumulator, normalizeGStack, parseGStackMessage } from './providers/gstack';
import { normalizeSpectra } from './providers/spectra';

type SocketLike = {
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

async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
	const length = response.headers.get('content-length');
	if (length && Number(length) > maxHttpBytes) {
		await response.body?.cancel();
		throw new Error('Response size limit');
	}
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			if (signal.aborted) throw new Error('Canceled');
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxHttpBytes) throw new Error('Response size limit');
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (cause) {
		await reader.cancel().catch(() => {});
		throw cause;
	} finally {
		reader.releaseLock();
	}
}

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
	function fail(message: string) {
		if (stopped) return;
		stop();
		callbacks.error(message);
	}
	function arm(message: string) {
		clearTimeout(timer);
		timer = setTimeout(() => fail(message), timeoutMs);
	}
	try {
		if (provider === 'spectra') {
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
				arm('ValoSpectra logon timed out. Check the group code and retry.');
				socket.emit('logon', JSON.stringify({ groupCode: config.groupCode }));
			});
			on('logon_success', () => {
				if (!connected || loggedOn) return;
				loggedOn = true;
				clearTimeout(timer);
				timer = undefined;
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
					callbacks.parseError('Malformed ValoSpectra match data. Inspect View Data.');
					return;
				}
				callbacks.data(result.state);
			});
			on('connect_error', () =>
				fail('Could not connect to ValoSpectra. Check Settings and retry.')
			);
			on('disconnect', () => fail('ValoSpectra disconnected. Retrying the provider session.'));
			on('error', () => fail('ValoSpectra transport failed. Check Settings and retry.'));
			arm('ValoSpectra connection timed out. Check Settings and retry.');
			socket.connect();
		} else {
			const address = new URL(config.gstackUrl);
			address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
			address.port = address.protocol === 'wss:' ? '57773' : '57770';
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
				arm('GStack synchronization timed out. Check Settings and retry.');
				void (async () => {
					try {
						const response = await dependencies.fetch(new URL('/livenow', config.gstackUrl).href, {
							signal: controller.signal,
							cache: 'no-store',
							redirect: 'error'
						});
						if (stopped) return;
						if (!response.ok) throw new Error('Snapshot HTTP failure');
						const text = await boundedText(response, controller.signal);
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
					} catch {
						diagnostics(['Could not parse or synchronize the latest GStack snapshot.']);
						fail('Could not synchronize GStack live data. Check Settings and retry.');
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
			on('close', () => fail('GStack disconnected. Retrying the provider session.'));
			on('error', () => fail('GStack WebSocket failed. Check Settings and retry.'));
			arm('GStack connection timed out. Check Settings and retry.');
		}
	} catch {
		fail('Could not open the provider session. Check Settings and retry.');
	}
	return stop;
}

export async function lookupSpectraSupporter(
	config: LiveProviderConfig,
	overrides: Partial<ProviderTransportDependencies> = {}
): Promise<LiveSessionStatus['attribution']> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const address = new URL('/getOrgForKey', config.spectraExtrasUrl);
		address.searchParams.set('key', config.accessKey);
		const response = await (overrides.fetch ?? globalThis.fetch)(address.href, {
			signal: controller.signal,
			cache: 'no-store',
			redirect: 'error'
		});
		if (response.status === 401) {
			await response.body?.cancel();
			return 'invalid-key';
		}
		if (!response.ok) {
			await response.body?.cancel();
			return 'unknown';
		}
		const text = await boundedText(response, controller.signal);
		const value: unknown = JSON.parse(text);
		if (value && typeof value === 'object' && Object.hasOwn(value, 'isSupporter')) {
			const supporter = (value as Record<string, unknown>).isSupporter;
			if (supporter === true) return 'supporter';
			if (supporter === false) return 'required';
		}
		return 'unknown';
	} catch {
		return 'unknown';
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}
