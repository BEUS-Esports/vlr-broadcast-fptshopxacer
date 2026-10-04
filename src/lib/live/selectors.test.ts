import { expect, it } from 'vitest';
import { externalGame, withObservedAgents } from './selectors';
import { liveGameFixture, livePlayerFixture, liveSessionFixture } from './fixtures';
import type { BroadcastSnapshot, BroadcastAgent } from '#lib/broadcast/types.ts';
import type { LiveGameEnvelope } from './types';

const snapshot = {
	selection: { gameId: 'game-1' },
	competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
	lineups: [
		{
			entryId: 'a',
			slot: 1,
			player: { playerId: 'p', displayName: 'Local approved name' },
			agent: null
		}
	]
} as unknown as BroadcastSnapshot;
const state = liveGameFixture({
	teams: [
		{
			providerSide: 'left',
			entryId: 'a',
			observedName: 'Vendor name',
			score: 0,
			attacking: true,
			players: [livePlayerFixture({ playerId: 'p', entryId: 'a', agent: 'Jett' })]
		},
		{
			providerSide: 'right',
			entryId: 'b',
			observedName: null,
			score: 0,
			attacking: false,
			players: []
		}
	]
});
const envelope: LiveGameEnvelope = {
	version: 1,
	stream: { epoch: 'epoch', sequence: 1 },
	state,
	status: liveSessionFixture({ mode: 'external', mappingReady: true })
};
it('requires the same selected game, generation and held identities for external output', () => {
	expect(externalGame(snapshot, envelope)).toBe(state);
	expect(
		externalGame(snapshot, { ...envelope, status: { ...envelope.status, mode: 'native' } })
	).toBeNull();
	expect(
		externalGame(snapshot, { ...envelope, status: { ...envelope.status, generation: 2 } })
	).toBeNull();
	expect(externalGame({ ...snapshot, lineups: [] }, envelope)).toBeNull();
	expect(
		externalGame(snapshot, { ...envelope, state: { ...state, selectedGameId: 'other' } })
	).toBeNull();
});
it('previews current provider data before mapping while program remains native', () => {
	const ready = {
		...envelope,
		status: { ...envelope.status, mode: 'native' as const, health: 'ready' as const }
	};
	expect(externalGame(snapshot, ready, 'preview')).toBe(state);
	expect(externalGame(snapshot, ready, 'program')).toBeNull();
	expect(ready.status.mode).toBe('native');
	for (const health of ['disabled', 'connecting', 'retrying', 'fallback', 'error'] as const)
		expect(
			externalGame(snapshot, { ...ready, status: { ...ready.status, health } }, 'preview')
		).toBe(state);
	for (const status of [
		{ ...ready.status, mappingReady: false },
		{ ...ready.status, selectedGameId: 'other' }
	])
		expect(externalGame(snapshot, { ...ready, status }, 'preview')).toBe(state);
	expect(externalGame({ ...snapshot, selection: null, lineups: [] }, ready, 'preview')).toBe(state);
	expect(externalGame(snapshot, { ...ready, state: null }, 'preview')).toBeNull();
	expect(
		externalGame(snapshot, { ...ready, status: { ...ready.status, generation: 2 } }, 'preview')
	).toBeNull();
	expect(
		externalGame(
			snapshot,
			{ ...ready, status: { ...ready.status, provider: 'spectra' } },
			'preview'
		)
	).toBeNull();
});
it('projects live Agent Select picks without changing local players or saved agents, and falls back when lost', () => {
	const agents = [{ id: 'jett', key: 'jett', displayName: 'Jett' }] as BroadcastAgent[];
	const observed = { ...envelope, state: { ...state, phase: 'agent-select' as const } };
	const projected = withObservedAgents(snapshot, observed, { agents, weapons: [] });
	expect(projected.lineups[0]).toMatchObject({
		player: { displayName: 'Local approved name' },
		agent: { id: 'jett' }
	});
	expect(snapshot.lineups[0].agent).toBeNull();
	expect(withObservedAgents(snapshot, null, { agents, weapons: [] })).toBe(snapshot);
	expect(
		withObservedAgents(
			snapshot,
			{ ...observed, status: { ...observed.status, health: 'fallback' } },
			{ agents, weapons: [] }
		)
	).toBe(snapshot);
});
