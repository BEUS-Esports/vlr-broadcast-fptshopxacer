import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveCoordinator, type ProviderCallbacks } from './coordinator';
import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import type { LiveGamePhase, LiveGameState, LiveProviderId } from '#lib/live/types.ts';

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
function setup(provider: LiveProviderId = 'gstack') {
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
	coordinator.connect(provider);
	return { coordinator, sessions, stops, publish };
}
afterEach(() => vi.useRealTimers());
describe('server-owned live provider session', () => {
	it('keeps Spectra organization attribution after disconnect and provider changes', () => {
		const { coordinator, publish } = setup('spectra');
		coordinator.setSpectraAttribution('supporter');
		expect(coordinator.getStatus()).toMatchObject({
			attribution: 'supporter',
			spectraAttribution: 'supporter'
		});
		coordinator.disconnect();
		expect(coordinator.getStatus()).toMatchObject({
			provider: null,
			spectraAttribution: 'supporter'
		});
		coordinator.connect('gstack');
		expect(coordinator.getStatus().spectraAttribution).toBe('supporter');
		coordinator.setSpectraAttribution('required');
		expect(publish.mock.calls.at(-1)?.[1].spectraAttribution).toBe('required');
		coordinator.dispose();
	});
	it.each(['spectra', 'gstack'] as const)(
		'resynchronizes quiet %s sessions without treating unchanged statistics or phases as failure',
		(provider) => {
			vi.useFakeTimers();
			const { coordinator, sessions, stops } = setup(provider);
			try {
				const next = () => ({ ...observation(coordinator.getStatus().generation), provider });
				sessions[0].data(next());
				coordinator.confirmMapping(mapping, coordinator.getStatus().generation);
				coordinator.enableExternal();
				const phases: LiveGamePhase[] = [
					'unknown',
					'lobby',
					'agent-select',
					'buy',
					'combat',
					'post-round',
					'game-end'
				];
				for (const phase of phases) {
					const previous = sessions.at(-1)!;
					previous.data({ ...next(), phase });
					const count = sessions.length;
					vi.advanceTimersByTime(30_000);
					expect(sessions).toHaveLength(count + 1);
					expect(stops).toHaveBeenCalledTimes(count);
					previous.error('Retired session');
					sessions.at(-1)!.data({ ...next(), phase });
					expect(coordinator.getStatus()).toMatchObject({
						health: 'live',
						mode: 'external',
						mappingReady: true,
						retryAttempt: 0,
						lastError: null,
						lastReceivedAt: Date.now()
					});
				}
			} finally {
				coordinator.dispose();
			}
		}
	);
	it('postpones idle resynchronization only for valid current observations', () => {
		vi.useFakeTimers();
		const { coordinator, sessions } = setup();
		try {
			sessions[0].data(observation(coordinator.getStatus().generation));
			vi.advanceTimersByTime(29_000);
			sessions[0].data(observation(coordinator.getStatus().generation));
			vi.advanceTimersByTime(1000);
			expect(sessions).toHaveLength(1);
			sessions[0].data(observation(coordinator.getStatus().generation - 1));
			vi.advanceTimersByTime(29_000);
			expect(sessions).toHaveLength(2);
		} finally {
			coordinator.dispose();
		}
	});
	it.each(['disconnect', 'dispose', 'change game'])(
		'cancels pending idle resynchronization on %s',
		(action) => {
			vi.useFakeTimers();
			const { coordinator, sessions } = setup();
			sessions[0].data(observation(coordinator.getStatus().generation));
			if (action === 'change game') coordinator.bind(binding('other-game'));
			else if (action === 'disconnect') coordinator.disconnect();
			else coordinator.dispose();
			const count = sessions.length;
			vi.advanceTimersByTime(60_000);
			expect(sessions).toHaveLength(count);
			expect(vi.getTimerCount()).toBe(0);
			coordinator.dispose();
		}
	);
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
