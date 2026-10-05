import { expect, it } from 'vitest';
import { applyMapping, validateMapping } from './mapping';
import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import type { LiveGameState, LivePlayerState } from '#lib/live/types.ts';

const snapshot = {
	selection: { gameId: 'g' },
	competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
	lineups: [
		{ entryId: 'a', player: { playerId: 'pa', displayName: 'A' } },
		{ entryId: 'b', player: { playerId: 'pb', displayName: 'B' } }
	]
} as unknown as BroadcastPreparedSnapshot;
const state = {
	selectedGameId: 'g',
	spike: { carrierPlayerId: null },
	teams: [
		{
			providerSide: 'left',
			observedName: 'Alpha',
			players: [{ providerKey: 'left:1', observedName: 'A' } as LivePlayerState]
		},
		{
			providerSide: 'right',
			observedName: 'Bravo',
			players: [{ providerKey: 'right:1', observedName: 'B' } as LivePlayerState]
		}
	]
} as LiveGameState;
const input = {
	teams: [
		{ providerSide: 'left', entryId: 'a' },
		{ providerSide: 'right', entryId: 'b' }
	],
	players: [
		{ providerKey: 'left:1', playerId: 'pa' },
		{ providerKey: 'right:1', playerId: 'pb' }
	]
};
it('joins explicit provider slots to local identity and rejects cross-team/duplicate ownership', () => {
	const mapping = validateMapping(state, snapshot, input);
	expect(applyMapping(state, snapshot, mapping)).toMatchObject({
		ready: true,
		state: {
			teams: [
				{ entryId: 'a', players: [{ playerId: 'pa', entryId: 'a' }] },
				{ entryId: 'b', players: [{ playerId: 'pb', entryId: 'b' }] }
			]
		}
	});
	expect(() =>
		validateMapping(state, snapshot, {
			...input,
			players: [{ providerKey: 'left:1', playerId: 'pb' }]
		})
	).toThrow();
	expect(() =>
		validateMapping(state, snapshot, {
			...input,
			teams: input.teams.map((t) => ({ ...t, entryId: 'a' }))
		})
	).toThrow();
});
it('invalidates changed slot identities and changed saved lineup instead of relabeling them', () => {
	const mapping = validateMapping(state, snapshot, input);
	const changed = structuredClone(state);
	changed.teams[0].players[0].observedName = 'Different player';
	expect(applyMapping(changed, snapshot, mapping).ready).toBe(false);
	expect(applyMapping(state, { ...snapshot, lineups: [] }, mapping).ready).toBe(false);
	expect(applyMapping(state, { ...snapshot, selection: null }, mapping).ready).toBe(false);
});
it('checks Spectra fallback-slot names while retaining stable-ID mapping across display-name changes', () => {
	const fallback = { ...state, provider: 'spectra' as const };
	const mapping = validateMapping(fallback, snapshot, input);
	const replacement = structuredClone(fallback);
	replacement.teams[0].players[0].observedName = 'Different player';
	expect(applyMapping(replacement, snapshot, mapping).ready).toBe(false);
	const stable = structuredClone(fallback);
	stable.teams[0].players[0].providerKey = 'id:riot-identity';
	const stableInput = { ...input, players: [{ providerKey: 'id:riot-identity', playerId: 'pa' }] };
	const confirmed = validateMapping(stable, snapshot, stableInput);
	stable.teams[0].players[0].observedName = 'Renamed player';
	expect(applyMapping(stable, snapshot, confirmed).ready).toBe(true);
});
