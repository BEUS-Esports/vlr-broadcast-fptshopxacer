import { error, redirect } from '@sveltejs/kit';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	gameLineups,
	games,
	maps,
	matches,
	matchVetoActions,
	players,
	teams,
	tournamentEntries,
	tournamentEntryPlayers,
	tournamentMapPool,
	tournaments
} from '#lib/server/db/schema/index.ts';
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
import { deriveSeriesResult, type SeriesInput } from '#lib/server/services/series-results.ts';
import type { Actions, PageServerLoad } from './$types';
import { replaceGameLineups } from '#lib/server/services/lineups.ts';

export const load: PageServerLoad = async ({ params }) => {
	const [game] = await db.select().from(games).where(eq(games.id, params.gameId));
	if (!game) error(404, 'Game not found.');
	const [match] = await db.select().from(matches).where(eq(matches.id, game.matchId));
	const [tournament] = await db
		.select()
		.from(tournaments)
		.where(eq(tournaments.id, match.tournamentId));
	const [entries, pool, lineup, roster, playerRows, vetoActions, matchGames] = await Promise.all([
		db
			.select({
				id: tournamentEntries.id,
				name: teams.name,
				tag: teams.tag,
				logoPath: teams.logoPath
			})
			.from(tournamentEntries)
			.innerJoin(teams, eq(teams.id, tournamentEntries.teamId))
			.where(inArray(tournamentEntries.id, [match.teamAEntryId, match.teamBEntryId])),
		db
			.select({ id: maps.id, displayName: maps.displayName })
			.from(tournamentMapPool)
			.innerJoin(maps, eq(maps.id, tournamentMapPool.mapId))
			.where(eq(tournamentMapPool.tournamentId, tournament.id))
			.orderBy(asc(maps.displayName)),
		db.select().from(gameLineups).where(eq(gameLineups.gameId, game.id)),
		db
			.select()
			.from(tournamentEntryPlayers)
			.where(inArray(tournamentEntryPlayers.entryId, [match.teamAEntryId, match.teamBEntryId])),
		db.select().from(players).orderBy(asc(players.displayName)),
		db
			.select()
			.from(matchVetoActions)
			.where(eq(matchVetoActions.matchId, match.id))
			.orderBy(asc(matchVetoActions.sequence)),
		db.select().from(games).where(eq(games.matchId, match.id)).orderBy(asc(games.number))
	]);
	return {
		game,
		match,
		tournament,
		entries,
		maps: pool,
		lineup,
		roster,
		players: playerRows,
		vetoActions,
		matchGames,
		series: deriveSeriesResult({
			...match,
			bestOf: match.bestOf as SeriesInput['bestOf'],
			games: matchGames
		})
	};
};

function revisions(gameId: string, draft: Record<string, unknown>) {
	return {
		gameId,
		expectedGameRevision: draft.expectedGameRevision as number,
		expectedMatchRevision: draft.expectedMatchRevision as number
	};
}

export const actions: Actions = {
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
