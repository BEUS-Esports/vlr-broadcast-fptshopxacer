import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { games, matches, matchVetoActions } from '#lib/server/db/schema/index.ts';

export class MatchNotFoundError extends Error {
	constructor() {
		super('Match not found.');
		this.name = 'MatchNotFoundError';
	}
}

export class MatchParticipantChangeBlockedError extends Error {
	constructor() {
		super(
			'Match participants cannot change after games, veto actions, or a match result exist. Clear/reset that dependent data first.'
		);
		this.name = 'MatchParticipantChangeBlockedError';
	}
}

export class StaleMatchWriteError extends Error {
	constructor() {
		super('The match changed since it was loaded. Reload it before saving again.');
		this.name = 'StaleMatchWriteError';
	}
}

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
	if (teamAEntryId === teamBEntryId) {
		throw new Error('Team A and Team B must be different tournament entries.');
	}

	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({
				teamAEntryId: matches.teamAEntryId,
				teamBEntryId: matches.teamBEntryId,
				revision: matches.revision
			})
			.from(matches)
			.where(eq(matches.id, matchId))
			.limit(1);

		if (!current) throw new MatchNotFoundError();
		if (current.revision !== expectedRevision) throw new StaleMatchWriteError();

		if (current.teamAEntryId === teamAEntryId && current.teamBEntryId === teamBEntryId) {
			return current;
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

		if (!latest) throw new MatchNotFoundError();
		if (latest.revision !== expectedRevision) throw new StaleMatchWriteError();

		throw new MatchParticipantChangeBlockedError();
	});
}
