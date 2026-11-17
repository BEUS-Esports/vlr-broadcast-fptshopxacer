import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { graphicIds } from '../../controls';
import { resolveGraphicTemplate } from '../../templates';
import { preparedSnapshot } from '../test-snapshot';
import Graphic from './Graphic.svelte';

it.each(graphicIds)('renders %s with and without a selection', (graphic) => {
	const view = render(Graphic, { snapshot: preparedSnapshot(), graphic });
	expect(view.container.innerHTML).not.toBe('');
	const empty = render(Graphic, { snapshot: { ...preparedSnapshot(), selection: null }, graphic });
	if (graphic !== 'in-game') expect(empty.container.textContent).toContain('WAITING FOR MATCH');
});

it('resolves stop slugs to this template', () => {
	expect(resolveGraphicTemplate('predator-roadshow-val-dong-nai').id).toBe('predator-roadshow-val');
});

function lineup(
	lineupTeams: 'both' | 'team-a' | 'team-b' | 'winner',
	winnerEntryId: string | null = null
) {
	const base = preparedSnapshot();
	return {
		...base,
		liveControls: { ...base.liveControls, lineupTeams },
		game: { ...base.game!, winnerEntryId }
	};
}

it('shows the five cards of one team with TAG NAME plates', () => {
	const view = render(Graphic, { snapshot: lineup('team-a'), graphic: 'player-lineup' });
	expect(view.container.querySelectorAll('[data-position]')).toHaveLength(1);
	expect(view.container.querySelectorAll('[data-slot]')).toHaveLength(5);
	expect(view.container.textContent).toContain('a First A');
	expect(view.container.querySelector('img[alt="Roadshow"]')).not.toBeNull();
});

it('shows the map winner under a WINNER title without the Roadshow lockup', () => {
	const view = render(Graphic, { snapshot: lineup('winner', 'b'), graphic: 'player-lineup' });
	expect(view.container.textContent).toContain('WINNER');
	expect(view.container.textContent).toContain('First B');
	expect(view.container.querySelector('[data-entry-id="a"]')).toBeNull();
	expect(view.container.querySelector('img[alt="Roadshow"]')).toBeNull();
	expect(view.container.querySelector('img[alt="Predator"]')).not.toBeNull();
});

it('shows both teams', () => {
	const view = render(Graphic, { snapshot: lineup('both'), graphic: 'player-lineup' });
	expect(view.container.querySelectorAll('[data-position]')).toHaveLength(2);
	expect(view.container.querySelectorAll('[data-slot]')).toHaveLength(10);
});

function stats(
	mode: 'single' | 'head-to-head',
	fields: import('#lib/statistics/fields.ts').StatisticField[]
) {
	const base = preparedSnapshot();
	const metric = (value: number) => ({ value, coverage: 'complete' as const });
	const player = (playerId: string, displayName: string, entryId: string, kills: number) => ({
		playerId,
		displayName,
		entryIds: [entryId],
		gamesPlayed: 1,
		gamesWithStatistics: 1,
		kills: metric(kills),
		deaths: metric(10),
		assists: metric(4),
		performanceScore: metric(231.6),
		trades: metric(3),
		firstBloods: metric(2),
		plants: metric(1),
		defuses: metric(0)
	});
	const game = {
		...base.scopes.game,
		candidates: [
			{ playerId: 'p1', displayName: 'First A', portraitPath: null, entryIds: ['a'] },
			{ playerId: 'pb', displayName: 'First B', portraitPath: null, entryIds: ['b'] }
		],
		statistics: {
			...base.scopes.game.statistics,
			players: [player('p1', 'First A', 'a', 21), player('pb', 'First B', 'b', 17)]
		},
		mvpPlayerId: 'p1'
	};
	return {
		...base,
		scopes: { ...base.scopes, game },
		controls: {
			...base.controls,
			playerStats: { mode, scope: 'game' as const, playerId: 'p1', opponentPlayerId: 'pb', fields },
			mvpFields: fields
		}
	};
}

it('renders only the selected statistic fields with English and Vietnamese labels', () => {
	const view = render(Graphic, {
		snapshot: stats('single', ['kills', 'firstBloods']),
		graphic: 'player-stats'
	});
	expect(view.container.querySelectorAll('[data-field]')).toHaveLength(2);
	for (const text of ['KILLS', 'Hạ gục', 'FIRST BLOODS', '21', 'First A'])
		expect(view.container.textContent).toContain(text);
});

