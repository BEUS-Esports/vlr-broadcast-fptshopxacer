import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveCoordinator, type ProviderCallbacks } from './coordinator';
import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import type { LiveGameState } from '#lib/live/types.ts';

const binding = (id = 'game') =>
	({
		selection: { gameId: id },
		competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
		teams: [
			{ entryId: 'a', name: 'Alpha', tag: 'A' },
			{ entryId: 'b', name: 'Bravo', tag: 'B' }
		],
		lineups: []
	}) as unknown as BroadcastPreparedSnapshot;
const observation = (generation: number): LiveGameState => ({
	version: 1,
	provider: 'gstack',
	generation,
	selectedGameId: 'game',
	phase: 'unknown',
	roundNumber: null,
	map: null,
	spike: { state: 'unknown', carrierPlayerId: null, carrierRaw: null, raw: null },
	teams: ['left', 'right'].map((side) => ({
		providerSide: side as 'left' | 'right',
		entryId: null,
		observedName: null,
		score: 0,
		attacking: null,
		players: []
	})),
	rounds: [],
	roundHistory: { leftRaw: null, rightRaw: null },
	receivedAt: Date.now()
});
const mapping = {
	teams: [
		{ providerSide: 'left', entryId: 'a' },
		{ providerSide: 'right', entryId: 'b' }
	],
	players: []
};
function setup() {
	const sessions: ProviderCallbacks[] = [];
	const stops = vi.fn();
	const publish = vi.fn();
	const coordinator = createLiveCoordinator({
		start: (_provider, callbacks) => {
			sessions.push(callbacks);
			return stops;
		},
		publish
	});
	coordinator.bind(binding());
	coordinator.connect('gstack');
	return { coordinator, sessions, stops, publish };
}
afterEach(() => vi.useRealTimers());
describe('server-owned live provider session', () => {
	it('rejects external mode until game and team identity are confirmed', () => {
		const { coordinator, sessions } = setup();
		sessions[0].data(observation(coordinator.getStatus().generation));
		expect(() => coordinator.enableExternal()).toThrow(/mapping/i);
		coordinator.confirmMapping(mapping, coordinator.getStatus().generation);
		coordinator.enableExternal();
		expect(coordinator.getStatus().mode).toBe('external');
		coordinator.dispose();
	});
	it('uses 1/2/4/8 retries then sticky native fallback and bounded recovery', () => {
		vi.useFakeTimers();
		const { coordinator, sessions } = setup();
		sessions[0].data(observation(coordinator.getStatus().generation));
		coordinator.confirmMapping(mapping, coordinator.getStatus().generation);
		coordinator.enableExternal();
		sessions[0].error('Disconnected');
		for (const delay of [1000, 2000, 4000, 8000]) {
			const count = sessions.length;
			vi.advanceTimersByTime(delay - 1);
			expect(sessions).toHaveLength(count);
			vi.advanceTimersByTime(1);
			expect(sessions).toHaveLength(count + 1);
			sessions.at(-1)!.error('Disconnected');
		}
		expect(coordinator.getStatus()).toMatchObject({ health: 'fallback', mode: 'native' });
		vi.advanceTimersByTime(8000);
		sessions.at(-1)!.data(observation(coordinator.getStatus().generation));
		expect(coordinator.getStatus()).toMatchObject({
			health: 'ready',
			mode: 'native',
			mappingReady: true
		});
		coordinator.enableExternal();
		expect(coordinator.getStatus()).toMatchObject({ health: 'live', mode: 'external' });
		coordinator.dispose();
	});
	it('rejects old generation and old attempt callbacks, without reconnecting for subscribers', () => {
		vi.useFakeTimers();
		const { coordinator, sessions } = setup();
		const retired = sessions[0];
		retired.error('Disconnected');
		vi.advanceTimersByTime(1000);
		retired.data(observation(coordinator.getStatus().generation));
		expect(coordinator.getState()).toBeNull();
		coordinator.bind(binding('other-game'));
		sessions[1].data(observation(coordinator.getStatus().generation - 1));
		expect(coordinator.getState()).toBeNull();
		expect(coordinator.getStatus()).toMatchObject({
			mode: 'native',
			selectedGameId: 'other-game',
			mappingReady: false
		});
		coordinator.dispose();
	});
	it('keeps manual fallback native even after healthy data arrives', () => {
		const { coordinator, sessions } = setup();
		sessions[0].data(observation(coordinator.getStatus().generation));
		coordinator.confirmMapping(mapping, coordinator.getStatus().generation);
		coordinator.enableExternal();
		coordinator.useNative();
		sessions[0].data(observation(coordinator.getStatus().generation));
		expect(coordinator.getStatus()).toMatchObject({ health: 'ready', mode: 'native' });
		coordinator.dispose();
	});
});
