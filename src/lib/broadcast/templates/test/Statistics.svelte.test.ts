import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Graphic from './Graphic.svelte';
import type { BroadcastSnapshot } from '../../types';
import { defaultVisibility, defaultPlayerStats } from '../../controls';

function preparedSnapshot(): BroadcastSnapshot {
	const team = (entryId: string) => ({
		entryId,
		teamId: entryId,
		name: `Team ${entryId}`,
		tag: entryId,
		logoPath: null,
		logoWhitePath: null,
		logoBlackPath: null
	});
	const scope = {
		statistics: { scope: 'game' as const, gamesTotal: 0, gamesContributing: 0, players: [] },
		candidates: [],
		mvpPlayerId: null
	};
	const map = {
		id: 'map',
		key: 'map',
		displayName: 'Saved map',
		displayIconPath: null,
		listViewIconPath: null,
		splashPath: null,
		stylizedBackgroundPath: null
	};
	return {
		version: 1,
		revision: 1,
		selection: { tournamentId: 't', matchId: 'm', gameId: 'g' },
		tournament: null,
		match: null,
		game: {
			id: 'g',
			name: 'Game 1',
			number: 1,
			map,
			scoreA: null,
			scoreB: null,
			resultType: null,
			winnerEntryId: null
		},
		competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
		presentation: { leftEntryId: 'b', rightEntryId: 'a' },
		sides: {
			preparedAttackersEntryId: 'a',
			preparedDefendersEntryId: 'b',
			attackersEntryId: 'b',
			defendersEntryId: 'a',
			source: 'manual'
		},
		teams: [team('a'), team('b')],
		lineups: [
			{
				entryId: 'a',
				slot: 3,
				player: { playerId: 'p3', displayName: 'Third A', portraitPath: null },
				agent: null
			},
			{
				entryId: 'a',
				slot: 1,
				player: { playerId: 'p1', displayName: 'First A', portraitPath: null },
				agent: {
					id: 'agent',
					key: 'agent',
					displayName: 'Saved agent',
					roleName: null,
					displayIconPath: null,
					fullPortraitPath: null,
					bustPortraitPath: null,
					roleIconPath: null
				}
			},
			{
				entryId: 'b',
				slot: 1,
				player: { playerId: 'pb', displayName: 'First B', portraitPath: null },
				agent: null
			}
		],
		veto: [
			{
				sequence: 2,
				action: 'pick',
				map,
				actingEntryId: 'a',
				gameNumber: 1,
				sideChooserEntryId: 'b',
				sideChoice: 'defense'
			},
			{
				sequence: 1,
				action: 'ban',
				map,
				actingEntryId: 'b',
				gameNumber: null,
				sideChooserEntryId: null,
				sideChoice: null
			}
		],
		scopes: {
			game: scope,
			match: { ...scope, statistics: { ...scope.statistics, scope: 'match' } },
			tournament: { ...scope, statistics: { ...scope.statistics, scope: 'tournament' } }
		},
		controls: { visibility: defaultVisibility, playerStats: defaultPlayerStats, mvpScope: 'game' },
		readiness: { selected: true, map: true, lineups: false, agents: false, result: false }
	};
}

function statisticsSnapshot() {
	const snapshot = preparedSnapshot();
	snapshot.game = {
		...snapshot.game!,
		scoreA: 0,
		scoreB: 13,
		resultType: 'normal',
		winnerEntryId: 'b'
	};
	snapshot.lineups = ['a', 'b'].flatMap((entryId) =>
		Array.from({ length: 5 }, (_, i) => ({
			entryId,
			slot: i + 1,
			player: {
				playerId: `${entryId}${i}`,
				displayName: `Saved ${entryId}${i}`,
				portraitPath: null
			},
			agent: preparedSnapshot().lineups[1].agent
		}))
	);
	for (const scope of ['game', 'match', 'tournament'] as const) {
		snapshot.scopes[scope] = {
			candidates: [
				...snapshot.lineups.map((row) => ({ ...row.player!, entryIds: [row.entryId] })),
				{
					playerId: 'historical',
					displayName: 'Historical pick',
					portraitPath: null,
					entryIds: ['a']
				}
			],
			mvpPlayerId: scope === 'game' ? 'b4' : 'historical',
			statistics: {
				scope,
				gamesTotal: 4,
				gamesContributing: 3,
				players: snapshot.lineups.map((row) => ({
					playerId: row.player!.playerId,
					displayName: row.player!.displayName,
					entryIds: [row.entryId],
					gamesPlayed: 2,
					gamesWithStatistics: 1,
					kills: { value: 0, coverage: 'complete' },
					deaths: { value: null, coverage: 'none' },
					assists: { value: 7, coverage: 'partial' },
					performanceScore: { value: 100, coverage: 'complete' },
					trades: { value: 2, coverage: 'complete' },
					firstBloods: { value: 1, coverage: 'complete' },
					plants: { value: 0, coverage: 'complete' },
					defuses: { value: 0, coverage: 'complete' }
				}))
			}
		};
	}
	snapshot.controls.playerStats = {
		mode: 'single',
		scope: 'game',
		playerId: 'a0',
		opponentPlayerId: 'b4'
	};
	return snapshot;
}

