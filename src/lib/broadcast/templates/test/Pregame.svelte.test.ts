import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Graphic from './Graphic.svelte';
import AlternateGraphic from '../beus-graph-test/Graphic.svelte';
import { preparedSnapshot } from '../test-snapshot';

it('keeps five neutral lineup slots and saved player ownership after a presentation swap', async () => {
	const snapshot = preparedSnapshot();
	const view = render(Graphic, { snapshot, graphic: 'player-lineup' });
	const left = () => view.container.querySelector('[data-position="left"]')!;
	const right = () => view.container.querySelector('[data-position="right"]')!;
	expect(left()?.textContent ?? '').toContain('First B');
	expect(left().querySelectorAll('[data-slot]')).toHaveLength(5);
	expect(right().querySelector('[data-slot="2"]')?.textContent).toContain('Player unavailable');
	expect(right().querySelector('[data-slot="3"]')?.textContent).toContain('Third A');
	expect(
		[...view.container.querySelectorAll('[data-side]')].every(
			(node) => node.getAttribute('data-side') === 'neutral'
		)
	).toBe(true);
	await view.rerender({
		snapshot: { ...snapshot, presentation: { leftEntryId: 'a', rightEntryId: 'b' } },
		graphic: 'player-lineup'
	});
	expect(left().textContent).toContain('First A');
	expect(right().textContent).toContain('First B');
	await view.rerender({ snapshot: { ...snapshot, teams: [] }, graphic: 'player-lineup' });
	expect(left().textContent).toContain('Team unavailable');
	expect(left().textContent).toContain('First B');
});

it.each([
	['default', Graphic],
	['alternate', AlternateGraphic]
] as const)(
	'%s template filters by competition identity while preserving the presentation slot',
	async (_name, Template) => {
		const snapshot = preparedSnapshot();
		const view = render(Template, {
			snapshot: { ...snapshot, liveControls: { ...snapshot.liveControls, lineupTeams: 'team-a' } },
			graphic: 'player-lineup'
		});
		expect(view.container.querySelectorAll('[data-position]')).toHaveLength(1);
		expect(
			view.container.querySelector('[data-position="right"]')?.getAttribute('data-entry-id')
		).toBe('a');
		await view.rerender({
			snapshot: {
				...snapshot,
				liveControls: { ...snapshot.liveControls, lineupTeams: 'team-b' },
				presentation: { leftEntryId: 'a', rightEntryId: 'b' }
			},
			graphic: 'player-lineup'
		});
		expect(view.container.querySelectorAll('[data-position]')).toHaveLength(1);
		expect(
			view.container.querySelector('[data-position="right"]')?.getAttribute('data-entry-id')
		).toBe('b');
	}
);

it('uses prepared sides and saved agents despite opposite manual current sides', async () => {
	const snapshot = preparedSnapshot();
	const view = render(Graphic, { snapshot, graphic: 'agent-select' });
	const left = view.container.querySelector('[data-position="left"]')!;
	const right = view.container.querySelector('[data-position="right"]')!;
	expect(left?.textContent ?? '').toContain('Defender');
	expect(right.textContent).toContain('Attacker');
	expect(right.textContent).toContain('First A');
	expect(right.textContent).toContain('Saved agent');
	expect(left.querySelectorAll('[data-slot]')).toHaveLength(5);
	expect(getComputedStyle(left.querySelector('.side[data-side="defense"]')!).borderLeftColor).toBe(
		'rgb(255, 70, 85)'
	);
	expect(getComputedStyle(right.querySelector('.side[data-side="attack"]')!).borderLeftColor).toBe(
		'rgb(36, 139, 255)'
	);
	expect(view.container.textContent).toContain('Saved map');
	await view.rerender({ snapshot: { ...snapshot, teams: [] }, graphic: 'agent-select' });
	expect(view.container.querySelector('[data-position="right"]')?.textContent).toContain('First A');
	expect(view.container.querySelector('[data-position="right"]')?.textContent).toContain(
		'Attacker'
	);
	await view.rerender({
		snapshot: {
			...snapshot,
			teams: [],
			lineups: [],
			game: null,
			sides: { ...snapshot.sides, preparedAttackersEntryId: null, preparedDefendersEntryId: null }
		},
		graphic: 'agent-select'
	});
	expect(view.container.textContent).toContain('Team unavailable');
	expect(view.container.textContent).toContain('Agent unavailable');
	expect(view.container.textContent).toContain('Map unavailable');
	expect(view.container.textContent).toContain('SIDE TBD');
});

