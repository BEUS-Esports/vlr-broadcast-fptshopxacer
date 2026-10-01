import { expect, it } from 'vitest';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import {
	competitionTeams,
	presentationTeams,
	gameplayTeams,
	gameplaySide,
	teamScore,
	lineupForTeam,
	vetoActor,
	statisticMetric
} from './selectors';

it('keeps competition ownership, presentation order and prepared/current sides independent', async () => {
	await withManagementFixture(async () => {
		const { buildBroadcastSnapshot } = await import('../server/broadcast/snapshot');
		const snapshot = await buildBroadcastSnapshot();
		const team = (entryId: string) => ({
			entryId,
			teamId: entryId,
			name: entryId,
			tag: entryId,
			logoPath: null,
			logoWhitePath: null,
			logoBlackPath: null
		});
		snapshot.teams = [team('a'), team('b')];
		snapshot.competition = { teamAEntryId: 'a', teamBEntryId: 'b' };
		snapshot.presentation = { leftEntryId: 'a', rightEntryId: 'b' };
		snapshot.sides = {
			preparedAttackersEntryId: 'a',
			preparedDefendersEntryId: 'b',
			attackersEntryId: 'b',
			defendersEntryId: 'a',
			source: 'manual'
		};
		snapshot.game = {
			id: 'g',
			name: 'g',
			number: 1,
			map: null,
			scoreA: 0,
			scoreB: null,
			resultType: null,
			winnerEntryId: null
		};
		snapshot.lineups = [
			{ entryId: 'a', slot: 2, player: null, agent: null },
			{ entryId: 'a', slot: 1, player: null, agent: null }
		];
		expect(gameplaySide(snapshot, 'a', 'prepared')).toBe('attack');
		expect(gameplaySide(snapshot, 'a')).toBe('defense');
		expect(presentationTeams(snapshot).left?.entryId).toBe('a');
		expect(presentationTeams(snapshot).swapped).toBe(false);
		snapshot.presentation = { leftEntryId: 'b', rightEntryId: 'a' };
		expect(presentationTeams(snapshot).left?.entryId).toBe('b');
		expect(presentationTeams(snapshot).swapped).toBe(true);
		expect(gameplayTeams(snapshot, 'prepared').attackers?.entryId).toBe('a');
		expect(gameplayTeams(snapshot).attackers?.entryId).toBe('b');
		expect(competitionTeams(snapshot).teamA?.entryId).toBe('a');
		expect(teamScore(snapshot, 'a', 'game')).toBe(0);
		expect(teamScore(snapshot, 'b', 'game')).toBeNull();
		expect(lineupForTeam(snapshot, 'a').map((slot) => slot.slot)).toEqual([1, 2]);
		expect(snapshot.lineups.map((slot) => slot.slot)).toEqual([2, 1]);
		expect(vetoActor(snapshot, { actingEntryId: 'a' })?.entryId).toBe('a');
		expect(gameplaySide(snapshot, null, 'prepared')).toBeNull();
		expect(teamScore(snapshot, 'missing', 'game')).toBeNull();
		const metric = { value: 0, coverage: 'partial' as const };
		expect(statisticMetric({ performanceScore: metric }, 'performanceScore', 'game')).toEqual(
			metric
		);
		expect(statisticMetric({ performanceScore: metric }, 'performanceScore', 'match')).toEqual({
			value: null,
			coverage: 'none'
		});
		expect(statisticMetric(null, 'kills', 'game')).toEqual({ value: null, coverage: 'none' });
	});
});
