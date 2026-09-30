import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	gameLineups,
	gamePlayerStatistics,
	games,
	matches,
	players,
	tournamentEntryPlayers
} from '#lib/server/db/schema/index.ts';
import { bumpGameRevision } from './games';
import { assertOrdinaryMatch } from './matches';
import { assertTournamentWritable } from './tournaments';
import { SaveError } from './save-error';

export type LineupTeam = {
	entryId: string;
	slots: Array<{ slot: number; playerId: string | null }>;
};

function parseTeams(value: unknown): LineupTeam[] {
	if (!Array.isArray(value) || value.length !== 2)
		throw new SaveError('invalid', 'Submit both teams with five numbered slots each.');
	for (const team of value) {
		if (
			!team ||
			typeof team !== 'object' ||
			typeof team.entryId !== 'string' ||
			!Array.isArray(team.slots) ||
			team.slots.length !== 5 ||
			Object.keys(team).some((key) => !['entryId', 'slots'].includes(key))
		)
			throw new SaveError('invalid', 'Submit both teams with five numbered slots each.');
		const slots = new Set<number>();
		for (const slot of team.slots) {
			if (
				!slot ||
				typeof slot !== 'object' ||
				!Number.isInteger(slot.slot) ||
				slot.slot < 1 ||
				slot.slot > 5 ||
				slots.has(slot.slot) ||
				!(
					slot.playerId === null ||
					(typeof slot.playerId === 'string' && slot.playerId.length > 0)
				) ||
				Object.keys(slot).some((key) => !['slot', 'playerId'].includes(key))
			)
				throw new SaveError(
					'invalid',
					'Each team needs unique slots 1–5 with a player or an empty selection.'
				);
			slots.add(slot.slot);
		}
	}
	return value;
}

export async function replaceGameLineups(input: {
	gameId: string;
	expectedGameRevision: number;
	teams: unknown;
}) {
	const teams = parseTeams(input.teams);
	return db.transaction(async (tx) => {
		// Acquire the write lock before reading mutable roster and result state.
		const game = await bumpGameRevision(tx, input.gameId, input.expectedGameRevision);
		const [match] = await tx.select().from(matches).where(eq(matches.id, game.matchId));
		const tournament = await assertTournamentWritable(tx, match.tournamentId);
		assertOrdinaryMatch(match);
		if (game.resultType)
			throw new SaveError('blocked', 'Reopen the game before changing its lineup.');
		const entries = [match.teamAEntryId, match.teamBEntryId];
		if (
			new Set(teams.map((team) => team.entryId)).size !== 2 ||
			teams.some((team) => !entries.includes(team.entryId))
		)
			throw new SaveError('invalid', 'Lineups must belong to this game’s two teams.');
		const saved = await tx.select().from(gameLineups).where(eq(gameLineups.gameId, game.id));
		const roster = await tx
			.select({
				entryId: tournamentEntryPlayers.entryId,
				playerId: tournamentEntryPlayers.playerId
			})
			.from(tournamentEntryPlayers)
			.innerJoin(players, eq(players.id, tournamentEntryPlayers.playerId))
			.where(and(inArray(tournamentEntryPlayers.entryId, entries), isNull(players.archivedAt)));
		const selected = new Map<string, string>();
		const rows = teams.flatMap((team) =>
			team.slots.map((slot) => {
				const retained = slot.playerId
					? saved.find((row) => row.entryId === team.entryId && row.playerId === slot.playerId)
					: undefined;
				if (slot.playerId) {
					if (selected.has(slot.playerId))
						throw new SaveError('invalid', 'A player may appear only once in this game.');
					if (
						!retained &&
						!roster.some((row) => row.entryId === team.entryId && row.playerId === slot.playerId)
					)
						throw new SaveError(
							'invalid',
							'New selections must be active players on that team’s current roster.'
						);
					selected.set(slot.playerId, team.entryId);
				}
				return {
					gameId: game.id,
					entryId: team.entryId,
					slot: slot.slot,
					playerId: slot.playerId,
					agentId: retained?.agentId ?? null
				};
			})
		);
		const statistics = await tx
			.select({ playerId: gamePlayerStatistics.playerId, entryId: gamePlayerStatistics.entryId })
			.from(gamePlayerStatistics)
			.where(eq(gamePlayerStatistics.gameId, game.id));
		if (statistics.some((row) => selected.get(row.playerId) !== row.entryId))
			throw new SaveError(
				'blocked',
				'Clear saved statistics before removing or moving a lineup player to another team.'
			);
		const removed = saved.filter((row) => row.playerId && !selected.has(row.playerId));
		if (removed.some((row) => row.playerId === game.mvpPlayerId))
			throw new SaveError('blocked', 'Clear the game MVP before removing that lineup player.');
		const affectedMvpIds = [match.mvpPlayerId, tournament.mvpPlayerId].filter(
			(id): id is string => !!id && removed.some((row) => row.playerId === id)
		);
		if (affectedMvpIds.length) {
			const otherAppearances = await tx
				.select({
					playerId: gameLineups.playerId,
					matchId: games.matchId,
					tournamentId: matches.tournamentId
				})
				.from(gameLineups)
				.innerJoin(games, eq(gameLineups.gameId, games.id))
				.innerJoin(matches, eq(games.matchId, matches.id))
				.where(and(ne(gameLineups.gameId, game.id), inArray(gameLineups.playerId, affectedMvpIds)));
			if (
				match.mvpPlayerId &&
				affectedMvpIds.includes(match.mvpPlayerId) &&
				!otherAppearances.some(
					(row) => row.playerId === match.mvpPlayerId && row.matchId === match.id
				)
			)
				throw new SaveError(
					'blocked',
					'Clear the match MVP before removing their last match appearance.'
				);
			if (
				tournament.mvpPlayerId &&
				affectedMvpIds.includes(tournament.mvpPlayerId) &&
				!otherAppearances.some(
					(row) => row.playerId === tournament.mvpPlayerId && row.tournamentId === tournament.id
				)
			)
				throw new SaveError(
					'blocked',
					'Clear the tournament MVP before removing their last tournament appearance.'
				);
		}
		await tx.delete(gameLineups).where(eq(gameLineups.gameId, game.id));
		await tx.insert(gameLineups).values(rows);
		return {
			gameId: game.id,
			gameRevision: game.revision,
			readyA: rows.filter((row) => row.entryId === match.teamAEntryId && row.playerId).length === 5,
			readyB: rows.filter((row) => row.entryId === match.teamBEntryId && row.playerId).length === 5
		};
	});
}
