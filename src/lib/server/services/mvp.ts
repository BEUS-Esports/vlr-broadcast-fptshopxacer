import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { gameLineups, games, matches, players, tournaments } from '#lib/server/db/schema/index.ts';
import { bumpGameRevision } from './games';
import { bumpMatchRevision } from './matches';
import { SaveError } from './save-error';
import {
	getGameStatistics,
	getMatchStatistics,
	getTournamentStatistics
} from './statistics-aggregation';
import { assertTournamentWritable, bumpTournamentRevision } from './tournaments';

function selection(value: unknown) {
	if (value !== null && (typeof value !== 'string' || !value))
		throw new SaveError('invalid', 'Choose a participating player or clear the MVP.');
	return value as string | null;
}

export async function getMatchMvpCandidates(matchId: string) {
	return db
		.selectDistinct({ id: players.id, displayName: players.displayName })
		.from(gameLineups)
		.innerJoin(games, eq(gameLineups.gameId, games.id))
		.innerJoin(players, eq(gameLineups.playerId, players.id))
		.where(eq(games.matchId, matchId));
}

export async function getTournamentMvpCandidates(tournamentId: string) {
	return db
		.selectDistinct({ id: players.id, displayName: players.displayName })
		.from(gameLineups)
		.innerJoin(games, eq(gameLineups.gameId, games.id))
		.innerJoin(matches, eq(games.matchId, matches.id))
		.innerJoin(players, eq(gameLineups.playerId, players.id))
		.where(eq(matches.tournamentId, tournamentId));
}

export async function setGameMvp(input: {
	gameId: string;
	expectedRevision: number;
	playerId: unknown;
}) {
	const playerId = selection(input.playerId);
	const game = await db.transaction(async (tx) => {
		const game = await bumpGameRevision(tx, input.gameId, input.expectedRevision);
		const [match] = await tx
			.select({ tournamentId: matches.tournamentId })
			.from(matches)
			.where(eq(matches.id, game.matchId));
		await assertTournamentWritable(tx, match.tournamentId);
		if (playerId) {
			const [participant] = await tx
				.select({ playerId: gameLineups.playerId })
				.from(gameLineups)
				.where(and(eq(gameLineups.gameId, game.id), eq(gameLineups.playerId, playerId)))
				.limit(1);
			if (!participant)
				throw new SaveError('invalid', 'Game MVP must appear in this game’s saved lineup.');
		}
		await tx.update(games).set({ mvpPlayerId: playerId }).where(eq(games.id, game.id));
		return game;
	});
	const statistics = await getGameStatistics(game.id);
	return {
		...game,
		mvpPlayerId: playerId,
		mvpStatistics: statistics.players.find((row) => row.playerId === playerId) ?? null
	};
}

export async function setMatchMvp(input: {
	matchId: string;
	expectedRevision: number;
	playerId: unknown;
}) {
	const playerId = selection(input.playerId);
	const match = await db.transaction(async (tx) => {
		const match = await bumpMatchRevision(tx, input.matchId, input.expectedRevision);
		if (playerId) {
			const [participant] = await tx
				.select({ playerId: gameLineups.playerId })
				.from(gameLineups)
				.innerJoin(games, eq(gameLineups.gameId, games.id))
				.where(and(eq(games.matchId, match.id), eq(gameLineups.playerId, playerId)))
				.limit(1);
			if (!participant)
				throw new SaveError('invalid', 'Match MVP must appear in a saved game lineup.');
		}
		await tx.update(matches).set({ mvpPlayerId: playerId }).where(eq(matches.id, match.id));
		return match;
	});
	const statistics = await getMatchStatistics(match.id);
	return {
		...match,
		mvpPlayerId: playerId,
		mvpStatistics: statistics.players.find((row) => row.playerId === playerId) ?? null
	};
}

export async function setTournamentMvp(input: {
	tournamentId: string;
	expectedRevision: number;
	playerId: unknown;
}) {
	const playerId = selection(input.playerId);
	const tournament = await db.transaction(async (tx) => {
		const tournament = await bumpTournamentRevision(tx, input.tournamentId, input.expectedRevision);
		if (playerId) {
			const [participant] = await tx
				.select({ playerId: gameLineups.playerId })
				.from(gameLineups)
				.innerJoin(games, eq(gameLineups.gameId, games.id))
				.innerJoin(matches, eq(games.matchId, matches.id))
				.where(and(eq(matches.tournamentId, tournament.id), eq(gameLineups.playerId, playerId)))
				.limit(1);
			if (!participant)
				throw new SaveError('invalid', 'Tournament MVP must appear in a saved game lineup.');
		}
		await tx
			.update(tournaments)
			.set({ mvpPlayerId: playerId })
			.where(eq(tournaments.id, tournament.id));
		return tournament;
	});
	const statistics = await getTournamentStatistics(tournament.id);
	return {
		...tournament,
		mvpPlayerId: playerId,
		mvpStatistics: statistics.players.find((row) => row.playerId === playerId) ?? null
	};
}
