import { asc, eq, and } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { games, matches, tournaments } from '#lib/server/db/schema/index.ts';
import { buildBroadcastSnapshot } from '#lib/server/broadcast/snapshot.ts';
import { updateBroadcastState, type BroadcastUpdate } from '#lib/server/services/broadcast.ts';
import { formError, readPayload } from '#lib/server/services/form-error.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import type { Actions } from '@sveltejs/kit';
import { loadGameManagement } from './game-management';

export async function loadGraphicsControl() {
	const [snapshot, tournamentOptions, matchOptions, gameOptions] = await Promise.all([
		buildBroadcastSnapshot(),
		db
			.select({ id: tournaments.id, name: tournaments.name })
			.from(tournaments)
			.orderBy(asc(tournaments.name)),
		db
			.select({ id: matches.id, tournamentId: matches.tournamentId, label: matches.label })
			.from(matches)
			.orderBy(asc(matches.label)),
		db
			.select({ id: games.id, matchId: games.matchId, number: games.number, name: games.name })
			.from(games)
			.orderBy(asc(games.number))
	]);
	const management = snapshot.selection
		? { ...(await loadGameManagement(snapshot.selection.gameId)), scopes: snapshot.scopes }
		: null;
	return { snapshot, tournamentOptions, matchOptions, gameOptions, management };
}

export const actions: Actions = {
	select: async ({ request }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			if (
				![draft.tournamentId, draft.matchId, draft.gameId].every(
					(value) => typeof value === 'string' && value
				)
			)
				throw new SaveError(
					'invalid',
					'Choose a tournament, match, and game before taking it live.'
				);
			const [selected] = await db
				.select({ id: games.id })
				.from(games)
				.innerJoin(matches, eq(games.matchId, matches.id))
				.where(
					and(
						eq(games.id, draft.gameId as string),
						eq(matches.id, draft.matchId as string),
						eq(matches.tournamentId, draft.tournamentId as string)
					)
				);
			if (!selected)
				throw new SaveError(
					'invalid',
					'The selected game must belong to the selected match and tournament.'
				);
			await updateBroadcastState({
				expectedRevision: draft.expectedRevision as number,
				selectedGameId: selected.id
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	clear: async ({ request }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await updateBroadcastState({
				expectedRevision: draft.expectedRevision as number,
				selectedGameId: null
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	controls: async ({ request }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await updateBroadcastState({
				expectedRevision: draft.expectedRevision as number,
				swapped: draft.swapped as BroadcastUpdate['swapped'],
				currentAttackersEntryId:
					draft.currentAttackersEntryId === ''
						? null
						: (draft.currentAttackersEntryId as BroadcastUpdate['currentAttackersEntryId']),
				visibility: draft.visibility as BroadcastUpdate['visibility'],
				playerStats: draft.playerStats as BroadcastUpdate['playerStats'],
				mvpScope: draft.mvpScope as BroadcastUpdate['mvpScope']
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	}
};
