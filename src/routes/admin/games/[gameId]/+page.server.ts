import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { games } from '#lib/server/db/schema/index.ts';
import { formError, readPayload } from '#lib/server/services/form-error.ts';
import { replaceMatchVeto, type VetoActionInput } from '#lib/server/services/vetoes.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import {
	deleteDraftGame,
	parseScore,
	reopenGame,
	saveGameInfo,
	saveGameResult
} from '#lib/server/services/games.ts';
import { replaceGameLineups, saveGameAgents } from '#lib/server/services/lineups.ts';
import { saveGameStatistics } from '#lib/server/services/statistics.ts';
import { setGameMvp } from '#lib/server/services/mvp.ts';
import { loadGameManagement } from '#lib/server/services/game-management.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => loadGameManagement(params.gameId);
function revisions(gameId: string, draft: Record<string, unknown>) {
	return {
		gameId,
		expectedGameRevision: draft.expectedGameRevision as number,
		expectedMatchRevision: draft.expectedMatchRevision as number
	};
}

export const actions: Actions = {
	agents: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await saveGameAgents({
				gameId: params.gameId,
				expectedGameRevision: draft.expectedGameRevision as number,
				players: draft.players
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	mvp: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await setGameMvp({
				gameId: params.gameId,
				expectedRevision: draft.expectedRevision as number,
				playerId: draft.playerId === '' ? null : draft.playerId
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	statistics: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await saveGameStatistics({
				gameId: params.gameId,
				expectedGameRevision: draft.expectedGameRevision as number,
				players: draft.players
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	veto: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			const [game] = await db
				.select({ matchId: games.matchId })
				.from(games)
				.where(eq(games.id, params.gameId));
			if (!game) throw new SaveError('not-found', 'Game not found.');
			if (draft.matchId !== game.matchId)
				throw new SaveError('invalid', 'The veto must belong to this game’s match.');
			await replaceMatchVeto({
				matchId: game.matchId,
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
	lineup: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await replaceGameLineups({
				gameId: params.gameId,
				expectedGameRevision: draft.expectedGameRevision as number,
				teams: draft.teams
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	info: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await saveGameInfo({
				...revisions(params.gameId, draft),
				name: draft.name as string,
				mapId: draft.mapId === '' ? null : (draft.mapId as string | null),
				startingAttackersEntryId:
					draft.startingAttackersEntryId === ''
						? null
						: (draft.startingAttackersEntryId as string | null),
				startingDefendersEntryId:
					draft.startingDefendersEntryId === ''
						? null
						: (draft.startingDefendersEntryId as string | null)
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	saveDraft: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await saveGameResult({
				...revisions(params.gameId, draft),
				result: {
					mode: 'draft',
					scoreA: parseScore(draft.scoreA),
					scoreB: parseScore(draft.scoreB)
				}
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	finalize: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await saveGameResult({
				...revisions(params.gameId, draft),
				result: {
					mode: 'normal',
					scoreA: parseScore(draft.scoreA) as number,
					scoreB: parseScore(draft.scoreB) as number
				}
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
			await saveGameResult({
				...revisions(params.gameId, draft),
				result:
					draft.mode === 'cancelled'
						? { mode: 'cancelled' }
						: {
								mode: draft.mode as 'forfeit' | 'walkover',
								winnerEntryId: draft.winnerEntryId as string
							}
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	reopen: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await reopenGame(revisions(params.gameId, draft));
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	delete: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		let matchId: string;
		try {
			draft = readPayload(form);
			({ matchId } = await deleteDraftGame(revisions(params.gameId, draft)));
		} catch (cause) {
			return formError(cause, form, draft);
		}
		redirect(303, `/admin/matches/${matchId}?tab=games`);
	}
};
