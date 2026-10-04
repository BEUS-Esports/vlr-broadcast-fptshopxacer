import { decodeLiveGameEnvelope } from './decoder';
import type { LiveGameEnvelope } from './types';

/** Browsers own only an application SSE subscription, never an upstream provider. */
export function createLiveClient() {
	let source: EventSource | null = null;
	let latest: LiveGameEnvelope | null = null;
	const subscribers = new Set<(envelope: LiveGameEnvelope | null) => void>();
	const notify = () => {
		for (const subscriber of subscribers) subscriber(latest);
	};
	return {
		getState: () => latest,
		subscribe(subscriber: (envelope: LiveGameEnvelope | null) => void) {
			subscribers.add(subscriber);
			subscriber(latest);
			return () => {
				subscribers.delete(subscriber);
			};
		},
		connect() {
			if (source) return;
			source = new EventSource('/api/live-game/events');
			source.addEventListener('live-game', (event) => {
				const next = decodeLiveGameEnvelope((event as MessageEvent<string>).data);
				if (
					!next ||
					(latest?.stream.epoch === next.stream.epoch &&
						latest.stream.sequence >= next.stream.sequence)
				)
					return;
				latest = next;
				notify();
			});
			// An unavailable application stream must stop presenting stale external telemetry.
			source.onerror = () => {
				latest = null;
				notify();
			};
		},
		disconnect() {
			source?.close();
			source = null;
			latest = null;
			notify();
		}
	};
}