it('renders saved veto sequence, actors and side choice, and preserves the fallback shells', async () => {
	const snapshot = preparedSnapshot();
	const view = render(Graphic, { snapshot, graphic: 'map-veto' });
	const steps = view.container.querySelectorAll('[data-sequence]');
	expect([...steps].map((node) => node.getAttribute('data-sequence'))).toEqual(['1', '2']);
	expect(steps[0].textContent).toContain('Team b');
	expect(steps[1].textContent).toContain('Team a');
	expect(steps[1].textContent).toContain('GAME 1');
	expect(steps[1].textContent).toContain('b · DEFENSE');
	expect(snapshot.veto.map((step) => step.sequence)).toEqual([2, 1]);
	await view.rerender({ snapshot: { ...snapshot, veto: [] }, graphic: 'map-veto' });
	expect(view.container.textContent).toContain('VETO TBD');
	await view.rerender({ snapshot: { ...snapshot, selection: null }, graphic: 'player-lineup' });
	expect(view.container.textContent).toContain('No game selected');
	expect(view.container.querySelector('[data-slot]')).toBeNull();
});

it('bounds long names within transparent 1920x1080 concept margins', () => {
	const snapshot = preparedSnapshot();
	const longName = 'Long saved display name '.repeat(30);
	snapshot.teams.forEach((team) => (team.name = longName));
	snapshot.lineups.forEach((slot) => {
		if (slot.player) slot.player.displayName = longName;
	});
	snapshot.veto.forEach((step) => (step.map.displayName = longName));
	for (const graphic of ['player-lineup', 'agent-select', 'map-veto'] as const) {
		const view = render(Graphic, { snapshot, graphic });
		const section = view.container.querySelector('section')!;
		const bounds = section.getBoundingClientRect();
		expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([48, 48, 1824, 936]);
		expect(getComputedStyle(section).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
		expect(section.scrollHeight).toBeLessThanOrEqual(section.clientHeight);
		for (const identity of section.querySelectorAll('.identity')) {
			expect(identity.scrollWidth, `${graphic} identity overflow`).toBeLessThanOrEqual(
				identity.clientWidth
			);
		}
	}
});

it('keeps empty prepared previews visible within the fixed canvas', async () => {
	const snapshot = { ...preparedSnapshot(), selection: null };
	for (const graphic of [
		'player-lineup',
		'agent-select',
		'map-veto',
		'post-game',
		'player-stats',
		'mvp'
	] as const) {
		const view = render(Graphic, { snapshot, graphic });
		await expect.element(page.getByText('No game selected', { exact: true })).toBeVisible();
		const section = view.container.querySelector('section')!.getBoundingClientRect();
		const message = view.container.querySelector('.empty-state p')!.getBoundingClientRect();
		expect([section.x, section.y, section.width, section.height]).toEqual([48, 48, 1824, 936]);
		expect(message.left).toBeGreaterThanOrEqual(section.left);
		expect(message.right).toBeLessThanOrEqual(section.right);
		await view.unmount();
	}
});

it('keeps every action of a prepared seven-step veto visible without scrolling', () => {
	const snapshot = preparedSnapshot();
	const actions = ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'] as const;
	const image =
		'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="120"/%3E';
	snapshot.veto = actions.map((action, index) => ({
		sequence: index + 1,
		action,
		map: {
			...snapshot.veto[0].map,
			id: `map-${index}`,
			displayName: `Saved map ${index + 1}`,
			splashPath: image
		},
		actingEntryId: index % 2 === 0 ? 'a' : 'b',
		gameNumber: action === 'pick' ? index - 1 : action === 'decider' ? 3 : null,
		sideChooserEntryId: action === 'ban' ? null : 'b',
		sideChoice: action === 'ban' ? null : 'defense'
	}));
	for (const longNames of [false, true]) {
		if (longNames) {
			snapshot.teams.forEach((team) => (team.name += ' long saved name'.repeat(30)));
			snapshot.veto.forEach((step) => (step.map.displayName += ' long saved name'.repeat(30)));
		}
		const view = render(Graphic, { snapshot, graphic: 'map-veto' });
		const list = view.container.querySelector('ol')!;
		const bounds = list.getBoundingClientRect();
		const steps = list.querySelectorAll('[data-sequence]');
		expect(steps).toHaveLength(7);
		expect(list.scrollHeight).toBeLessThanOrEqual(list.clientHeight);
		for (const [index, step] of [...steps].entries()) {
			const box = step.getBoundingClientRect();
			expect(box.top).toBeGreaterThanOrEqual(bounds.top);
			expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
			expect(step.textContent).toContain(snapshot.veto[index].map.displayName);
			expect(step.textContent).toContain(index % 2 === 0 ? 'Team a' : 'Team b');
			if (snapshot.veto[index].gameNumber !== null) {
				expect(step.textContent).toContain(`GAME ${snapshot.veto[index].gameNumber}`);
				expect(step.textContent).toContain(`${snapshot.teams[1].tag} · DEFENSE`);
			}
		}
		expect(steps[6].getBoundingClientRect().bottom).toBeLessThanOrEqual(1016);
	}
});

it('renders current in-game sides and changes colors without moving team ownership', async () => {
	const snapshot = preparedSnapshot();
	const saved = structuredClone(snapshot);
	const view = render(Graphic, { snapshot, graphic: 'in-game' });
	const left = () => view.container.querySelector('[data-position="left"]')!;
	const right = () => view.container.querySelector('[data-position="right"]')!;
	expect(left()?.textContent ?? '').toContain('Team b');
	expect(left().getAttribute('data-side')).toBe('attack');
	expect(right().getAttribute('data-side')).toBe('defense');
	expect(getComputedStyle(left()).borderBottomColor).toBe('rgb(36, 139, 255)');
	expect(getComputedStyle(right()).borderBottomColor).toBe('rgb(255, 70, 85)');
	await view.rerender({
		snapshot: {
			...snapshot,
			sides: { ...snapshot.sides, attackersEntryId: 'a', defendersEntryId: 'b' }
		},
		graphic: 'in-game'
	});
	expect(left().getAttribute('data-entry-id')).toBe('b');
	expect(left().getAttribute('data-side')).toBe('defense');
	expect(right().getAttribute('data-side')).toBe('attack');
	expect(getComputedStyle(left()).borderBottomColor).toBe('rgb(255, 70, 85)');
	expect(getComputedStyle(right()).borderBottomColor).toBe('rgb(36, 139, 255)');
	await view.rerender({
		snapshot: { ...snapshot, presentation: { leftEntryId: 'a', rightEntryId: 'b' } },
		graphic: 'in-game'
	});
	expect(left().textContent).toContain('Team a');
	expect(left().getAttribute('data-side')).toBe('defense');
	expect(right().textContent).toContain('Team b');
	expect(snapshot).toEqual(saved);
	expect(view.container.querySelector('h1')).toBeNull();
	expect(
		view.container.querySelector('button, input, select, [data-score-scope], [data-slot]')
	).toBeNull();
});

it('renders prepared fallback and unknown in-game sides without invented live context', async () => {
	const snapshot = preparedSnapshot();
	snapshot.sides = {
		...snapshot.sides,
		attackersEntryId: 'a',
		defendersEntryId: 'b',
		source: 'prepared'
	};
	const view = render(Graphic, { snapshot, graphic: 'in-game' });
	expect(view.container.querySelector('[data-position="left"]')?.getAttribute('data-side')).toBe(
		'defense'
	);
	expect(view.container.querySelector('section')?.getAttribute('data-side-source')).toBe(
		'prepared'
	);
	expect(view.container.textContent).toContain('Saved map');
	expect(view.container.textContent).toContain('MATCH - MAP 1');
	await view.rerender({
		snapshot: {
			...snapshot,
			game: null,
			teams: [],
			sides: {
				preparedAttackersEntryId: null,
				preparedDefendersEntryId: null,
				attackersEntryId: null,
				defendersEntryId: null,
				source: 'unknown'
			}
		},
		graphic: 'in-game'
	});
	expect(view.container.textContent).toContain('Team unavailable');
	expect(view.container.textContent).toContain('MAP TBD');
	expect(view.container.querySelector('section')?.getAttribute('data-side-source')).toBe('unknown');
	expect(
		[...view.container.querySelectorAll('.team-rail')].map((node) => node.getAttribute('data-side'))
	).toEqual(['neutral', 'neutral']);
	expect(view.container.textContent).not.toMatch(
		/live score|round|health|armor|ammo|economy|killfeed|alive|K\/D\/A/i
	);
});

it('bounds native team rails and match context while reserving timer and killfeed space', async () => {
	await page.viewport(1920, 1080);
	// Regression bounds for the accepted native composition; OBS rehearsal remains separate.
	// Game strip + timer, kill feed/weapons, ability bar, spectated-player portrait.
	const protectedAreas = [
		{ left: 400, top: 28, right: 1520, bottom: 90 },
		{ left: 1440, top: 90, right: 1920, bottom: 420 },
		{ left: 530, top: 680, right: 1920, bottom: 1080 },
		{ left: 0, top: 790, right: 300, bottom: 878 }
	];
	const snapshot = preparedSnapshot();
	const longName = 'Long saved identity '.repeat(50);
	snapshot.teams.forEach((team) => {
		team.name = longName;
		team.tag = longName;
	});
	snapshot.tournament = { id: 't', name: longName, slug: 't' };
	snapshot.match = {
		id: 'm',
		label: longName,
		bestOf: 3,
		scoreA: 1,
		scoreB: 0,
		resultType: null,
		winnerEntryId: null
	};
	snapshot.game!.map!.displayName = longName;
	snapshot.game!.name = longName;
	const view = render(Graphic, { snapshot, graphic: 'in-game' });
	for (const state of [
		snapshot,
		{
			...snapshot,
			sides: {
				...snapshot.sides,
				attackersEntryId: null,
				defendersEntryId: null,
				source: 'unknown' as const
			}
		},
		{ ...snapshot, teams: [], game: null, tournament: null, match: null },
		{ ...snapshot, selection: null }
	]) {
		await view.rerender({ snapshot: state, graphic: 'in-game' });
		const section = view.container.querySelector('section')!;
		const bounds = section.getBoundingClientRect();
		expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([0, 0, 1920, 1080]);
		expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
		expect(section.scrollHeight).toBeLessThanOrEqual(section.clientHeight);
		const regions = section.querySelectorAll(
			'.team-rail, .team-logo, .best-of, .match-bug, .event-logo, .sponsor-slot, .empty'
		);
		for (const element of regions) {
			const box = element.getBoundingClientRect();
			if (!box.width || !box.height) continue;
			expect(box.left).toBeGreaterThanOrEqual(bounds.left);
			expect(box.right).toBeLessThanOrEqual(bounds.right);
			expect(box.top).toBeGreaterThanOrEqual(bounds.top);
			expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
			for (const area of state.selection ? protectedAreas : []) {
				expect(
					box.right <= area.left ||
						box.left >= area.right ||
						box.bottom <= area.top ||
						box.top >= area.bottom
				).toBe(true);
			}
		}
		if (!state.selection) {
			expect(section.textContent).toContain('No game selected');
			expect(section.querySelector('[data-position]')).toBeNull();
		} else {
			expect(section.querySelectorAll('.team-rail')).toHaveLength(2);
			const rails = [...section.querySelectorAll('.team-rail')].map((rail) => {
				const box = rail.getBoundingClientRect();
				return [box.x, box.y, box.width, box.height];
			});
			expect(rails).toEqual([
				[402, 0, 470, 28],
				[1048, 0, 470, 28]
			]);
			for (const name of section.querySelectorAll('.team-rail strong')) {
				expect(name.scrollWidth).toBeGreaterThanOrEqual(name.clientWidth);
				expect(getComputedStyle(name).textOverflow).toBe('clip');
			}
		}
	}
});

it('labels best-of and map count for Bo1 and Bo5', async () => {
	const snapshot = preparedSnapshot();
	const match = (bestOf: number) => ({
		id: 'm',
		label: 'GRAND FINALS',
		bestOf,
		scoreA: 0,
		scoreB: 0,
		resultType: null,
		winnerEntryId: null
	});
	const view = render(Graphic, { snapshot: { ...snapshot, match: match(1) }, graphic: 'in-game' });
	const dots = () =>
		[...view.container.querySelectorAll('[data-win-dots]')].map((el) => el.children.length);
	expect(view.container.textContent).toContain('BEST OF 1');
	expect(view.container.textContent).toContain('GRAND FINALS - MAP 1/1');
	expect(dots()).toEqual([1, 1]);
	await view.rerender({
		snapshot: { ...snapshot, match: match(5), game: { ...snapshot.game!, number: 3 } },
		graphic: 'in-game'
	});
	expect(view.container.textContent).toContain('BEST OF 5');
	expect(view.container.textContent).toContain('GRAND FINALS - MAP 3/5');
	expect(dots()).toEqual([3, 3]);
});
