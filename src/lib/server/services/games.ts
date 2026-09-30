import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	games,
	gameLineups,
	matches,
	matchVetoActions,
	tournamentMapPool,
	tournaments
} from '#lib/server/db/schema/index.ts';
import { hasDatabaseError, SaveError } from './save-error';
import { assertOrdinaryMatch, bumpMatchRevision, recomputeMatchResult } from './matches';
import { findVetoGameConflicts, projectVetoGame } from './game-preparation';
import type { SeriesSummary } from './series-results';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Game = typeof games.$inferSelect;
type Match = typeof matches.$inferSelect;
type GameWrite = { gameId: string; expectedGameRevision: number; expectedMatchRevision: number };
export type GameSaved = {
	gameId: string;
	gameRevision: number;
	matchId: string;
	matchRevision: number;
	series: SeriesSummary;
};
export type GameResult =
	| { mode: 'draft'; scoreA: number | null; scoreB: number | null }
	| { mode: 'normal'; scoreA: number; scoreB: number }
	| { mode: 'forfeit' | 'walkover'; winnerEntryId: string }
	| { mode: 'cancelled' };

function gameName(value: string) {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > 150)
		throw new SaveError('invalid', 'Game name must be 1–150 characters.');
	return value.trim();
}

export function parseScore(value: unknown): number | null {
	if (value === null || (typeof value === 'string' && !value.trim())) return null;
	if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value.trim());
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
		throw new SaveError('invalid', 'Scores must be whole non-negative numbers, or both blank.');
	return value;
}

export async function bumpGameRevision(tx: Transaction, gameId: string, expectedRevision: number) {
	if (
		typeof gameId !== 'string' ||
		!gameId ||
		!Number.isSafeInteger(expectedRevision) ||
		expectedRevision < 1
	)
		throw new SaveError('invalid', 'A valid game and revision are required.');
	const [game] = await tx
		.update(games)
		.set({ revision: sql`${games.revision} + 1` })
		.where(and(eq(games.id, gameId), eq(games.revision, expectedRevision)))
		.returning();
	if (!game) {
		const [current] = await tx.select({ id: games.id }).from(games).where(eq(games.id, gameId));
		throw new SaveError(
			current ? 'stale' : 'not-found',
			current ? 'The game changed. Reload and review before saving.' : 'Game not found.'
		);
	}
	return game;
}

async function validateMap(tx: Transaction, match: Match, mapId: string | null) {
	if (mapId === null) return;
	if (typeof mapId !== 'string' || !mapId)
		throw new SaveError('invalid', 'Choose a map from this tournament’s pool.');
	const [map] = await tx
		.select()
		.from(tournamentMapPool)
		.where(
			and(
				eq(tournamentMapPool.tournamentId, match.tournamentId),
				eq(tournamentMapPool.mapId, mapId)
			)
		);
	if (!map) throw new SaveError('invalid', 'Choose a map from this tournament’s pool.');
}

async function mutateGame(
	input: GameWrite,
	mutate: (tx: Transaction, game: Game, match: Match) => Promise<void>
): Promise<GameSaved> {
	return db.transaction(async (tx) => {
		const game = await bumpGameRevision(tx, input.gameId, input.expectedGameRevision);
		const match = await bumpMatchRevision(tx, game.matchId, input.expectedMatchRevision);
		assertOrdinaryMatch(match);
		await mutate(tx, game, match);
		const series = await recomputeMatchResult(tx, match.id);
		return {
			gameId: game.id,
			gameRevision: game.revision,
			matchId: match.id,
			matchRevision: match.revision,
			series
		};
	});
}