it('renders both saved five-player postgame rows, scores, map and manual metrics', async () => {
	const snapshot = statisticsSnapshot();
	const view = render(Graphic, { snapshot, graphic: 'post-game' });
	expect(view.container.querySelectorAll('[data-slot]')).toHaveLength(10);
	expect(
		view.container.querySelector('[data-roster-position="left"]')?.textContent ?? ''
	).toContain('Saved b0');
	expect(view.container.textContent).toContain('Saved map');
	expect(view.container.textContent).toContain('Games contributing: 3 / 4');
	expect(view.container.textContent).toContain('Normal result');
	expect(view.container.querySelector('[data-position="right"]')?.textContent).toContain('0');
	expect(view.container.textContent).toContain('Performance Score');
	expect(view.container.textContent).not.toContain('ACS');
	expect(view.container.querySelector('[data-mvp="true"]')?.textContent).toContain('Saved b4');
	const row = view.container.querySelector('[data-slot="1"]')!;
	expect(row.textContent).toContain('Games played: 2');
	expect(row.textContent).toContain('Games with statistics: 1 / 2');
	expect(row.textContent).toContain('Unavailable');
	expect(row.textContent).toContain('Partial coverage');
	expect(row.querySelector('[data-field="kills"] strong')?.textContent).toBe('0');
	await view.rerender({ snapshot: { ...snapshot, teams: [] }, graphic: 'post-game' });
	expect(view.container.textContent).toContain('Saved b0');
});

it('renders exactly operator single/head-to-head picks across scopes and explicit appearance coverage', async () => {
	const snapshot = statisticsSnapshot();
	const view = render(Graphic, { snapshot, graphic: 'player-stats' });
	for (const scope of ['game', 'match', 'tournament'] as const) {
		for (const mode of ['single', 'head-to-head'] as const) {
			await view.rerender({
				snapshot: {
					...snapshot,
					controls: {
						...snapshot.controls,
						playerStats: { ...snapshot.controls.playerStats, scope, mode }
					}
				},
				graphic: 'player-stats'
			});
			expect(view.container.querySelectorAll('[data-player-panel]')).toHaveLength(
				mode === 'single' ? 1 : 2
			);
			expect(view.container.textContent).toContain('Saved a0');
			expect(view.container.textContent).toContain('Games contributing: 3 / 4');
			expect(view.container.textContent).toContain('Games played: 2');
			expect(view.container.textContent).toContain('Games with statistics: 1 / 2');
			expect(
				view.container.querySelector('[data-field="performanceScore"] strong')?.textContent
			).toBe(scope === 'game' ? '100' : 'Unavailable');
			expect(view.container.textContent).toContain(
				scope === 'game' ? 'Saved agent' : 'Agent unavailable'
			);
		}
	}
	await view.rerender({
		snapshot: {
			...snapshot,
			controls: {
				...snapshot.controls,
				playerStats: {
					mode: 'single',
					scope: 'match',
					playerId: 'historical',
					opponentPlayerId: null
				}
			}
		},
		graphic: 'player-stats'
	});
	expect(view.container.textContent).toContain('Historical pick');
	expect(view.container.textContent).toContain('Games played: Unavailable');
});

it('uses only saved MVP for every scope and distinguishes no pick from missing record', async () => {
	const snapshot = statisticsSnapshot();
	const view = render(Graphic, { snapshot, graphic: 'mvp' });
	for (const scope of ['game', 'match', 'tournament'] as const) {
		await view.rerender({
			snapshot: { ...snapshot, controls: { ...snapshot.controls, mvpScope: scope } },
			graphic: 'mvp'
		});
		expect(view.container.textContent ?? '').toContain(
			scope === 'game' ? 'Saved b4' : 'Historical pick'
		);
	}
	await view.rerender({
		snapshot: {
			...snapshot,
			scopes: { ...snapshot.scopes, game: { ...snapshot.scopes.game, mvpPlayerId: null } }
		},
		graphic: 'mvp'
	});
	expect(view.container.textContent).toContain('No saved MVP selection');
	await view.rerender({
		snapshot: {
			...snapshot,
			scopes: { ...snapshot.scopes, game: { ...snapshot.scopes.game, mvpPlayerId: 'missing' } }
		},
		graphic: 'mvp'
	});
	expect(view.container.textContent).toContain('Saved MVP player unavailable');
});

it('fits standard ten-player all-field postgame and head-to-head with long identities without scrolling', () => {
	const snapshot = statisticsSnapshot();
	snapshot.teams.forEach((team) => (team.name = 'Long team '.repeat(50)));
	snapshot.lineups.forEach((row) => (row.player!.displayName = 'Long player '.repeat(50)));
	snapshot.lineups.forEach((row) => {
		if (row.agent) row.agent.displayName = 'Long agent '.repeat(50);
	});
	Object.values(snapshot.scopes).forEach((scope) =>
		scope.candidates.forEach((player) => (player.displayName = 'Long player '.repeat(50)))
	);
	snapshot.controls.playerStats.mode = 'head-to-head';
	for (const graphic of ['post-game', 'player-stats', 'mvp'] as const) {
		const view = render(Graphic, { snapshot, graphic });
		const section = view.container.querySelector('section')!;
		const bounds = section.getBoundingClientRect();
		expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([64, 64, 1792, 952]);
		expect(getComputedStyle(section).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(section.scrollHeight).toBeLessThanOrEqual(section.clientHeight);
		expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
		const fields = section.querySelectorAll('[data-field]');
		if (graphic === 'post-game') {
			const headerText = section.querySelector('.header > p')!;
			expect(headerText.getBoundingClientRect().bottom).toBeLessThanOrEqual(
				section.querySelector('[data-slot]')!.getBoundingClientRect().top
			);
		}
		expect(fields).toHaveLength(graphic === 'post-game' ? 80 : graphic === 'player-stats' ? 16 : 8);
		for (const field of fields) {
			const box = field.getBoundingClientRect();
			expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
			expect(box.right).toBeLessThanOrEqual(bounds.right);
			expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth);
			expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight);
		}
	}
});
