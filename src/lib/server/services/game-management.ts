import { error } from '@sveltejs/kit';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	agents,
	gameLineups,
	games,
	maps,
	matches,
	matchVetoActions,
	players,
	teams,
	tournamentEntries,
	tournamentEntryPlayers,
	tournamentMapPool,
	tournaments
} from '#lib/server/db/schema/index.ts';
import { deriveSeriesResult, type SeriesInput } from '#lib/server/services/series-results.ts';
import { findVetoGameConflicts, projectVetoGame } from '#lib/server/services/game-preparation.ts';
import { getGameStatistics } from '#lib/server/services/statistics.ts';
export async function loadGameManagement(gameId: string) {
	const [game] = await db.select().from(games).where(eq(games.id, gameId));
	if (!game) error(404, 'Game not found.');
	const [match] = await db.select().from(matches).where(eq(matches.id, game.matchId));
	const [tournament] = await db
		.select()
		.from(tournaments)
		.where(eq(tournaments.id, match.tournamentId));
	const [
		entries,
		pool,
		lineup,
		roster,
		playerRows,
		vetoActions,
		matchGames,
		statistics,
		agentRows
	] = await Promise.all([
		db
			.select({
				id: tournamentEntries.id,
				name: teams.name,
				tag: teams.tag,
				logoPath: teams.logoPath
			})
			.from(tournamentEntries)
			.innerJoin(teams, eq(teams.id, tournamentEntries.teamId))
			.where(inArray(tournamentEntries.id, [match.teamAEntryId, match.teamBEntryId])),
		db
			.select({ id: maps.id, displayName: maps.displayName })
			.from(tournamentMapPool)
			.innerJoin(maps, eq(maps.id, tournamentMapPool.mapId))
			.where(eq(tournamentMapPool.tournamentId, tournament.id))
			.orderBy(asc(maps.displayName)),
		db.select().from(gameLineups).where(eq(gameLineups.gameId, game.id)),
		db
			.select()
			.from(tournamentEntryPlayers)
			.where(inArray(tournamentEntryPlayers.entryId, [match.teamAEntryId, match.teamBEntryId])),
		db.select().from(players).orderBy(asc(players.displayName)),
		db
			.select()
			.from(matchVetoActions)
			.where(eq(matchVetoActions.matchId, match.id))
			.orderBy(asc(matchVetoActions.sequence)),
		db.select().from(games).where(eq(games.matchId, match.id)).orderBy(asc(games.number)),
		getGameStatistics(game.id),
		db
			.select({ id: agents.id, displayName: agents.displayName, isActive: agents.isActive })
			.from(agents)
			.orderBy(asc(agents.displayName))
	]);
	return {
		game,
		match,
		tournament,
		entries,
		maps: pool,
		preparationMaps: pool.filter((map) =>
			findVetoGameConflicts({
				...match,
				actions: vetoActions,
				games: [{ ...game, mapId: map.id }]
			}).every((conflict) => !conflict.fields.includes('map'))
		),
		vetoPreparation: projectVetoGame({ ...match, number: game.number, actions: vetoActions }),
		lineup,
		statistics,
		agents: agentRows.filter(
			(agent) => agent.isActive || statistics.scoreboard.some((row) => row.agentId === agent.id)
		),
		roster,
		players: playerRows,
		vetoActions,
		matchGames,
		series: deriveSeriesResult({
			...match,
			bestOf: match.bestOf as SeriesInput['bestOf'],
			games: matchGames
		})
	};
}
