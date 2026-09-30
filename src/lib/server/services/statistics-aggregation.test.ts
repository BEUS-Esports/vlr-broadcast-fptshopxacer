import { describe, expect, it } from 'vitest';
import {
	aggregateStatistics,
	type StatisticsGame,
	type StatisticValues
} from './statistics-aggregation';

const blank = (): StatisticValues => ({
	kills: null,
	deaths: null,
	assists: null,
	performanceScore: null,
	trades: null,
	firstBloods: null,
	plants: null,
	defuses: null
});

const appearance = (playerId: string, statistics: StatisticValues | null, entryId = 'a') => ({
	playerId,
	entryId,
	displayName: playerId,
	statistics
});

const game = (
	id: string,
	resultType: StatisticsGame['resultType'],
	appearances: StatisticsGame['appearances']
): StatisticsGame => ({ id, resultType, appearances });

describe('aggregateStatistics', () => {
	it('tracks null and zero independently for each contributing appearance', () => {
		const result = aggregateStatistics('match', [
			game('g1', 'normal', [appearance('p', { ...blank(), kills: 0, trades: 2, plants: 0 })]),
			game('g2', 'normal', [appearance('p', { ...blank(), firstBloods: 1, defuses: 0 })])
		]);
		expect(result.players[0]).toMatchObject({
			gamesPlayed: 2,
			gamesWithStatistics: 2,
			kills: { value: 0, coverage: 'partial' },
			deaths: { value: null, coverage: 'none' },
			trades: { value: 2, coverage: 'partial' },
			firstBloods: { value: 1, coverage: 'partial' },
			plants: { value: 0, coverage: 'partial' },
			defuses: { value: 0, coverage: 'partial' },
			performanceScore: { value: null, coverage: 'none' }
		});
	});

	it('treats explicit zero as complete and a missing statistics row as missing coverage', () => {
		const result = aggregateStatistics('match', [
			game('g1', 'normal', [appearance('p', { ...blank(), kills: 0 })]),
			game('g2', 'normal', [appearance('p', { ...blank(), kills: 0 })]),
			game('g3', 'normal', [appearance('q', null)])
		]);
		expect(result.players[0].kills).toEqual({ value: 0, coverage: 'complete' });
		expect(result.players[1]).toMatchObject({
			gamesPlayed: 1,
			gamesWithStatistics: 0,
			kills: { value: null, coverage: 'none' }
		});
	});

	it('does not count an all-null manual-clear marker as recorded statistics', () => {
		const result = aggregateStatistics('game', [game('g', 'normal', [appearance('p', blank())])]);
		expect(result.players[0]).toMatchObject({
			gamesPlayed: 1,
			gamesWithStatistics: 0,
			kills: { value: null, coverage: 'none' }
		});
	});

	it('keeps game Performance Score and leaves broader scopes unavailable', () => {
		const fixture = game('g1', 'normal', [
			appearance('p', { ...blank(), performanceScore: 237, kills: 12 })
		]);
		expect(aggregateStatistics('game', [fixture]).players[0].performanceScore).toEqual({
			value: 237,
			coverage: 'complete'
		});
		for (const scope of ['match', 'tournament'] as const) {
			expect(aggregateStatistics(scope, [fixture]).players[0].performanceScore).toEqual({
				value: null,
				coverage: 'none'
			});
		}
	});

	it('counts substitutes only in games they appeared in', () => {
		const result = aggregateStatistics('match', [
			game('g1', 'normal', [appearance('starter', { ...blank(), kills: 4 })]),
			game('g2', 'normal', [appearance('sub', { ...blank(), kills: 5 })])
		]);
		expect(
			result.players.map(({ playerId, gamesPlayed, kills }) => ({ playerId, gamesPlayed, kills }))
		).toEqual([
			{ playerId: 'starter', gamesPlayed: 1, kills: { value: 4, coverage: 'complete' } },
			{ playerId: 'sub', gamesPlayed: 1, kills: { value: 5, coverage: 'complete' } }
		]);
	});

	it('excludes saved rows in draft, reopened, cancelled, forfeit, and walkover games', () => {
		const excluded = [null, 'cancelled', 'forfeit', 'walkover'] as const;
		const games = excluded.map((state, index) =>
			game(`g${index}`, state, [appearance('p', { ...blank(), kills: 99 })])
		);
		const result = aggregateStatistics('tournament', [
			...games,
			game('normal', 'normal', [appearance('p', { ...blank(), kills: 3 })])
		]);
		expect(result).toMatchObject({ gamesTotal: 5, gamesContributing: 1 });
		expect(result.players[0]).toMatchObject({
			gamesPlayed: 1,
			kills: { value: 3, coverage: 'complete' }
		});
		expect(aggregateStatistics('game', [games[0]]).players[0].kills).toEqual({
			value: 99,
			coverage: 'complete'
		});
	});

	it('includes both normally played games in a BO2 draw and groups tournament matches', () => {
		const result = aggregateStatistics('tournament', [
			game('m1-g1', 'normal', [appearance('p', { ...blank(), kills: 3 })]),
			game('m1-g2', 'normal', [appearance('p', { ...blank(), kills: 2 })]),
			game('m2-g1', 'normal', [appearance('p', { ...blank(), kills: 4 }, 'b')])
		]);
		expect(result.players[0]).toMatchObject({
			entryIds: ['a', 'b'],
			gamesPlayed: 3,
			kills: { value: 9, coverage: 'complete' }
		});
	});
});
