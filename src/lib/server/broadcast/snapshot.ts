import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import * as s from '#lib/server/db/schema/index.ts';
import type { BroadcastMap, BroadcastSnapshot, BroadcastScopeView } from '#lib/broadcast/types.ts';
import { broadcastScopes } from '#lib/broadcast/controls.ts';
import { aggregateStatistics, loadStatisticsGames } from '../services/statistics-aggregation';
import { deriveSeriesResult } from '../services/series-results';

const mapFields = {
	id: s.maps.id,
	key: s.maps.key,
	displayName: s.maps.displayName,
	displayIconPath: s.maps.displayIconPath,
	listViewIconPath: s.maps.listViewIconPath,
	splashPath: s.maps.splashPath,
	stylizedBackgroundPath: s.maps.stylizedBackgroundPath
};
const playerFields = {
	playerId: s.players.id,
	displayName: s.players.displayName,
	portraitPath: s.players.portraitPath
};
const agentFields = {
	id: s.agents.id,
	key: s.agents.key,
	displayName: s.agents.displayName,
	roleName: s.agents.roleName,
	displayIconPath: s.agents.displayIconPath,
	fullPortraitPath: s.agents.fullPortraitPath,
	bustPortraitPath: s.agents.bustPortraitPath,
	roleIconPath: s.agents.roleIconPath
};

