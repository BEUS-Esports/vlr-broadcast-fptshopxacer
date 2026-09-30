import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	gameLineups,
	matches,
	players,
	teams,
	tournamentEntries,
	tournamentEntryPlayers
} from '#lib/server/db/schema/index.ts';
import { hasDatabaseError, SaveError } from './save-error';
import { bumpTournamentRevision } from './tournaments';

type EntryWrite = { tournamentId: string; expectedTournamentRevision: number; entryId: string };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function requireEntry(tx: Transaction, tournamentId: string, entryId: string) {
	const [entry] = await tx
		.select()
		.from(tournamentEntries)
		.where(
			and(eq(tournamentEntries.id, entryId), eq(tournamentEntries.tournamentId, tournamentId))
		);
	if (!entry) throw new SaveError('invalid', 'This team entry does not belong to the tournament.');
	return entry;
}

export async function addTournamentEntry(input: Omit<EntryWrite, 'entryId'> & { teamId: string }) {
	try {
		return await db.transaction(async (tx) => {
			const tournament = await bumpTournamentRevision(
				tx,
				input.tournamentId,
				input.expectedTournamentRevision
			);
			const [team] = await tx.select().from(teams).where(eq(teams.id, input.teamId));
			if (!team || team.archivedAt) throw new SaveError('invalid', 'Choose an available team.');
			const [entry] = await tx
				.insert(tournamentEntries)
				.values({ tournamentId: input.tournamentId, teamId: input.teamId })
				.returning();
			return { entryId: entry.id, tournamentRevision: tournament.revision };
		});
	} catch (cause) {
		if (hasDatabaseError(cause, 'UNIQUE constraint failed'))
			throw new SaveError('invalid', 'This team is already entered in the tournament.');
		throw cause;
	}
}

export async function removeTournamentEntry(input: EntryWrite) {
	return db.transaction(async (tx) => {
		const tournament = await bumpTournamentRevision(
			tx,
			input.tournamentId,
			input.expectedTournamentRevision
		);
		await requireEntry(tx, input.tournamentId, input.entryId);
		const [match] = await tx
			.select({ id: matches.id })
			.from(matches)
			.where(or(eq(matches.teamAEntryId, input.entryId), eq(matches.teamBEntryId, input.entryId)))
			.limit(1);
		const [lineup] = await tx
			.select({ id: gameLineups.gameId })
			.from(gameLineups)
			.where(eq(gameLineups.entryId, input.entryId))
			.limit(1);
		if (match || lineup)
			throw new SaveError(
				'blocked',
				'This entry is used by a match or saved lineup. Remove those records before removing the entry.'
			);
		await tx.delete(tournamentEntries).where(eq(tournamentEntries.id, input.entryId));
		return { tournamentRevision: tournament.revision };
	});
}

export async function replaceTournamentRoster(input: EntryWrite & { playerIds: string[] }) {
	if (
		!Array.isArray(input.playerIds) ||
		input.playerIds.some((id) => typeof id !== 'string' || !id.trim()) ||
		new Set(input.playerIds).size !== input.playerIds.length
	)
		throw new SaveError('invalid', 'Choose each available player only once.');
	return db.transaction(async (tx) => {
		const tournament = await bumpTournamentRevision(
			tx,
			input.tournamentId,
			input.expectedTournamentRevision
		);
		await requireEntry(tx, input.tournamentId, input.entryId);
		const current = await tx
			.select()
			.from(tournamentEntryPlayers)
			.where(eq(tournamentEntryPlayers.entryId, input.entryId));
		if (input.playerIds.length) {
			const [assigned] = await tx
				.select({ playerId: tournamentEntryPlayers.playerId })
				.from(tournamentEntryPlayers)
				.innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
				.where(
					and(
						eq(tournamentEntries.tournamentId, input.tournamentId),
						ne(tournamentEntryPlayers.entryId, input.entryId),
						inArray(tournamentEntryPlayers.playerId, input.playerIds)
					)
				)
				.limit(1);
			if (assigned)
				throw new SaveError(
					'invalid',
					'A selected player is already assigned to another team in this tournament. Remove them from that roster and save before adding them here.'
				);
			const selected = await tx.select().from(players).where(inArray(players.id, input.playerIds));
			if (
				selected.length !== input.playerIds.length ||
				selected.some(
					(player) => player.archivedAt && !current.some((row) => row.playerId === player.id)
				)
			)
				throw new SaveError(
					'invalid',
					'The roster contains a missing or archived player. Existing selections can be retained.'
				);
		}
		await tx
			.delete(tournamentEntryPlayers)
			.where(eq(tournamentEntryPlayers.entryId, input.entryId));
		if (input.playerIds.length)
			await tx
				.insert(tournamentEntryPlayers)
				.values(input.playerIds.map((playerId) => ({ entryId: input.entryId, playerId })));
		return { tournamentRevision: tournament.revision };
	});
}
