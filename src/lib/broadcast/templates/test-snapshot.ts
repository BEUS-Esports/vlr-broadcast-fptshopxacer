import type { BroadcastSnapshot } from '../types';
import { emptySponsor } from '../sponsor';
import { defaultVisibility, defaultPlayerStats, graphicIds } from '../controls';

/** Test-only fixture: a selected game with teams a/b, partial lineups and one veto pick/ban. */
export const emptyComposite: BroadcastSnapshot['composite'] = {
	visibility: { ...defaultVisibility },
	publications: Object.fromEntries(
		graphicIds.map((id) => [id, null])
	) as BroadcastSnapshot['publications']
};

export function preparedSnapshot(): BroadcastSnapshot {
	const team = (entryId: string) => ({
		entryId,
		teamId: entryId,
		name: `Team ${entryId}`,
		tag: entryId,
		logoPath: null,
		logoWhitePath: null,
		logoBlackPath: null
	});
	const scope = {
		statistics: { scope: 'game' as const, gamesTotal: 0, gamesContributing: 0, players: [] },
		candidates: [],
		mvpPlayerId: null
	};
	const map = {
		id: 'map',
		key: 'map',
		displayName: 'Saved map',
		displayIconPath: null,
		listViewIconPath: null,
		splashPath: null,
		stylizedBackgroundPath: null
	};
	return {
		version: 5,
		controlRevision: 1,
		dataRevision: 1,
		liveControls: {
			swapped: true,
			boothsSwapped: false,
			lineupTeams: 'both',
			currentAttackersEntryId: 'b',
			pause: { type: 'none' },
			ceremony: null
		},
		sponsor: emptySponsor,
		stinger: null,
		publications: Object.fromEntries(
			graphicIds.map((id) => [id, null])
		) as BroadcastSnapshot['publications'],
		composite: emptyComposite,
		selection: { tournamentId: 't', matchId: 'm', gameId: 'g' },
		tournament: null,
		match: null,
		game: {
			id: 'g',
			name: 'Game 1',
			number: 1,
			map,
			scoreA: null,
			scoreB: null,
			resultType: null,
			winnerEntryId: null
		},
		competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
		presentation: { leftEntryId: 'b', rightEntryId: 'a' },
		booths: { booth1EntryId: 'a', booth2EntryId: 'b' },
		sides: {
			preparedAttackersEntryId: 'a',
			preparedDefendersEntryId: 'b',
			attackersEntryId: 'b',
			defendersEntryId: 'a',
			source: 'manual'
		},
		teams: [team('a'), team('b')],
		lineups: [
			{
				entryId: 'a',
				slot: 3,
				player: { playerId: 'p3', displayName: 'Third A', portraitPath: null },
				agent: null
			},
			{
				entryId: 'a',
				slot: 1,
				player: { playerId: 'p1', displayName: 'First A', portraitPath: null },
				agent: {
					id: 'agent',
					key: 'agent',
					displayName: 'Saved agent',
					roleName: null,
					displayIconPath: null,
					fullPortraitPath: null,
					bustPortraitPath: null,
					roleIconPath: null
				}
			},
			{
				entryId: 'b',
				slot: 1,
				player: { playerId: 'pb', displayName: 'First B', portraitPath: null },
				agent: null
			}
		],
		veto: [
			{
				sequence: 2,
				action: 'pick',
				map,
				actingEntryId: 'a',
				gameNumber: 1,
				sideChooserEntryId: 'b',
				sideChoice: 'defense'
			},
			{
				sequence: 1,
				action: 'ban',
				map,
				actingEntryId: 'b',
				gameNumber: null,
				sideChooserEntryId: null,
				sideChoice: null
			}
		],
		scopes: {
			game: scope,
			match: { ...scope, statistics: { ...scope.statistics, scope: 'match' } },
			tournament: { ...scope, statistics: { ...scope.statistics, scope: 'tournament' } }
		},
		controls: {
			visibility: defaultVisibility,
			playerStats: defaultPlayerStats,
			mvpScope: 'game',
			mvpFields: [...defaultPlayerStats.fields]
		},
		readiness: { selected: true, map: true, lineups: false, agents: false, result: false }
	};
}
