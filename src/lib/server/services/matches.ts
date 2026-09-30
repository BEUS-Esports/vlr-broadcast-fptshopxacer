import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	games,
	matches,
	matchVetoActions,
	tournamentEntries
} from '#lib/server/db/schema/index.ts';
import { SaveError } from './save-error';
import { deriveSeriesResult, type SeriesSummary } from './series-results';
import { assertTournamentWritable } from './tournaments';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BestOf = 1 | 2 | 3 | 5;

function validId(value: unknown): value is string {
	return typeof value === 'string' && !!value.trim();
}

function validRevision(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 1;
}

function validBestOf(value: unknown): value is BestOf {
	return value === 1 || value === 2 || value === 3 || value === 5;
}

function cleanLabel(value: unknown) {
	const label = typeof value === 'string' ? value.trim() : '';
	if (!label || label.length > 150)
		throw new SaveError('invalid', 'Match label must be 1–150 characters.');
	return label;
}

async function assertEntries(
	tx: Tx,
	tournamentId: string,
	teamAEntryId: string,
	teamBEntryId: string
) {
	if (!validId(teamAEntryId) || !validId(teamBEntryId) || teamAEntryId === teamBEntryId)
		throw new SaveError('invalid', 'Choose two different tournament teams.');
	const rows = await tx
		.select({ id: tournamentEntries.id })
		.from(tournamentEntries)
		.where(
			and(
				eq(tournamentEntries.tournamentId, tournamentId),
				inArray(tournamentEntries.id, [teamAEntryId, teamBEntryId])
			)
		);
	if (rows.length !== 2)
		throw new SaveError('invalid', 'Both teams must participate in this tournament.');
}

export function assertOrdinaryMatch(match: { resultType: string | null }) {
	if (
		match.resultType === 'forfeit' ||
		match.resultType === 'walkover' ||
		match.resultType === 'cancelled'
	)
		throw new SaveError('blocked', 'Clear the match-wide outcome before editing game results.');
}

export async function bumpMatchRevision(tx: Tx, matchId: string, expectedRevision: number) {
	if (!validId(matchId) || !validRevision(expectedRevision))
		throw new SaveError('invalid', 'A valid match and revision are required.');
	const [current] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
	if (!current) throw new SaveError('not-found', 'Match not found.');
	await assertTournamentWritable(tx, current.tournamentId);
	const [row] = await tx
		.update(matches)
		.set({ revision: sql`${matches.revision} + 1` })
		.where(and(eq(matches.id, matchId), eq(matches.revision, expectedRevision)))
		.returning();
	if (!row)
		throw new SaveError('stale', 'The match changed since it was loaded. Reload before saving.');
	return row;
}

export async function recomputeMatchResult(tx: Tx, matchId: string): Promise<SeriesSummary> {
	const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
	if (!match) throw new SaveError('not-found', 'Match not found.');
	assertOrdinaryMatch(match);
	const rows = await tx
		.select({
			id: games.id,
			number: games.number,
			resultType: games.resultType,
			winnerEntryId: games.winnerEntryId
		})
		.from(games)
		.where(eq(games.matchId, matchId));
	const summary = deriveSeriesResult({
		bestOf: match.bestOf as BestOf,
		teamAEntryId: match.teamAEntryId,
		teamBEntryId: match.teamBEntryId,
		games: rows
	});
	if (summary.conflicts.length)
		throw new SaveError(
			'blocked',
			`Series results conflict in game IDs: ${summary.conflicts.map((item) => `${item.gameId} (${item.reason})`).join(', ')}. Reopen or correct these games first.`
		);
	await tx
		.update(matches)
		.set({
			resultType: summary.state === 'incomplete' ? null : 'normal',
			winnerEntryId: summary.winnerEntryId
		})
		.where(eq(matches.id, matchId));
	return summary;
}

export async function createMatch({
	tournamentId,
	teamAEntryId,
	teamBEntryId,
	label,
	bestOf
}: {
	tournamentId: string;
	teamAEntryId: string;
	teamBEntryId: string;
	label: string;
	bestOf: number;
}) {
	if (!validId(tournamentId) || !validBestOf(bestOf))
		throw new SaveError('invalid', 'A tournament and supported format are required.');
	const clean = cleanLabel(label);
	return db.transaction(async (tx) => {
		await assertTournamentWritable(tx, tournamentId);
		await assertEntries(tx, tournamentId, teamAEntryId, teamBEntryId);
		const [row] = await tx
			.insert(matches)
			.values({ tournamentId, teamAEntryId, teamBEntryId, label: clean, bestOf })
			.returning();
		return row;
	});
}

