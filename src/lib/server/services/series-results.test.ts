import { describe, expect, it } from 'vitest';
import { deriveSeriesResult, type SeriesInput } from './series-results';

const game = (
	number: number,
	winnerEntryId: string | null,
	resultType: SeriesInput['games'][number]['resultType'] = 'normal'
) => ({ id: `game-${number}`, number, resultType, winnerEntryId });

const derive = (bestOf: SeriesInput['bestOf'], games: SeriesInput['games']) =>
	deriveSeriesResult({ bestOf, teamAEntryId: 'a', teamBEntryId: 'b', games });

describe('deriveSeriesResult', () => {
	it.each([
		[1, ['a'], 'completed', 'a'],
		[2, ['a', 'a'], 'completed', 'a'],
		[2, ['a', 'b'], 'draw', null],
		[2, ['b', 'b'], 'completed', 'b'],
		[3, ['a', 'a'], 'completed', 'a'],
		[3, ['a', 'b', 'a'], 'completed', 'a'],
		[5, ['b', 'b', 'b'], 'completed', 'b'],
		[5, ['a', 'b', 'a', 'b', 'a'], 'completed', 'a']
	] as const)('BO%i %j -> %s', (bestOf, winners, state, winnerEntryId) => {
		expect(
			derive(
				bestOf,
				winners.map((winner, index) => game(index + 1, winner))
			)
		).toEqual({
			winsA: winners.filter((winner) => winner === 'a').length,
			winsB: winners.filter((winner) => winner === 'b').length,
			state,
			winnerEntryId,
			clinchNumber: state === 'completed' ? winners.length : null,
			conflicts: []
		});
	});

	it('counts forfeits and walkovers, but neither drafts nor cancellations', () => {
		expect(
			derive(5, [
				game(1, 'a', 'forfeit'),
				game(2, null, null),
				game(3, null, 'cancelled'),
				game(4, 'b', 'walkover')
			])
		).toEqual({
			winsA: 1,
			winsB: 1,
			state: 'incomplete',
			winnerEntryId: null,
			clinchNumber: null,
			conflicts: []
		});
	});

	it('keeps two known wins incomplete when an earlier game is unresolved', () => {
		expect(derive(3, [game(2, 'a'), game(3, 'a')])).toEqual({
			winsA: 2,
			winsB: 0,
			state: 'incomplete',
			winnerEntryId: null,
			clinchNumber: null,
			conflicts: []
		});
	});

	it('identifies the clinch before a saved unplayed game', () => {
		expect(derive(3, [game(1, 'a'), game(2, 'a'), game(3, null, null)])).toMatchObject({
			state: 'completed',
			clinchNumber: 2,
			conflicts: []
		});
	});

	it('reports decisive games after a clinch while keeping their wins visible', () => {
		expect(derive(5, [game(1, 'a'), game(2, 'a'), game(3, 'a'), game(4, 'b')])).toEqual({
			winsA: 3,
			winsB: 1,
			state: 'incomplete',
			winnerEntryId: null,
			clinchNumber: null,
			conflicts: [{ gameId: 'game-4', reason: 'after-clinch' }]
		});
	});

	it('reports invalid winners and game numbers without counting those games', () => {
		expect(
			derive(3, [
				game(1, 'a'),
				{ ...game(2, 'outside'), id: 'outsider' },
				{ ...game(1, 'b'), id: 'duplicate' },
				{ ...game(4, 'a'), id: 'out-of-range' }
			])
		).toEqual({
			winsA: 1,
			winsB: 0,
			state: 'incomplete',
			winnerEntryId: null,
			clinchNumber: null,
			conflicts: [
				{ gameId: 'outsider', reason: 'invalid-winner' },
				{ gameId: 'duplicate', reason: 'duplicate-number' },
				{ gameId: 'out-of-range', reason: 'invalid-number' }
			]
		});
	});
});
