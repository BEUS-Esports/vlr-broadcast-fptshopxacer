import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	games,
	maps,
	matches,
	matchVetoActions,
	tournamentMapPool,
	tournamentEntries,
	tournaments
} from '#lib/server/db/schema/index.ts';
import { hasDatabaseError, SaveError } from './save-error';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function assertTournamentWritable(tx: Tx, tournamentId: string) {
	const [row] = await tx
		.select()
		.from(tournaments)
		.where(eq(tournaments.id, tournamentId))
		.limit(1);
	if (!row) throw new SaveError('not-found', 'Tournament not found.');
	if (row.archivedAt)
		throw new SaveError('blocked', 'Unarchive this tournament before editing its preparation.');
	return row;
}

export async function bumpTournamentRevision(
	tx: Tx,
	tournamentId: string,
	expectedRevision: number
) {
	if (!tournamentId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
		throw new SaveError('invalid', 'A valid tournament and revision are required.');
	await assertTournamentWritable(tx, tournamentId);
	const [row] = await tx
		.update(tournaments)
		.set({ revision: sql`${tournaments.revision} + 1` })
		.where(and(eq(tournaments.id, tournamentId), eq(tournaments.revision, expectedRevision)))
		.returning();
	if (!row)
		throw new SaveError(
			'stale',
			'The tournament changed since it was loaded. Reload before saving.'
		);
	return row;
}

type TournamentInput = { id?: string; expectedRevision?: number; name: string; slug: string };

export async function saveTournament({ id, expectedRevision, name, slug }: TournamentInput) {
	const cleanName = typeof name === 'string' ? name.trim() : '';
	const cleanSlug = typeof slug === 'string' ? slug.trim().toLowerCase() : '';
	if (!cleanName || cleanName.length > 150)
		throw new SaveError('invalid', 'Name must be 1–150 characters.');
	if (!cleanSlug || cleanSlug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug))
		throw new SaveError(
			'invalid',
			'Slug must contain lowercase letters, numbers, and single hyphens.'
		);
	try {
		if (!id) {
			if (expectedRevision !== undefined)
				throw new SaveError('invalid', 'New tournaments cannot have a revision.');
			const [row] = await db
				.insert(tournaments)
				.values({ name: cleanName, slug: cleanSlug })
				.returning();
			return row;
		}
		return await db.transaction(async (tx) => {
			const row = await bumpTournamentRevision(tx, id, expectedRevision!);
			const [updated] = await tx
				.update(tournaments)
				.set({ name: cleanName, slug: cleanSlug })
				.where(eq(tournaments.id, id))
				.returning();
			return updated ?? row;
		});
	} catch (cause) {
		if (hasDatabaseError(cause, 'UNIQUE constraint failed'))
			throw new SaveError('invalid', 'This slug is already in use.');
		throw cause;
	}
}

export async function setTournamentArchived({
	tournamentId,
	expectedRevision,
	archived
}: {
	tournamentId: string;
	expectedRevision: number;
	archived: boolean;
}) {
	if (
		!tournamentId ||
		!Number.isSafeInteger(expectedRevision) ||
		expectedRevision < 1 ||
		typeof archived !== 'boolean'
	)
		throw new SaveError('invalid', 'A valid tournament, revision, and archive state are required.');
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(tournaments)
			.set({ archivedAt: archived ? new Date() : null, revision: sql`${tournaments.revision} + 1` })
			.where(and(eq(tournaments.id, tournamentId), eq(tournaments.revision, expectedRevision)))
			.returning();
		if (row) return row;
		const [current] = await tx
			.select({ id: tournaments.id })
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))
			.limit(1);
		throw new SaveError(
			current ? 'stale' : 'not-found',
			current ? 'Tournament changed. Reload before saving.' : 'Tournament not found.'
		);
	});
}

