import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import type { LiveGameState, LiveProviderId, LiveSessionStatus } from '#lib/live/types.ts';
import { isLiveGameState } from '#lib/live/decoder.ts';
import { applyMapping, validateMapping, type LiveMapping } from './mapping';

export type ProviderCallbacks = {
	data: (state: LiveGameState) => void;
	error: (message: string) => void;
	parseError: (message: string) => void;
	diagnostic: (data: unknown) => void;
	connected: () => void;
};
export function createLiveCoordinator(dependencies: {
	start: (provider: LiveProviderId, callbacks: ProviderCallbacks, generation: number) => () => void;
	publish: (state: LiveGameState | null, status: LiveSessionStatus, urgent: boolean) => void;
}) {
	let status: LiveSessionStatus = {
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
	let binding: BroadcastPreparedSnapshot | null = null;
	let state: LiveGameState | null = null;
	let observation: LiveGameState | null = null;
	let mapping: LiveMapping | null = null;
	let raw: unknown = null;
	let stop: (() => void) | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let attempt = 0;
	let malformed = 0;
	const publish = (urgent = true) => dependencies.publish(state, { ...status }, urgent);
	function retire() {
		++attempt;
		clearTimeout(timer);
		timer = undefined;
		const cleanup = stop;
		stop = undefined;
		cleanup?.();
	}
	function remap() {
		if (!observation) {
			status.mappingReady = false;
			return;
		}
		const result = applyMapping(observation, binding, mapping);
		state = result.state;
		status.mappingReady = result.ready;
		if (!result.ready && status.mode === 'external') status.mode = 'native';
	}
	function failed(message: string) {
		retire();
		status.lastError = message.slice(0, 512);
		const fallback = status.retryAttempt >= 4;
		if (fallback) status.mode = 'native';
		status.health = fallback ? 'fallback' : 'retrying';
		const delay = [1000, 2000, 4000, 8000][Math.min(status.retryAttempt, 3)];
		status.nextRetryAt = Date.now() + delay;
		const generation = status.generation;
		const token = attempt;
		timer = setTimeout(() => {
			if (status.generation !== generation || attempt !== token || !status.provider) return;
			status.retryAttempt++;
			begin();
		}, delay);
		publish();
	}
	function begin() {
		if (!status.provider) return;
		retire();
		const generation = status.generation;
		const token = attempt;
		const active = () => generation === status.generation && token === attempt;
		status.nextRetryAt = null;
		malformed = 0;
		publish();
		try {
			const cleanup = dependencies.start(
				status.provider,
				{
					connected() {
						if (active()) publish();
					},
					diagnostic(data) {
						if (active()) raw = data;
					},
					data(next) {
						if (!active()) return;
						if (
							!isLiveGameState(next) ||
							next.provider !== status.provider ||
							next.generation !== generation ||
							next.selectedGameId !== status.selectedGameId
						) {
							parseError('Invalid or obsolete normalized provider state.');
							return;
						}
						malformed = 0;
						clearTimeout(timer);
						// Event-driven feeds may be quiet; request a fresh snapshot before declaring failure.
						timer = setTimeout(() => {
							if (active()) begin();
						}, 30_000);
						observation = next;
						status.retryAttempt = 0;
						status.lastReceivedAt = next.receivedAt;
						status.lastError = null;
						remap();
						status.health = status.mode === 'external' ? 'live' : 'ready';
						publish(false);
					},
					error(message) {
						if (active()) failed(message);
					},
					parseError(message) {
						if (active()) parseError(message);
					}
				},
				generation
			);
			if (active()) stop = cleanup;
			else cleanup();
		} catch {
			if (active()) failed('Could not open the provider session. Check Settings and retry.');
		}
	}
	function parseError(message: string) {
		status.lastError = message.slice(0, 512);
		if (++malformed >= 3) failed('Repeated malformed provider data. Inspect View Data.');
		else publish();
	}
	function reset(provider: LiveProviderId | null) {
		retire();
		status = {
			...status,
			provider,
			generation: status.generation + 1,
			health: provider ? 'connecting' : 'disabled',
			mode: 'native',
			mappingReady: false,
			retryAttempt: 0,
			nextRetryAt: null,
			lastReceivedAt: null,
			lastError: null,
			attribution: 'unknown'
		};
		state = observation = null;
		raw = null;
		mapping = null;
		publish();
		if (provider) begin();
	}
	return {
		getStatus: () => ({ ...status }),
		getState: () => state,
		getMapping: () => mapping,
		getRaw: () => raw,
		bind(next: BroadcastPreparedSnapshot | null) {
			const gameId = next?.selection?.gameId ?? null;
			binding = next;
			if (gameId !== status.selectedGameId) {
				status.selectedGameId = gameId;
				reset(status.provider);
			} else {
				remap();
				publish();
			}
		},
		connect(provider: LiveProviderId) {
			reset(provider);
		},
		disconnect() {
			reset(null);
		},
		confirmMapping(input: unknown, generation: number) {
			if (generation !== status.generation)
				throw new Error('Provider session changed. Review current mapping again.');
			if (!observation || !binding)
				throw new Error('Receive provider data and select a local game before mapping.');
			mapping = validateMapping(observation, binding, input);
			remap();
			publish();
		},
		enableExternal() {
			if (!state || !status.mappingReady || !status.selectedGameId)
				throw new Error(
					'Confirm the selected game and provider team mapping before enabling live.'
				);
			if (!['ready', 'live'].includes(status.health))
				throw new Error('Wait for a healthy provider before enabling live.');
			status.mode = 'external';
			status.health = 'live';
			publish();
		},
		useNative() {
			status.mode = 'native';
			if (status.health === 'live') status.health = 'ready';
			publish();
		},
		setAttribution(value: LiveSessionStatus['attribution'], generation: number) {
			if (generation !== status.generation) return;
			status.attribution = value;
			publish();
		},
		dispose() {
			retire();
		}
	};
}