export async function createGame(input: {
	matchId: string;
	expectedMatchRevision: number;
	number: number;
	name: string;
}): Promise<GameSaved> {
	const name = gameName(input.name);
	try {
		return await db.transaction(async (tx) => {
			const match = await bumpMatchRevision(tx, input.matchId, input.expectedMatchRevision);
			assertOrdinaryMatch(match);
			if (!Number.isSafeInteger(input.number) || input.number < 1 || input.number > match.bestOf)
				throw new SaveError('invalid', `Game number must be between 1 and ${match.bestOf}.`);
			const actions = await tx
				.select()
				.from(matchVetoActions)
				.where(eq(matchVetoActions.matchId, match.id));
			const preparation = projectVetoGame({ ...match, number: input.number, actions });
			await validateMap(tx, match, preparation.mapId);
			const [game] = await tx
				.insert(games)
				.values({ matchId: match.id, number: input.number, name, ...preparation })
				.returning();
			const series = await recomputeMatchResult(tx, match.id);
			return {
				gameId: game.id,
				gameRevision: game.revision,
				matchId: match.id,
				matchRevision: match.revision,
				series
			};
		});
	} catch (cause) {
		if (hasDatabaseError(cause, 'UNIQUE constraint failed'))
			throw new SaveError(
				'invalid',
				'That game number already exists. Reload the match and choose an unused slot.'
			);
		throw cause;
	}
}

export async function saveGameInfo(
	input: GameWrite & {
		name: string;
		mapId: string | null;
		startingAttackersEntryId: string | null;
		startingDefendersEntryId: string | null;
	}
) {
	const name = gameName(input.name);
	return mutateGame(input, async (tx, game, match) => {
		const { mapId, startingAttackersEntryId, startingDefendersEntryId } = input;
		const participants = [match.teamAEntryId, match.teamBEntryId];
		if (
			!(startingAttackersEntryId === null && startingDefendersEntryId === null) &&
			(!participants.includes(startingAttackersEntryId!) ||
				!participants.includes(startingDefendersEntryId!) ||
				startingAttackersEntryId === startingDefendersEntryId)
		)
			throw new SaveError(
				'invalid',
				'Starting sides must both be unknown or the two distinct match teams.'
			);
		if (
			game.resultType &&
			(game.mapId !== mapId ||
				game.startingAttackersEntryId !== startingAttackersEntryId ||
				game.startingDefendersEntryId !== startingDefendersEntryId)
		)
			throw new SaveError('blocked', 'Reopen the game before changing its map or starting sides.');
		await validateMap(tx, match, mapId);
		const actions = await tx
			.select()
			.from(matchVetoActions)
			.where(eq(matchVetoActions.matchId, match.id));
		const conflicts = findVetoGameConflicts({
			...match,
			actions,
			games: [{ ...game, mapId, startingAttackersEntryId, startingDefendersEntryId }]
		});
		if (conflicts.length)
			throw new SaveError(
				'blocked',
				'This preparation conflicts with the match veto. Use Map Veto to review and explicitly apply changes to draft games.'
			);
		await tx
			.update(games)
			.set({ name, mapId, startingAttackersEntryId, startingDefendersEntryId })
			.where(eq(games.id, game.id));
	});
}

