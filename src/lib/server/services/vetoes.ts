import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { games, matchVetoActions, tournamentMapPool } from '#lib/server/db/schema/index.ts';
import { SaveError } from './save-error';
import { assertOrdinaryMatch, bumpMatchRevision } from './matches';
import { bumpGameRevision } from './games';
import {
	findVetoGameConflicts,
	projectVetoGame,
	type VetoPreparationAction
} from './game-preparation';

export type VetoActionInput = VetoPreparationAction & { id?: string };
export type VetoConflictPreview = {
	gameId: string;
	name: string;
	number: number;
	expectedGameRevision: number;
	fields: Array<'map' | 'startingSides'>;
	reason: string;
	terminal: boolean;
	resolvable: boolean;
	proposed: ReturnType<typeof projectVetoGame>;
};

export async function replaceMatchVeto(input: {
	matchId: string;
	expectedMatchRevision: number;
	actions: VetoActionInput[];
	applyToDraftGames?: Array<{ gameId: string; expectedGameRevision: number }>;
}) {
	if (!Array.isArray(input.actions))
		throw new SaveError('invalid', 'Submit the complete ordered veto sequence.');
	const consent = input.applyToDraftGames ?? [];
	if (
		!Array.isArray(consent) ||
		consent.some(
			(row) =>
				!row ||
				typeof row.gameId !== 'string' ||
				!Number.isSafeInteger(row.expectedGameRevision) ||
				row.expectedGameRevision < 1
		) ||
		new Set(consent.map((row) => row.gameId)).size !== consent.length
	)
		throw new SaveError(
			'invalid',
			'Draft-game consent must include unique games and their revisions.'
		);
	return db.transaction(async (tx) => {
		const match = await bumpMatchRevision(tx, input.matchId, input.expectedMatchRevision);
		const existing = await tx
			.select()
			.from(matchVetoActions)
			.where(eq(matchVetoActions.matchId, match.id));
		const pool = await tx
			.select()
			.from(tournamentMapPool)
			.where(eq(tournamentMapPool.tournamentId, match.tournamentId));
		const participants = [match.teamAEntryId, match.teamBEntryId];
		const mapIds = new Set<string>(),
			numbers = new Set<number>(),
			ids = new Set<string>();
		for (const action of input.actions) {
			if (!action || !['ban', 'pick', 'decider'].includes(action.action))
				throw new SaveError('invalid', 'Choose ban, pick, or decider for every action.');
			if (
				typeof action.mapId !== 'string' ||
				!pool.some((row) => row.mapId === action.mapId) ||
				mapIds.has(action.mapId)
			)
				throw new SaveError('invalid', 'Choose each map once, from this tournament’s pool.');
			mapIds.add(action.mapId);
			if (action.id !== undefined) {
				if (
					typeof action.id !== 'string' ||
					ids.has(action.id) ||
					!existing.some((row) => row.id === action.id)
				)
					throw new SaveError(
						'invalid',
						'An action ID must already belong to this match and occur only once.'
					);
				ids.add(action.id);
			}
			if (
				!(action.action === 'decider' && action.actingEntryId === null) &&
				!participants.includes(action.actingEntryId!)
			)
				throw new SaveError(
					'invalid',
					'Bans and picks require a match team. Only a decider may be neutral.'
				);
			if (action.gameNumber !== null) {
				if (
					!Number.isSafeInteger(action.gameNumber) ||
					action.gameNumber < 1 ||
					action.gameNumber > match.bestOf ||
					numbers.has(action.gameNumber)
				)
					throw new SaveError(
						'invalid',
						`Assign each game number only once, from 1 to ${match.bestOf}.`
					);
				numbers.add(action.gameNumber);
			}
			if (
				!(action.sideChooserEntryId === null && action.sideChoice === null) &&
				(!participants.includes(action.sideChooserEntryId!) ||
					!['attack', 'defense'].includes(action.sideChoice!))
			)
				throw new SaveError(
					'invalid',
					'Side chooser and starting side must both be present or both unknown.'
				);
			if (
				action.action === 'ban' &&
				(action.gameNumber !== null ||
					action.sideChooserEntryId !== null ||
					action.sideChoice !== null)
			)
				throw new SaveError('invalid', 'Bans cannot have game assignments or side choices.');
		}
		const currentGames = await tx.select().from(games).where(eq(games.matchId, match.id));
		const conflicts = findVetoGameConflicts({
			...match,
			games: currentGames,
			actions: input.actions
		});
		const preview: VetoConflictPreview[] = conflicts.map((conflict) => {
			const game = currentGames.find((row) => row.id === conflict.gameId)!;
			const proposed = projectVetoGame({ ...match, number: game.number, actions: input.actions });
			const candidate = {
				...game,
				...(proposed.mapId !== null && { mapId: proposed.mapId }),
				...(proposed.startingAttackersEntryId !== null && {
					startingAttackersEntryId: proposed.startingAttackersEntryId,
					startingDefendersEntryId: proposed.startingDefendersEntryId
				})
			};
			return {
				...conflict,
				name: game.name,
				number: game.number,
				expectedGameRevision: game.revision,
				terminal: game.resultType !== null,
				resolvable:
					findVetoGameConflicts({ ...match, games: [candidate], actions: input.actions }).length ===
					0,
				proposed
			};
		});
		if (consent.some((row) => !preview.some((conflict) => conflict.gameId === row.gameId)))
			throw new SaveError(
				'invalid',
				'Consent contains a game that is not affected by this veto change. Review the preview again.'
			);
		if (
			preview.some(
				(row) =>
					row.terminal || !row.resolvable || !consent.some((item) => item.gameId === row.gameId)
			)
		)
			throw new SaveError(
				'blocked',
				'Review affected games below. Apply changes explicitly to drafts; reopen terminal games first. For a new ban, remove the old assignment, save, and change the game’s map before adding the ban.',
				{ conflicts: preview }
			);
		const changedGames: Array<{ gameId: string; gameRevision: number }> = [];
		if (preview.length) assertOrdinaryMatch(match);
		for (const conflict of preview) {
			const authorization = consent.find((row) => row.gameId === conflict.gameId)!;
			const game = await bumpGameRevision(tx, conflict.gameId, authorization.expectedGameRevision);
			const preparation = conflict.proposed;
			await tx
				.update(games)
				.set({
					...(preparation.mapId !== null && { mapId: preparation.mapId }),
					...(preparation.startingAttackersEntryId !== null && {
						startingAttackersEntryId: preparation.startingAttackersEntryId,
						startingDefendersEntryId: preparation.startingDefendersEntryId
					})
				})
				.where(eq(games.id, game.id));
			changedGames.push({ gameId: game.id, gameRevision: game.revision });
		}
		await tx.delete(matchVetoActions).where(eq(matchVetoActions.matchId, match.id));
		if (input.actions.length)
			await tx.insert(matchVetoActions).values(
				input.actions.map((action, index) => ({
					id: action.id ?? randomUUID(),
					matchId: match.id,
					sequence: index + 1,
					action: action.action,
					mapId: action.mapId,
					actingEntryId: action.actingEntryId,
					gameNumber: action.gameNumber,
					sideChooserEntryId: action.sideChooserEntryId,
					sideChoice: action.sideChoice,
					...(action.id && { createdAt: existing.find((row) => row.id === action.id)!.createdAt })
				}))
			);
		return { matchId: match.id, matchRevision: match.revision, changedGames };
	});
}
