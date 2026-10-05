import {
	decodeBroadcastEnvelope,
	type BroadcastSnapshot,
	type BroadcastStreamCursor
} from './types';

/** A server wall-clock sample advanced only by the browser's monotonic clock. */
export type BroadcastClock = { now: () => number };

export type BroadcastClientState = {
	connection: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
	snapshot: BroadcastSnapshot | null;
	cursor: BroadcastStreamCursor | null;
	clock: BroadcastClock | null;
};
type Source = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
	close: () => void;
	readonly readyState: number;
};

/** Create once per output/controller, connect on mount, disconnect on destroy. Native SSE owns retry. */
export function createBroadcastClient(
	options: { url?: string; eventSource?: (url: string) => Source } = {}
) {
	let state: BroadcastClientState = {
		connection: 'disconnected',
		snapshot: null,
		cursor: null,
		clock: null
	};
	let source: Source | null = null;
	const subscribers = new Set<(state: BroadcastClientState) => void>();
	function notify() {
		for (const subscriber of subscribers) subscriber(state);
	}
	function connection(value: BroadcastClientState['connection']) {
		state = { ...state, connection: value };
		notify();
	}
	const open = () => connection('connected');
	const error = () => (source?.readyState === 2 ? disconnect() : connection('reconnecting'));
	const clock = (event: Event) => {
		const data = (event as MessageEvent).data;
		if (typeof data !== 'string') return;
		let serverTime: unknown;
		try {
			serverTime = JSON.parse(data);
		} catch {
			return;
		}
		if (typeof serverTime !== 'number' || !Number.isSafeInteger(serverTime) || serverTime < 0)
			return;
		const receivedAt = performance.now();
		// ponytail: sampling includes one-way LAN latency; use RTT probes if tighter timing is needed.
		state = { ...state, clock: { now: () => serverTime + performance.now() - receivedAt } };
		notify();
	};
	const message = (event: Event) => {
		const data = (event as MessageEvent).data;
		if (typeof data !== 'string') return;
		const envelope = decodeBroadcastEnvelope(data);
		if (!envelope) return;
		if (
			state.cursor &&
			envelope.stream.epoch === state.cursor.epoch &&
			envelope.stream.sequence <= state.cursor.sequence
		)
			return;
		// A different epoch means the server process restarted; its sequence legitimately restarts.
		state = { ...state, snapshot: envelope.snapshot, cursor: envelope.stream };
		notify();
	};
	function disconnect() {
		source?.removeEventListener('open', open);
		source?.removeEventListener('error', error);
		source?.removeEventListener('snapshot', message);
		source?.removeEventListener('clock', clock);
		source?.close();
		source = null;
		connection('disconnected');
	}
	return {
		getState: () => state,
		subscribe(subscriber: (state: BroadcastClientState) => void) {
			subscribers.add(subscriber);
			subscriber(state);
			return () => {
				subscribers.delete(subscriber);
			};
		},
		connect() {
			if (source) return;
			connection('connecting');
			try {
				source = (options.eventSource ?? ((url) => new EventSource(url)))(
					options.url ?? '/api/broadcast/events'
				);
				source.addEventListener('open', open);
				source.addEventListener('error', error);
				source.addEventListener('snapshot', message);
				source.addEventListener('clock', clock);
			} catch {
				disconnect();
			}
		},
		disconnect
	};
}
