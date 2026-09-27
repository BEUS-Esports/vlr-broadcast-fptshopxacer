import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	games,
	matches,
	matchVetoActions,
	tournamentEntries
} from '#lib/server/db/schema/index.ts';
import { SaveError } from './save-error';

type UpdateMatchParticipantsInput = {
	matchId: string;
	expectedRevision: number;
	teamAEntryId: string;
	teamBEntryId: string;
};

/**
 * Changes a match's stable Team A/B identities.
 *
 * This is deliberately stricter than ordinary field edits: once anything has
 * been saved that interprets A/B (games/scores, veto actions, or a match-level
 * result), callers must explicitly clear/reset that data first.
 */
export async function updateMatchParticipants({
	matchId,
	expectedRevision,
	teamAEntryId,
	teamBEntryId
}: UpdateMatchParticipantsInput) {
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
		throw new SaveError('invalid', 'A valid match revision is required.');
	}
	if (teamAEntryId === teamBEntryId) {
		throw new SaveError('invalid', 'Team A and Team B must be different tournament entries.');
	}

	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({
				tournamentId: matches.tournamentId,
				teamAEntryId: matches.teamAEntryId,
				teamBEntryId: matches.teamBEntryId,
				revision: matches.revision
			})
			.from(matches)
			.where(eq(matches.id, matchId))
			.limit(1);

		if (!current) throw new SaveError('not-found', 'Match not found.');
		if (current.revision !== expectedRevision) {
			throw new SaveError(
				'stale',
				'The match changed since it was loaded. Reload it before saving again.'
			);
		}

		if (current.teamAEntryId === teamAEntryId && current.teamBEntryId === teamBEntryId) {
			return current;
		}

		const entries = await tx
			.select({ id: tournamentEntries.id })
			.from(tournamentEntries)
			.where(
				and(
					eq(tournamentEntries.tournamentId, current.tournamentId),
					inArray(tournamentEntries.id, [teamAEntryId, teamBEntryId])
				)
			);
		if (entries.length !== 2) {
			throw new SaveError('invalid', 'Both teams must participate in this tournament.');
		}

		const [updated] = await tx
			.update(matches)
			.set({
				teamAEntryId,
				teamBEntryId,
				revision: sql`${matches.revision} + 1`
			})
			.where(
				and(
					eq(matches.id, matchId),
					eq(matches.revision, expectedRevision),
					isNull(matches.resultType),
					isNull(matches.winnerEntryId),
					sql`not exists (select 1 from ${games} where ${games.matchId} = ${matchId})`,
					sql`not exists (select 1 from ${matchVetoActions} where ${matchVetoActions.matchId} = ${matchId})`
				)
			)
			.returning({
				teamAEntryId: matches.teamAEntryId,
				teamBEntryId: matches.teamBEntryId,
				revision: matches.revision
			});

		if (updated) return updated;

		const [latest] = await tx
			.select({ revision: matches.revision })
			.from(matches)
			.where(eq(matches.id, matchId))
			.limit(1);

		if (!latest) throw new SaveError('not-found', 'Match not found.');
		if (latest.revision !== expectedRevision) {
			throw new SaveError(
				'stale',
				'The match changed since it was loaded. Reload it before saving again.'
			);
		}

		throw new SaveError(
			'blocked',
			'Match participants cannot change after games, veto actions, or a match result exist. Clear/reset that dependent data first.'
		);
	});
}
