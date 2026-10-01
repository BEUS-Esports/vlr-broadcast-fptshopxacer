import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
import { buildBroadcastSnapshot } from './snapshot';

type Subscriber = { send: (snapshot: BroadcastSnapshot) => void; close: () => void };

export function createBroadcastPublisher(dependencies: {
	build: () => Promise<BroadcastSnapshot>;
}) {
	let latest: BroadcastSnapshot | null = null;
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
	const send = (subscriber: Subscriber, snapshot: BroadcastSnapshot) => {
		try {
			subscriber.send(snapshot);
		} catch {
			remove(subscriber);
		}
	};
	function serialize<T>(operation: () => Promise<T>): Promise<T> {
		const next = queue.then(operation);
		queue = next.catch(() => {});
		return next;
	}
	async function refresh() {
		try {
			const snapshot = await dependencies.build();
			if (!latest || snapshot.revision > latest.revision) {
				latest = snapshot;
				for (const subscriber of subscribers) send(subscriber, snapshot);
			}
			return latest;
		} catch (cause) {
			// Force browser-native reconnect to rebuild persisted state after a failed publication.
			for (const subscriber of subscribers) remove(subscriber);
			throw cause;
		}
	}
	return {
		publish() {
			return serialize(refresh);
		},
		subscribe(subscriber: Subscriber) {
			return serialize(async () => {
				const snapshot = await refresh();
				subscribers.add(subscriber);
				send(subscriber, snapshot);
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
			if (signal.aborted) {
				cleanup();
				return;
			}
			void publisher
				.subscribe({
					send: (snapshot) =>
						write(
							`id: ${snapshot.revision}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
						),
					close: () => cleanup()
				})
				.then((stop) => {
					if (ended) {
						stop();
						return;
					}
					unsubscribe = stop;
					heartbeat = setInterval(() => write(': heartbeat\n\n'), 15000);
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