/** One database transaction owns every read, including Phase 4 statistics aggregation inputs. */
export async function buildBroadcastSnapshot(): Promise<BroadcastSnapshot> {
	await db.insert(s.broadcastState).values({ id: 1 }).onConflictDoNothing();
	return db.transaction(async (tx) => {
		const [state] = await tx.select().from(s.broadcastState).where(eq(s.broadcastState.id, 1));
		const snapshot: BroadcastSnapshot = {
			version: 1,
			revision: state.revision,
			selection: null,
			tournament: null,
			match: null,
			game: null,
			competition: { teamAEntryId: null, teamBEntryId: null },
			presentation: { leftEntryId: null, rightEntryId: null },
			sides: {
				preparedAttackersEntryId: null,
				preparedDefendersEntryId: null,
				attackersEntryId: null,
				defendersEntryId: null,
				source: 'unknown'
			},
			teams: [],
			lineups: [],
			veto: [],
			scopes: {
				game: emptyScope('game'),
				match: emptyScope('match'),
				tournament: emptyScope('tournament')
			},
			controls: {
				visibility: state.visibility,
				playerStats: state.playerStats,
				mvpScope: state.mvpScope
			},
			readiness: { selected: false, map: false, lineups: false, agents: false, result: false }
		};
		if (!state.selectedGameId) return snapshot;
		const [selected] = await tx
			.select({ game: s.games, match: s.matches, tournament: s.tournaments })
			.from(s.games)
			.innerJoin(s.matches, eq(s.games.matchId, s.matches.id))
			.innerJoin(s.tournaments, eq(s.matches.tournamentId, s.tournaments.id))
			.where(eq(s.games.id, state.selectedGameId));
		if (!selected) return snapshot;
		const { game, match, tournament } = selected;
		const allGames = await tx
			.select({ game: s.games })
			.from(s.games)
			.innerJoin(s.matches, eq(s.games.matchId, s.matches.id))
			.where(eq(s.matches.tournamentId, tournament.id))
			.orderBy(asc(s.games.matchId), asc(s.games.number));
		const gameRows = allGames.map((row) => row.game);
		const appearances = await tx
			.select({
				gameId: s.gameLineups.gameId,
				entryId: s.gameLineups.entryId,
				slot: s.gameLineups.slot,
				player: playerFields,
				agent: agentFields
			})
			.from(s.gameLineups)
			.leftJoin(s.players, eq(s.gameLineups.playerId, s.players.id))
			.leftJoin(s.agents, eq(s.gameLineups.agentId, s.agents.id))
			.where(
				inArray(
					s.gameLineups.gameId,
					gameRows.map((row) => row.id)
				)
			)
			.orderBy(asc(s.gameLineups.entryId), asc(s.gameLineups.slot), asc(s.gameLineups.gameId));
		const statisticsGames = await loadStatisticsGames(gameRows, tx);
		for (const scope of broadcastScopes) {
			const scopedGames = gameRows.filter(
				(row) =>
					scope === 'tournament' ||
					(scope === 'match' ? row.matchId === match.id : row.id === game.id)
			);
			const ids = new Set(scopedGames.map((row) => row.id));
			const candidates = new Map<string, BroadcastScopeView['candidates'][number]>();
			for (const row of appearances) {
				if (!ids.has(row.gameId) || !row.player) continue;
				let candidate = candidates.get(row.player.playerId);
				if (!candidate) {
					candidate = { ...row.player, entryIds: [] };
					candidates.set(candidate.playerId, candidate);
				}
				if (!candidate.entryIds.includes(row.entryId)) candidate.entryIds.push(row.entryId);
			}
			snapshot.scopes[scope] = {
				statistics: aggregateStatistics(
					scope,
					statisticsGames.filter((row) => ids.has(row.id))
				),
				candidates: [...candidates.values()].sort((a, b) => a.playerId.localeCompare(b.playerId)),
				mvpPlayerId: (scope === 'game' ? game : scope === 'match' ? match : tournament).mvpPlayerId
			};
		}
		snapshot.selection = { tournamentId: tournament.id, matchId: match.id, gameId: game.id };
		snapshot.tournament = { id: tournament.id, name: tournament.name, slug: tournament.slug };
		const series = deriveSeriesResult({
			bestOf: match.bestOf as 1 | 2 | 3 | 5,
			teamAEntryId: match.teamAEntryId,
			teamBEntryId: match.teamBEntryId,
			games: gameRows.filter((row) => row.matchId === match.id)
		});
		snapshot.match = {
			id: match.id,
			label: match.label,
			bestOf: match.bestOf,
			resultType: match.resultType,
			winnerEntryId: match.winnerEntryId,
			scoreA: series.winsA,
			scoreB: series.winsB
		};
		let map: BroadcastMap | null = null;
		if (game.mapId)
			[map] = await tx.select(mapFields).from(s.maps).where(eq(s.maps.id, game.mapId));
		snapshot.game = {
			id: game.id,
			name: game.name,
			number: game.number,
			map: map ?? null,
			scoreA: game.scoreA,
			scoreB: game.scoreB,
			resultType: game.resultType,
			winnerEntryId: game.winnerEntryId
		};
		snapshot.competition = { teamAEntryId: match.teamAEntryId, teamBEntryId: match.teamBEntryId };
		snapshot.presentation = {
			leftEntryId: state.swapped ? match.teamBEntryId : match.teamAEntryId,
			rightEntryId: state.swapped ? match.teamAEntryId : match.teamBEntryId
		};
		const attackers = state.currentAttackersEntryId ?? game.startingAttackersEntryId;
		snapshot.sides = {
			preparedAttackersEntryId: game.startingAttackersEntryId,
			preparedDefendersEntryId: game.startingDefendersEntryId,
			attackersEntryId: attackers,
			defendersEntryId:
				attackers === null
					? null
					: attackers === match.teamAEntryId
						? match.teamBEntryId
						: match.teamAEntryId,
			source: state.currentAttackersEntryId ? 'manual' : attackers ? 'prepared' : 'unknown'
		};
		const matchEntryIds = [match.teamAEntryId, match.teamBEntryId];
		const entryIds = [
			...new Set([
				...matchEntryIds,
				...snapshot.scopes.tournament.candidates.flatMap((player) => player.entryIds).sort()
			])
		];
		snapshot.teams = await tx
			.select({
				entryId: s.tournamentEntries.id,
				teamId: s.teams.id,
				name: s.teams.name,
				tag: s.teams.tag,
				logoPath: s.teams.logoPath,
				logoWhitePath: s.teams.logoWhitePath,
				logoBlackPath: s.teams.logoBlackPath
			})
			.from(s.tournamentEntries)
			.innerJoin(s.teams, eq(s.tournamentEntries.teamId, s.teams.id))
			.where(
				and(
					eq(s.tournamentEntries.tournamentId, tournament.id),
					inArray(s.tournamentEntries.id, entryIds)
				)
			);
		// ponytail: linear rank lookups suit tournament-sized lists; use a rank Map for large entry sets.
		// ponytail: linear rank lookups suit tournament-sized lists; use a rank Map for large entry sets.
		snapshot.teams.sort((a, b) => entryIds.indexOf(a.entryId) - entryIds.indexOf(b.entryId));
		snapshot.lineups = appearances
			.filter((row) => row.gameId === game.id)
			.map((row) => ({
				entryId: row.entryId,
				slot: row.slot,
				player: row.player,
				agent: row.agent
			}));
		snapshot.veto = await tx
			.select({
				sequence: s.matchVetoActions.sequence,
				action: s.matchVetoActions.action,
				map: mapFields,
				actingEntryId: s.matchVetoActions.actingEntryId,
				gameNumber: s.matchVetoActions.gameNumber,
				sideChooserEntryId: s.matchVetoActions.sideChooserEntryId,
				sideChoice: s.matchVetoActions.sideChoice
			})
			.from(s.matchVetoActions)
			.innerJoin(s.maps, eq(s.matchVetoActions.mapId, s.maps.id))
			.where(eq(s.matchVetoActions.matchId, match.id))
			.orderBy(asc(s.matchVetoActions.sequence));
		const completeLineups = matchEntryIds.every(
			(entryId) =>
				snapshot.lineups.filter((row) => row.entryId === entryId && row.player).length === 5
		);
		snapshot.readiness = {
			selected: true,
			map: snapshot.game.map !== null,
			lineups: completeLineups,
			agents: completeLineups && snapshot.lineups.every((row) => row.agent !== null),
			result: game.resultType !== null
		};
		return snapshot;
	});
}

function emptyScope(scope: 'game' | 'match' | 'tournament'): BroadcastScopeView {
	return { statistics: aggregateStatistics(scope, []), candidates: [], mvpPlayerId: null };
}
