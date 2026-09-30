import type { games, matchVetoActions } from '#lib/server/db/schema/index.ts';

export type VetoPreparationAction = Pick<
	typeof matchVetoActions.$inferSelect,
	'action' | 'mapId' | 'actingEntryId' | 'gameNumber' | 'sideChooserEntryId' | 'sideChoice'
>;
type PreparedGame = Pick<
	typeof games.$inferSelect,
	'id' | 'number' | 'mapId' | 'startingAttackersEntryId' | 'startingDefendersEntryId'
>;
type MatchPreparation = {
	teamAEntryId: string;
	teamBEntryId: string;
	actions: readonly VetoPreparationAction[];
};

export function projectVetoGame({
	number,
	teamAEntryId,
	teamBEntryId,
	actions
}: MatchPreparation & { number: number }) {
	const action = actions.find((row) => row.action !== 'ban' && row.gameNumber === number);
	const chooser = action?.sideChooserEntryId;
	const other = chooser === teamAEntryId ? teamBEntryId : teamAEntryId;
	return {
		mapId: action?.mapId ?? null,
		startingAttackersEntryId:
			chooser && action.sideChoice ? (action.sideChoice === 'attack' ? chooser : other) : null,
		startingDefendersEntryId:
			chooser && action.sideChoice ? (action.sideChoice === 'defense' ? chooser : other) : null
	};
}

export function findVetoGameConflicts(
	input: MatchPreparation & { games: readonly PreparedGame[] }
) {
	const conflicts: Array<{
		gameId: string;
		fields: Array<'map' | 'startingSides'>;
		reason: string;
	}> = [];
	for (const game of input.games) {
		const projected = projectVetoGame({ ...input, number: game.number });
		const fields: Array<'map' | 'startingSides'> = [];
		const prohibited = input.actions.some(
			(action) =>
				action.mapId === game.mapId &&
				(action.action === 'ban' ||
					(action.gameNumber !== null && action.gameNumber !== game.number))
		);
		if (prohibited || (projected.mapId !== null && game.mapId !== projected.mapId))
			fields.push('map');
		if (
			projected.startingAttackersEntryId !== null &&
			(game.startingAttackersEntryId !== projected.startingAttackersEntryId ||
				game.startingDefendersEntryId !== projected.startingDefendersEntryId)
		)
			fields.push('startingSides');
		if (fields.length)
			conflicts.push({
				gameId: game.id,
				fields,
				reason: prohibited
					? 'The game uses a banned map or a map assigned to another game.'
					: 'The game differs from its assigned veto map or starting sides.'
			});
	}
	return conflicts;
}
