import { fail, redirect } from '@sveltejs/kit';
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
import { loadPostGameConfig } from '#lib/server/post-game/config.ts';
import { createHenrikDevClient } from '#lib/server/post-game/providers/henrikdev.ts';
import { createSpectraClient } from '#lib/server/post-game/providers/spectra.ts';
import { PostGameProviderError } from '#lib/server/post-game/providers/http.ts';
import {
	createPostGameReview,
	revisePostGameReview,
	importPostGameReport,
	discardGamePlayerStatistics,
	loadPostGameContext
} from '#lib/server/post-game/review.ts';
import type { PostGameMappings, PostGameResolutions } from '#lib/post-game/review.ts';

export const load: PageServerLoad = async ({ params }) => {
	const [management, config] = await Promise.all([
		loadGameManagement(params.gameId),
		loadPostGameConfig()
	]);
	return {
		...management,
		postGame: {
			gameId: params.gameId,
			availability: config.availability,
			groupCode: config.spectra?.groupCode ?? '',
			anchors: management.players
				.filter(
					(player) => player.riotId && management.lineup.some((row) => row.playerId === player.id)
				)
				.map((player) => ({
					id: player.id,
					displayName: player.displayName,
					riotId: player.riotId!
				}))
		}
	};
};

const postGameAction: Actions[string] = async ({ request, params, fetch }) => {
	try {
		const draft = readPayload(await request.formData());
		const gameId = params.gameId;
		if (draft.operation === 'revise')
			return {
				review: await revisePostGameReview({
					gameId,
					token: draft.token as string,
					mappings: draft.mappings as PostGameMappings
				})
			};
		if (draft.operation === 'import')
			return {
				imported: await importPostGameReport({
					gameId,
					token: draft.token as string,
					expectedGameRevision: draft.expectedGameRevision as number,
					resolutions: draft.resolutions as PostGameResolutions,
					confirmReplacement: draft.confirmReplacement === true
				})
			};
		if (draft.operation === 'discard')
			return {
				discarded: await discardGamePlayerStatistics({
					gameId,
					expectedGameRevision: draft.expectedGameRevision as number,
					playerId: draft.playerId as string,
					confirmation: draft.confirmation === true
				})
			};
		const context = await loadPostGameContext(gameId);
		if (context.game.revision !== draft.expectedGameRevision)
			throw new SaveError('stale', 'The game changed. Reload and fetch a new review.');
		const config = await loadPostGameConfig();
		if (draft.operation === 'discover') {
			if (!config.henrikdev) throw new PostGameProviderError('unavailable');
			const anchor = context.profiles.find((player) => player.id === draft.anchorPlayerId);
			if (!anchor?.riotId)
				throw new SaveError('invalid', 'Choose a saved lineup player with a Riot ID.');
			return {
				candidates: await createHenrikDevClient(config.henrikdev, fetch).discoverRecentMatches({
					riotId: anchor.riotId,
					signal: request.signal
				})
			};
		}
		const report =
			draft.operation === 'henrik'
				? config.henrikdev &&
					(await createHenrikDevClient(config.henrikdev, fetch).fetchMatchDetail({
						externalMatchId: draft.externalMatchId as string,
						signal: request.signal
					}))
				: draft.operation === 'spectra' &&
					config.spectra &&
					(await createSpectraClient(config.spectra, fetch).fetchReport({
						groupCode: draft.groupCode as string,
						signal: request.signal
					}));
		if (!report) throw new PostGameProviderError('unavailable');
		return {
			review: await createPostGameReview({
				gameId,
				expectedGameRevision: draft.expectedGameRevision as number,
				report
			})
		};
	} catch (cause) {
		if (cause instanceof PostGameProviderError)
			return fail(400, { error: cause.message, code: cause.code });
		if (cause instanceof SaveError) return formError(cause);
		return fail(500, {
			error: 'Could not load or import this report. Manual entry remains available.'
		});
	}
};
function revisions(gameId: string, draft: Record<string, unknown>) {
	return {
		gameId,
		expectedGameRevision: draft.expectedGameRevision as number,
		expectedMatchRevision: draft.expectedMatchRevision as number
	};
}

export const actions: Actions = {
	postGame: postGameAction,
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
