import { error, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	games,
	maps,
	matches,
	matchVetoActions,
	teams,
	tournamentEntries,
	tournamentMapPool,
	tournaments
} from '#lib/server/db/schema/index.ts';
import { formError, readPayload } from '#lib/server/services/form-error.ts';
import { replaceMatchVeto, type VetoActionInput } from '#lib/server/services/vetoes.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import { createGame } from '#lib/server/services/games.ts';
import {
	clearMatchOutcome,
	deleteMatch,
	saveMatchInfo,
	setMatchOutcome,
	updateMatchParticipants
} from '#lib/server/services/matches.ts';
import { deriveSeriesResult } from '#lib/server/services/series-results.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [match] = await db.select().from(matches).where(eq(matches.id, params.matchId)).limit(1);
	if (!match) error(404, 'Match not found.');
	const [[tournament], entries, gameRows, vetoRows, pool] = await Promise.all([
		db.select().from(tournaments).where(eq(tournaments.id, match.tournamentId)).limit(1),
		db
			.select({
				id: tournamentEntries.id,
				name: teams.name,
				tag: teams.tag,
				logoPath: teams.logoPath
			})
			.from(tournamentEntries)
			.innerJoin(teams, eq(tournamentEntries.teamId, teams.id))
			.where(eq(tournamentEntries.tournamentId, match.tournamentId))
			.orderBy(asc(teams.name)),
		db.select().from(games).where(eq(games.matchId, match.id)).orderBy(asc(games.number)),
		db
			.select()
			.from(matchVetoActions)
			.where(eq(matchVetoActions.matchId, match.id))
			.orderBy(asc(matchVetoActions.sequence)),
		db
			.select({ id: maps.id, displayName: maps.displayName })
			.from(tournamentMapPool)
			.innerJoin(maps, eq(maps.id, tournamentMapPool.mapId))
			.where(eq(tournamentMapPool.tournamentId, match.tournamentId))
			.orderBy(asc(maps.displayName))
	]);
	const summary = deriveSeriesResult({
		bestOf: match.bestOf as 1 | 2 | 3 | 5,
		teamAEntryId: match.teamAEntryId,
		teamBEntryId: match.teamBEntryId,
		games: gameRows
	});
	return {
		match,
		tournament,
		entries,
		maps: pool,
		games: gameRows,
		vetoes: vetoRows,
		summary,
		participantBlockers: [
			gameRows.length && `${gameRows.length} saved game(s)`,
			vetoRows.length && `${vetoRows.length} veto action(s)`,
			match.resultType && 'a stored match result'
		].filter(Boolean) as string[]
	};
};

export const actions: Actions = {
	veto: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			if (draft.matchId !== params.matchId)
				throw new SaveError('invalid', 'The veto must belong to this match.');
			await replaceMatchVeto({
				matchId: params.matchId,
				expectedMatchRevision: draft.expectedMatchRevision as number,
				actions: draft.actions as VetoActionInput[],
				applyToDraftGames: draft.applyToDraftGames as Array<{
					gameId: string;
					expectedGameRevision: number;
				}>
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	createGame: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		let gameId: string;
		try {
			draft = readPayload(form);
			const saved = await createGame({
				matchId: params.matchId,
				expectedMatchRevision: draft.expectedMatchRevision as number,
				number: draft.number as number,
				name: draft.name as string
			});
			gameId = saved.gameId;
		} catch (cause) {
			return formError(cause, form, draft);
		}
		redirect(303, `/admin/games/${gameId}`);
	},
	save: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await saveMatchInfo({
				matchId: params.matchId,
				expectedRevision: draft.expectedRevision as number,
				label: draft.label as string,
				bestOf: draft.bestOf as number
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	participants: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await updateMatchParticipants({
				matchId: params.matchId,
				expectedRevision: draft.expectedRevision as number,
				teamAEntryId: draft.teamAEntryId as string,
				teamBEntryId: draft.teamBEntryId as string
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	outcome: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await setMatchOutcome({
				matchId: params.matchId,
				expectedRevision: draft.expectedRevision as number,
				resultType: draft.resultType as 'forfeit' | 'walkover' | 'cancelled',
				winnerEntryId:
					typeof draft.winnerEntryId === 'string' && draft.winnerEntryId
						? draft.winnerEntryId
						: null
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	clearOutcome: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await clearMatchOutcome({
				matchId: params.matchId,
				expectedRevision: draft.expectedRevision as number
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	delete: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		let tournamentId: string;
		try {
			draft = readPayload(form);
			const [match] = await db
				.select({ tournamentId: matches.tournamentId })
				.from(matches)
				.where(eq(matches.id, params.matchId))
				.limit(1);
			tournamentId = match?.tournamentId ?? '';
			await deleteMatch({
				matchId: params.matchId,
				expectedRevision: draft.expectedRevision as number
			});
		} catch (cause) {
			return formError(cause, form, draft);
		}
		redirect(303, `/admin/tournaments/${tournamentId}?tab=matches`);
	}
};