it('renders head-to-head with both players', () => {
	const view = render(Graphic, {
		snapshot: stats('head-to-head', ['kills', 'deaths']),
		graphic: 'player-stats'
	});
	expect(view.container.textContent).toContain('First A');
	expect(view.container.textContent).toContain('First B');
	expect(view.container.querySelectorAll('[data-field="kills"] [data-value]')).toHaveLength(2);
	expect(view.container.querySelector('[data-field="kills"]')?.textContent).toContain('17');
});

it('renders MVP with an MVP title', () => {
	const view = render(Graphic, { snapshot: stats('single', ['kills']), graphic: 'mvp' });
	expect(view.container.querySelector('h1')?.textContent).toBe('MVP');
	expect(view.container.textContent).toContain('First A');
	expect(view.container.querySelectorAll('[data-field]')).toHaveLength(1);
});

it('lists veto steps in sequence with Vietnamese action labels', () => {
	const view = render(Graphic, { snapshot: preparedSnapshot(), graphic: 'map-veto' });
	const steps = [...view.container.querySelectorAll('[data-sequence]')];
	expect(steps.map((step) => step.getAttribute('data-sequence'))).toEqual(['1', '2']);
	expect(steps[0].textContent).toContain('CẤM BẢN ĐỒ');
	expect(steps[0].querySelector('[data-actor]')?.textContent).toBe('b');
	expect(steps[1].textContent).toContain('CHỌN BẢN ĐỒ');
	expect(steps[1].querySelector('[data-actor]')?.textContent).toBe('a');
	expect(steps[1].textContent).toContain('b CHỌN THỦ');
});

it('shows five agent slots per team with player names, map and sides', () => {
	const view = render(Graphic, { snapshot: preparedSnapshot(), graphic: 'agent-select' });
	expect(view.container.querySelectorAll('[data-slot]')).toHaveLength(10);
	const left = view.container.querySelector('[data-position="left"]')!;
	const right = view.container.querySelector('[data-position="right"]')!;
	expect(right.textContent).toContain('First A');
	expect(right.textContent).toContain('CÔNG');
	expect(left.textContent).toContain('THỦ');
	expect(view.container.textContent).toContain('Saved map');
	expect(view.container.querySelector('img[alt="Roadshow"]')).toBeNull();
});

it('shows both teams with score, five player rows and a per-team MVP', () => {
	const base = stats('single', ['kills']);
	const snapshot = {
		...base,
		game: {
			...base.game!,
			scoreA: 13,
			scoreB: 9,
			resultType: 'normal' as const,
			winnerEntryId: 'a'
		}
	};
	const view = render(Graphic, { snapshot, graphic: 'post-game' });
	const teams = [...view.container.querySelectorAll('[data-position]')];
	expect(teams).toHaveLength(2);
	for (const team of teams) {
		expect(team.querySelectorAll('[data-slot]')).toHaveLength(5);
		expect(team.querySelectorAll('[data-team-mvp]')).toHaveLength(1);
	}
	const mvpA = view.container.querySelector('[data-entry-id="a"] [data-team-mvp]')!;
	expect(mvpA.textContent).toContain('First A');
	expect(mvpA.textContent).toContain('Saved agent');
	expect(mvpA.textContent).toContain('21');
	expect(mvpA.textContent).toContain('2.1');
	expect(view.container.querySelector('[data-entry-id="a"] [data-score]')?.textContent).toBe('13');
	expect(view.container.querySelector('[data-entry-id="b"] [data-score]')?.textContent).toBe('9');
});

it('shows 13–0 for the advancing team when no score is saved', () => {
	const base = preparedSnapshot();
	const snapshot = {
		...base,
		game: {
			...base.game!,
			scoreA: null,
			scoreB: null,
			resultType: 'walkover' as const,
			winnerEntryId: 'b'
		}
	};
	const view = render(Graphic, { snapshot, graphic: 'post-game' });
	expect(view.container.querySelector('[data-entry-id="b"] [data-score]')?.textContent).toBe('13');
	expect(view.container.querySelector('[data-entry-id="a"] [data-score]')?.textContent).toBe('0');
	expect(view.container.textContent).not.toMatch(/forfeit|walkover/i);
});