export async function saveGameResult(input: GameWrite & { result: GameResult }) {
	return mutateGame(input, async (tx, game, match) => {
		const result = input.result;
		if (!result || typeof result !== 'object')
			throw new SaveError('invalid', 'Choose a result action.');
		if (game.resultType !== null && !(game.resultType === 'normal' && result.mode === 'normal'))
			throw new SaveError(
				'blocked',
				'Reopen this game before replacing its terminal result. Normal final scores can be corrected directly.'
			);
		let scoreA: number | null = null,
			scoreB: number | null = null,
			winnerEntryId: string | null = null;
		let resultType: Game['resultType'] = null;
		if (result.mode === 'draft' || result.mode === 'normal') {
			// Commands take numbers; form parsing is deliberately separate from persisted validation.
			if (
				(result.scoreA !== null && typeof result.scoreA !== 'number') ||
				(result.scoreB !== null && typeof result.scoreB !== 'number')
			)
				throw new SaveError('invalid', 'Scores must be numbers or unknown.');
			scoreA = parseScore(result.scoreA);
			scoreB = parseScore(result.scoreB);
			if ((scoreA === null) !== (scoreB === null))
				throw new SaveError('invalid', 'Enter both scores or leave both unknown.');
			if (scoreA !== null && scoreB !== null) {
				const high = Math.max(scoreA, scoreB);
				const low = Math.min(scoreA, scoreB);
				if (high > 13 && high - low > 2)
					throw new SaveError(
						'invalid',
						'Scores cannot continue past a regulation win at 13 or a two-round overtime lead.'
					);
				if (
					result.mode === 'normal' &&
					!((high === 13 && low <= 11) || (low >= 12 && high - low === 2))
				)
					throw new SaveError(
						'invalid',
						'A final score must be 13–0 through 13–11, or an overtime win by exactly two (14–12, 15–13, and so on). Save unfinished scores as a draft.'
					);
			}
			if (result.mode === 'draft') {
				if (game.resultType)
					throw new SaveError('blocked', 'Reopen this game before saving a draft result.');
			} else {
				if (!game.mapId)
					throw new SaveError(
						'invalid',
						'Choose a tournament map before finalizing a normal result.'
					);
				await validateMap(tx, match, game.mapId);
				if (scoreA === null || scoreB === null)
					throw new SaveError('invalid', 'A normal final result requires both scores.');
				winnerEntryId = scoreA > scoreB ? match.teamAEntryId : match.teamBEntryId;
				resultType = 'normal';
			}
		} else if (result.mode === 'forfeit' || result.mode === 'walkover') {
			if (![match.teamAEntryId, match.teamBEntryId].includes(result.winnerEntryId))
				throw new SaveError('invalid', 'The winner must be Team A or Team B.');
			winnerEntryId = result.winnerEntryId;
			resultType = result.mode;
		} else if (result.mode === 'cancelled') resultType = 'cancelled';
		else throw new SaveError('invalid', 'Choose a supported result action.');
		await tx
			.update(games)
			.set({ scoreA, scoreB, resultType, winnerEntryId })
			.where(eq(games.id, game.id));
	});
}

export function reopenGame(input: GameWrite) {
	return mutateGame(input, async (tx, game) => {
		if (!game.resultType) throw new SaveError('blocked', 'This game is already a draft.');
		await tx
			.update(games)
			.set({ resultType: null, winnerEntryId: null })
			.where(eq(games.id, game.id));
	});
}

export async function deleteDraftGame(input: GameWrite) {
	const result = await mutateGame(input, async (tx, game, match) => {
		if (game.resultType)
			throw new SaveError('blocked', 'Reopen the game before deleting it and its saved lineup.');
		const [tournament] = await tx
			.select({ mvpPlayerId: tournaments.mvpPlayerId })
			.from(tournaments)
			.where(eq(tournaments.id, match.tournamentId));
		const mvpIds = [match.mvpPlayerId, tournament.mvpPlayerId].filter((id): id is string => !!id);
		if (mvpIds.length) {
			const otherAppearances = await tx
				.select({
					playerId: gameLineups.playerId,
					matchId: games.matchId,
					tournamentId: matches.tournamentId
				})
				.from(gameLineups)
				.innerJoin(games, eq(gameLineups.gameId, games.id))
				.innerJoin(matches, eq(games.matchId, matches.id))
				.where(and(ne(gameLineups.gameId, game.id), inArray(gameLineups.playerId, mvpIds)));
			if (
				match.mvpPlayerId &&
				!otherAppearances.some(
					(row) => row.playerId === match.mvpPlayerId && row.matchId === match.id
				)
			)
				throw new SaveError(
					'blocked',
					'Clear the match MVP before deleting their last game appearance.'
				);
			if (
				tournament.mvpPlayerId &&
				!otherAppearances.some(
					(row) =>
						row.playerId === tournament.mvpPlayerId && row.tournamentId === match.tournamentId
				)
			)
				throw new SaveError(
					'blocked',
					'Clear the tournament MVP before deleting their last game appearance.'
				);
		}
		await tx.delete(games).where(eq(games.id, game.id));
	});
	return { matchId: result.matchId, matchRevision: result.matchRevision, series: result.series };
}
