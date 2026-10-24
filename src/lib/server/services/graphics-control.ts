import { asc, eq, and } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { games, matches, tournaments } from '#lib/server/db/schema/index.ts';
import { buildBroadcastSnapshot } from '#lib/server/broadcast/snapshot.ts';
import { updateBroadcastState, type BroadcastUpdate } from '#lib/server/services/broadcast.ts';
import { formError, readPayload } from '#lib/server/services/form-error.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import { fail, type Actions } from '@sveltejs/kit';
import { loadGameManagement } from './game-management';
import { isInGameControlAction } from '#lib/broadcast/in-game-controls.ts';
import { configureLiveProvider, getLiveSettings } from '#lib/server/live/runtime.ts';

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
	const { config } = await getLiveSettings();
	return {
		snapshot,
		tournamentOptions,
		matchOptions,
		gameOptions,
		management,
		spectra: { revision: config.revision, groupCode: config.groupCode }
	};
}

export const actions: Actions = {
	spectra: async ({ request }) => {
		const form = await request.formData();
		try {
			const draft = readPayload(form);
			if (typeof draft.groupCode !== 'string')
				throw new SaveError('invalid', 'Enter a Spectra group code.');
			await configureLiveProvider({ groupCode: draft.groupCode }, draft.revision as number, null);
			return { saved: true };
		} catch {
			return fail(400, {
				error:
					'Could not save the Group Code. Use at most 128 characters without control characters, then reload if another operator changed settings.'
			});
		}
	},
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
			if (draft.intent === 'in-game') {
				if (
					Object.keys(draft).some(
						(key) => !['expectedRevision', 'intent', 'command', 'entryId', 'ceremony'].includes(key)
					)
				)
					throw new SaveError(
						'invalid',
						'In-game commands cannot be combined with other controls.'
					);
				const action = {
					type: draft.command,
					...(draft.entryId === undefined ? {} : { entryId: draft.entryId }),
					...(draft.ceremony === undefined ? {} : { ceremony: draft.ceremony })
				};
				if (!isInGameControlAction(action))
					throw new SaveError('invalid', 'Choose a valid in-game command.');
				await updateBroadcastState({
					expectedRevision: draft.expectedRevision as number,
					inGameAction: action
				});
				return { saved: true };
			}
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
