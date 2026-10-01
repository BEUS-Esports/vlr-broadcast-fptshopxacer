import {
	decodeBroadcastEnvelope,
	type BroadcastSnapshot,
	type BroadcastStreamCursor
} from './types';

export type BroadcastClientState = {
	connection: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
	snapshot: BroadcastSnapshot | null;
	cursor: BroadcastStreamCursor | null;
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
		cursor: null
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
			} catch {
				disconnect();
			}
		},
		disconnect
	};
}
