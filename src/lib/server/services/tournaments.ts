import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	games,
	maps,
	matches,
	matchVetoActions,
	tournamentMapPool,
	tournaments
} from '#lib/server/db/schema/index.ts';
import { SaveError } from './save-error';

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
		const [updated] = await tx
			.update(tournaments)
			.set({ revision: sql`${tournaments.revision} + 1` })
			.where(and(eq(tournaments.id, tournamentId), eq(tournaments.revision, expectedRevision)))
			.returning({ revision: tournaments.revision });

		if (!updated) {
			const [current] = await tx
				.select({ revision: tournaments.revision })
				.from(tournaments)
				.where(eq(tournaments.id, tournamentId))
				.limit(1);
			if (!current) throw new SaveError('not-found', 'Tournament not found.');
			throw new SaveError(
				'stale',
				'The tournament changed since it was loaded. Reload it before saving again.'
			);
		}

		if (mapIds.length) {
			const found = await tx.select({ id: maps.id }).from(maps).where(inArray(maps.id, mapIds));
			if (found.length !== mapIds.length) {
				throw new SaveError('invalid', 'The map pool contains a map that no longer exists.');
			}
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