export async function saveMatchInfo({
	matchId,
	expectedRevision,
	label,
	bestOf
}: {
	matchId: string;
	expectedRevision: number;
	label: string;
	bestOf: number;
}) {
	if (!validBestOf(bestOf)) throw new SaveError('invalid', 'Choose a supported best-of format.');
	const clean = cleanLabel(label);
	return db.transaction(async (tx) => {
		const current = await bumpMatchRevision(tx, matchId, expectedRevision);
		if (current.bestOf !== bestOf) {
			const gameRows = await tx
				.select({ number: games.number, resultType: games.resultType })
				.from(games)
				.where(eq(games.matchId, matchId));
			const vetoRows = await tx
				.select({ gameNumber: matchVetoActions.gameNumber })
				.from(matchVetoActions)
				.where(eq(matchVetoActions.matchId, matchId));
			if (gameRows.some((game) => game.resultType !== null))
				throw new SaveError(
					'blocked',
					'Reopen completed or cancelled games before changing the match format.'
				);
			if (
				gameRows.some((game) => game.number > bestOf) ||
				vetoRows.some((veto) => veto.gameNumber !== null && veto.gameNumber > bestOf)
			)
				throw new SaveError(
					'blocked',
					'An existing game or veto assignment exceeds the new format.'
				);
		}
		const [row] = await tx
			.update(matches)
			.set({ label: clean, bestOf })
			.where(eq(matches.id, matchId))
			.returning();
		return row;
	});
}

export async function deleteMatch({
	matchId,
	expectedRevision
}: {
	matchId: string;
	expectedRevision: number;
}) {
	return db.transaction(async (tx) => {
		const match = await bumpMatchRevision(tx, matchId, expectedRevision);
		const [game] = await tx
			.select({ id: games.id })
			.from(games)
			.where(eq(games.matchId, matchId))
			.limit(1);
		const [veto] = await tx
			.select({ id: matchVetoActions.id })
			.from(matchVetoActions)
			.where(eq(matchVetoActions.matchId, matchId))
			.limit(1);
		if (game || veto || match.resultType || match.winnerEntryId)
			throw new SaveError(
				'blocked',
				'Clear all games, veto actions, and match outcome before deleting this match.'
			);
		await tx.delete(matches).where(eq(matches.id, matchId));
	});
}

export async function setMatchOutcome({
	matchId,
	expectedRevision,
	resultType,
	winnerEntryId
}: {
	matchId: string;
	expectedRevision: number;
	resultType: 'forfeit' | 'walkover' | 'cancelled';
	winnerEntryId: string | null;
}) {
	if (!['forfeit', 'walkover', 'cancelled'].includes(resultType))
		throw new SaveError('invalid', 'Choose a valid match-wide outcome.');
	return db.transaction(async (tx) => {
		const match = await bumpMatchRevision(tx, matchId, expectedRevision);
		if (
			resultType === 'cancelled'
				? winnerEntryId !== null
				: winnerEntryId !== match.teamAEntryId && winnerEntryId !== match.teamBEntryId
		)
			throw new SaveError(
				'invalid',
				'The winner must be one of this match’s teams; cancellation has no winner.'
			);
		const [row] = await tx
			.update(matches)
			.set({ resultType, winnerEntryId })
			.where(eq(matches.id, matchId))
			.returning();
		return row;
	});
}

export async function clearMatchOutcome({
	matchId,
	expectedRevision
}: {
	matchId: string;
	expectedRevision: number;
}) {
	return db.transaction(async (tx) => {
		const match = await bumpMatchRevision(tx, matchId, expectedRevision);
		if (
			match.resultType !== 'forfeit' &&
			match.resultType !== 'walkover' &&
			match.resultType !== 'cancelled'
		)
			throw new SaveError('invalid', 'This match has no match-wide outcome to clear.');
		await tx
			.update(matches)
			.set({ resultType: null, winnerEntryId: null })
			.where(eq(matches.id, matchId));
		await recomputeMatchResult(tx, matchId);
		const [row] = await tx.select().from(matches).where(eq(matches.id, matchId));
		return row;
	});
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
	if (!validId(matchId) || !validRevision(expectedRevision)) {
		throw new SaveError('invalid', 'A valid match revision is required.');
	}
	if (!validId(teamAEntryId) || !validId(teamBEntryId) || teamAEntryId === teamBEntryId) {
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
		await assertTournamentWritable(tx, current.tournamentId);
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
