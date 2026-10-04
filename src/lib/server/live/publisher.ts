import type { LiveGameEnvelope, LiveGameState, LiveSessionStatus } from '#lib/live/types.ts';
import { isLiveGameEnvelope } from '#lib/live/decoder.ts';

const disabled: LiveSessionStatus = {
	provider: null,
	generation: 0,
	selectedGameId: null,
	health: 'disabled',
	mode: 'native',
	mappingReady: false,
	retryAttempt: 0,
	nextRetryAt: null,
	lastReceivedAt: null,
	lastError: null,
	attribution: 'unknown'
};
export function createLivePublisher(epoch: string = crypto.randomUUID()) {
	let latest: LiveGameEnvelope = {
		version: 1,
		stream: { epoch, sequence: 1 },
		state: null,
		status: disabled
	};
	const subscribers = new Set<(envelope: LiveGameEnvelope) => void>();
	let pending: LiveGameEnvelope | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	function flush() {
		clearTimeout(timer);
		timer = undefined;
		if (!pending) return;
		latest = pending;
		pending = null;
		for (const subscriber of subscribers) {
			try {
				subscriber(latest);
			} catch {
				subscribers.delete(subscriber);
			}
		}
	}
	return {
		publish(state: LiveGameState | null, status: LiveSessionStatus, urgent = false) {
			const next: LiveGameEnvelope = {
				version: 1,
				stream: { epoch, sequence: latest.stream.sequence + 1 },
				state,
				status
			};
			if (!isLiveGameEnvelope(next)) throw new Error('Invalid outgoing live envelope.');
			pending = structuredClone(next);
			if (urgent) flush();
			else timer ??= setTimeout(flush, 100);
		},
		subscribe(subscriber: (envelope: LiveGameEnvelope) => void) {
			subscribers.add(subscriber);
			subscriber(latest);
			return () => {
				subscribers.delete(subscriber);
			};
		},
		getLatest: () => latest,
		dispose() {
			clearTimeout(timer);
			subscribers.clear();
			pending = null;
		}
	};
}
export const livePublisher = createLivePublisher();

export function createLiveResponse(
	publisher: ReturnType<typeof createLivePublisher>,
	signal: AbortSignal
) {
	let cleanup = () => {};
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let ended = false;
			let unsubscribe = () => {};
			let heartbeat: ReturnType<typeof setInterval> | undefined;
			cleanup = () => {
				if (ended) return;
				ended = true;
				unsubscribe();
				clearInterval(heartbeat);
				heartbeat = undefined;
				signal.removeEventListener('abort', cleanup);
				try {
					controller.close();
				} catch {
					/* Already cancelled. */
				}
			};
			const write = (data: string) => {
				if (ended) return;
				if ((controller.desiredSize ?? 0) <= 0) {
					cleanup();
					return;
				}
				try {
					controller.enqueue(encoder.encode(data));
				} catch {
					cleanup();
				}
			};
			signal.addEventListener('abort', cleanup, { once: true });
			if (signal.aborted) {
				cleanup();
				return;
			}
			const stop = publisher.subscribe((envelope) =>
				write(
					`id: ${envelope.stream.epoch}:${envelope.stream.sequence}\nevent: live-game\ndata: ${JSON.stringify(envelope)}\n\n`
				)
			);
			if (ended) {
				stop();
				return;
			}
			unsubscribe = stop;
			heartbeat = setInterval(() => write(': heartbeat\n\n'), 15000);
		},
		cancel() {
			cleanup();
		}
	});
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'content-encoding': 'identity',
			'cache-control': 'no-cache, no-store, no-transform',
			'x-accel-buffering': 'no'
		}
	});
}
