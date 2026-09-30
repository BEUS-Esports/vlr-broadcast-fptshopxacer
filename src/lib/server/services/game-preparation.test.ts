import { expect, it } from 'vitest';
import { findVetoGameConflicts, projectVetoGame } from './game-preparation';

it('projects only an assigned pick and explicit side choice; removals preserve existing preparation', () => {
	const match = { teamAEntryId: 'a', teamBEntryId: 'b' };
	const action = {
		action: 'pick' as const,
		mapId: 'map',
		actingEntryId: 'a',
		gameNumber: 2,
		sideChooserEntryId: 'b',
		sideChoice: 'defense' as const
	};
	expect(projectVetoGame({ ...match, number: 2, actions: [action] })).toEqual({
		mapId: 'map',
		startingAttackersEntryId: 'a',
		startingDefendersEntryId: 'b'
	});
	expect(projectVetoGame({ ...match, number: 1, actions: [action] })).toEqual({
		mapId: null,
		startingAttackersEntryId: null,
		startingDefendersEntryId: null
	});
	const games = [
		{
			id: 'g',
			number: 2,
			mapId: 'old',
			startingAttackersEntryId: 'b',
			startingDefendersEntryId: 'a'
		}
	];
	expect(findVetoGameConflicts({ ...match, games, actions: [action] })).toMatchObject([
		{ gameId: 'g', fields: ['map', 'startingSides'] }
	]);
	expect(findVetoGameConflicts({ ...match, games, actions: [] })).toEqual([]);
	expect(
		findVetoGameConflicts({
			...match,
			games,
			actions: [
				{
					...action,
					action: 'ban',
					gameNumber: null,
					mapId: 'old',
					sideChooserEntryId: null,
					sideChoice: null
				}
			]
		})
	).toMatchObject([{ gameId: 'g', fields: ['map'] }]);
	expect(
		findVetoGameConflicts({
			...match,
			games,
			actions: [{ ...action, gameNumber: 1, mapId: 'old' }]
		})
	).toMatchObject([{ gameId: 'g', fields: ['map'] }]);
});
