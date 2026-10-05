import type {
	BroadcastEnvelope,
	BroadcastSnapshot,
	BroadcastStreamCursor
} from '#lib/broadcast/types.ts';
import { buildBroadcastSnapshot } from './snapshot';

type Subscriber = {
	send: (snapshot: BroadcastSnapshot, stream: BroadcastStreamCursor) => void;
	close: () => void;
};

function samePersistedRevision(a: BroadcastSnapshot, b: BroadcastSnapshot) {
	return a.controlRevision === b.controlRevision && a.dataRevision === b.dataRevision;
}

export function createBroadcastPublisher(dependencies: {
	build: () => Promise<BroadcastSnapshot>;
	epoch?: string;
}) {
	const epoch = dependencies.epoch ?? crypto.randomUUID();
	let sequence = 0;
	let latest: { snapshot: BroadcastSnapshot; stream: BroadcastStreamCursor } | null = null;
	let queue: Promise<unknown> = Promise.resolve();
	const subscribers = new Set<Subscriber>();
	const remove = (subscriber: Subscriber) => {
		subscribers.delete(subscriber);
		try {
			subscriber.close();
		} catch {
			/* Already disconnected. */
		}
	};
	const send = (
		subscriber: Subscriber,
		current: { snapshot: BroadcastSnapshot; stream: BroadcastStreamCursor }
	) => {
		try {
			subscriber.send(current.snapshot, current.stream);
		} catch {
			remove(subscriber);
		}
	};
	function serialize<T>(operation: () => Promise<T>): Promise<T> {
		const next = queue.then(operation);
		queue = next.catch(() => {});
		return next;
	}
	function next(snapshot: BroadcastSnapshot) {
		latest = { snapshot, stream: { epoch, sequence: ++sequence } };
		return latest;
	}
	async function refresh(force: boolean) {
		try {
			const snapshot = await dependencies.build();
			if (!latest || force || !samePersistedRevision(snapshot, latest.snapshot)) {
				const current = next(snapshot);
				for (const subscriber of subscribers) send(subscriber, current);
			}
			return latest!;
		} catch (cause) {
			// Reconnect must rebuild even when a failed volatile/provider update did not
			// change either persisted revision.
			latest = null;
			for (const subscriber of subscribers) remove(subscriber);
			throw cause;
		}
	}
	return {
		/**
		 * Normal publications deduplicate unchanged persisted revisions.
		 * Volatile live telemetry is published independently by server/live/publisher.ts.
		 */
		publish(options: { force?: boolean } = {}) {
			return serialize(async () => (await refresh(options.force ?? false)).snapshot);
		},
		subscribe(subscriber: Subscriber) {
			return serialize(async () => {
				const current = await refresh(false);
				subscribers.add(subscriber);
				send(subscriber, current);
				return () => {
					subscribers.delete(subscriber);
				};
			});
		}
	};
}

// ponytail: one Node process owns publication; add shared pub/sub before running multiple workers.
export const broadcastPublisher = createBroadcastPublisher({
	build: buildBroadcastSnapshot
});

export function createBroadcastResponse(
	publisher: ReturnType<typeof createBroadcastPublisher>,
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
				signal.removeEventListener('abort', cleanup);
				try {
					controller.close();
				} catch {
					/* Stream cancelled. */
				}
			};
			function write(data: string) {
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
			}
			signal.addEventListener('abort', cleanup, { once: true });
			// Stamp at send time, including cached reconnects; keep time outside persisted snapshots/cursors.
			const clock = () => `event: clock\ndata: ${Date.now()}\n\n`;
			if (signal.aborted) {
				cleanup();
				return;
			}
			void publisher
				.subscribe({
					send: (snapshot, stream) => {
						const envelope: BroadcastEnvelope = { version: 1, stream, snapshot };
						const data = JSON.stringify(envelope);
						write(
							`${clock()}id: ${stream.epoch}:${stream.sequence}\nevent: snapshot\ndata: ${data}\n\n`
						);
					},
					close: () => cleanup()
				})
				.then((stop) => {
					if (ended) {
						stop();
						return;
					}
					unsubscribe = stop;
					heartbeat = setInterval(() => write(clock()), 15000);
				})
				.catch(() => cleanup());
		},
		cancel() {
			cleanup();
		}
	});
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			// Prevent compression middleware from buffering a never-ending SSE response.
			'content-encoding': 'identity',
			'cache-control': 'no-cache, no-store, no-transform',
			'x-accel-buffering': 'no'
		}
	});
}