export async function deleteTournament({
	tournamentId,
	expectedRevision
}: {
	tournamentId: string;
	expectedRevision: number;
}) {
	if (!tournamentId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
		throw new SaveError('invalid', 'A valid tournament and revision are required.');
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))
			.limit(1);
		if (!row) throw new SaveError('not-found', 'Tournament not found.');
		if (row.archivedAt)
			throw new SaveError('blocked', 'Unarchive this tournament before deleting it.');
		if (row.revision !== expectedRevision)
			throw new SaveError('stale', 'Tournament changed. Reload before deleting.');
		const [entry] = await tx
			.select({ id: tournamentEntries.id })
			.from(tournamentEntries)
			.where(eq(tournamentEntries.tournamentId, tournamentId))
			.limit(1);
		const [match] = await tx
			.select({ id: matches.id })
			.from(matches)
			.where(eq(matches.tournamentId, tournamentId))
			.limit(1);
		if (entry || match)
			throw new SaveError('blocked', 'Remove tournament entries and matches before deleting.');
		await tx.delete(tournamentMapPool).where(eq(tournamentMapPool.tournamentId, tournamentId));
		await tx.delete(tournaments).where(eq(tournaments.id, tournamentId));
	});
}

type ReplaceTournamentMapPoolInput = {
	tournamentId: string;
	expectedRevision: number;
	mapIds: string[];
};

export async function replaceTournamentMapPool({
	tournamentId,
	expectedRevision,
	mapIds
}: ReplaceTournamentMapPoolInput) {
	if (typeof tournamentId !== 'string' || !tournamentId.trim()) {
		throw new SaveError('invalid', 'A tournament is required.');
	}
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
		throw new SaveError('invalid', 'A valid tournament revision is required.');
	}
	if (
		!Array.isArray(mapIds) ||
		mapIds.some((id) => typeof id !== 'string' || !id.trim()) ||
		new Set(mapIds).size !== mapIds.length
	) {
		throw new SaveError('invalid', 'Choose each valid map only once.');
	}

	return db.transaction(async (tx) => {
		const updated = await bumpTournamentRevision(tx, tournamentId, expectedRevision);

		if (mapIds.length) {
			const found = await tx
				.select({ id: maps.id, isActive: maps.isActive })
				.from(maps)
				.where(inArray(maps.id, mapIds));
			if (found.length !== mapIds.length) {
				throw new SaveError('invalid', 'The map pool contains a map that no longer exists.');
			}
			const existing = await tx
				.select({ mapId: tournamentMapPool.mapId })
				.from(tournamentMapPool)
				.where(eq(tournamentMapPool.tournamentId, tournamentId));
			const existingIds = new Set(existing.map((row) => row.mapId));
			if (found.some((map) => !map.isActive && !existingIds.has(map.id)))
				throw new SaveError('invalid', 'New maps must be active.');
		}

		const currentPool = await tx
			.select({ mapId: tournamentMapPool.mapId })
			.from(tournamentMapPool)
			.where(eq(tournamentMapPool.tournamentId, tournamentId));
		const selected = new Set(mapIds);
		const removed = currentPool.map(({ mapId }) => mapId).filter((mapId) => !selected.has(mapId));

		if (removed.length) {
			const [usedVeto] = await tx
				.select({ mapId: matchVetoActions.mapId })
				.from(matchVetoActions)
				.innerJoin(matches, eq(matchVetoActions.matchId, matches.id))
				.where(
					and(eq(matches.tournamentId, tournamentId), inArray(matchVetoActions.mapId, removed))
				)
				.limit(1);
			const [usedGame] = await tx
				.select({ mapId: games.mapId })
				.from(games)
				.innerJoin(matches, eq(games.matchId, matches.id))
				.where(and(eq(matches.tournamentId, tournamentId), inArray(games.mapId, removed)))
				.limit(1);
			if (usedVeto || usedGame) {
				throw new SaveError('blocked', 'A map in this pool is already used by a match or game.');
			}
		}

		await tx.delete(tournamentMapPool).where(eq(tournamentMapPool.tournamentId, tournamentId));
		if (mapIds.length) {
			await tx.insert(tournamentMapPool).values(mapIds.map((mapId) => ({ tournamentId, mapId })));
		}
		return updated;
	});
}
