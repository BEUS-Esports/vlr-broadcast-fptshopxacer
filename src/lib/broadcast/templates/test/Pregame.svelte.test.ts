import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Graphic from './Graphic.svelte';
import type { BroadcastSnapshot } from '../../types';
import { defaultVisibility, defaultPlayerStats, graphicIds } from '../../controls';

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
		version: 2,
		controlRevision: 1,
		dataRevision: 1,
		liveControls: { swapped: true, currentAttackersEntryId: 'b' },
		publications: Object.fromEntries(
			graphicIds.map((id) => [id, null])
		) as BroadcastSnapshot['publications'],
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
	expect(
		getComputedStyle(left.querySelector('[data-side="defense"]')!).borderInlineStartColor
	).toBe('rgb(255, 70, 85)');
	expect(
		getComputedStyle(right.querySelector('[data-side="attack"]')!).borderInlineStartColor
	).toBe('rgb(36, 139, 255)');
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
	expect(view.container.textContent).toContain('Starting side unavailable');
});

it('renders saved veto sequence, actors and side choice, and preserves the fallback shells', async () => {
	const snapshot = preparedSnapshot();
	const view = render(Graphic, { snapshot, graphic: 'map-veto' });
	const steps = view.container.querySelectorAll('[data-sequence]');
	expect([...steps].map((node) => node.getAttribute('data-sequence'))).toEqual(['1', '2']);
	expect(steps[0].textContent).toContain('Team b');
	expect(steps[1].textContent).toContain('Team a');
	expect(steps[1].textContent).toContain('Game 1');
	expect(steps[1].textContent).toContain('Team b · Defender');
	expect(snapshot.veto.map((step) => step.sequence)).toEqual([2, 1]);
	await view.rerender({ snapshot: { ...snapshot, veto: [] }, graphic: 'map-veto' });
	expect(view.container.textContent).toContain('Veto unavailable');
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
		expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([64, 64, 1792, 952]);
		expect(getComputedStyle(section).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
		expect(section.scrollHeight).toBeLessThanOrEqual(section.clientHeight);
		for (const identity of section.querySelectorAll('.identity')) {
			expect(identity.scrollWidth).toBeLessThanOrEqual(identity.clientWidth);
		}
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
				expect(step.textContent).toContain(`Game ${snapshot.veto[index].gameNumber}`);
				expect(step.textContent).toContain(`${snapshot.teams[1].name} · Defender`);
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
	expect(left().textContent).toContain('Attacker');
	expect(right().textContent).toContain('Defender');
	expect(getComputedStyle(left().querySelector('[data-side]')!).borderInlineStartColor).toBe(
		'rgb(36, 139, 255)'
	);
	expect(getComputedStyle(right().querySelector('[data-side]')!).borderInlineStartColor).toBe(
		'rgb(255, 70, 85)'
	);
	await view.rerender({
		snapshot: {
			...snapshot,
			sides: { ...snapshot.sides, attackersEntryId: 'a', defendersEntryId: 'b' }
		},
		graphic: 'in-game'
	});
	expect(left().getAttribute('data-entry-id')).toBe('b');
	expect(left().textContent).toContain('Defender');
	expect(right().textContent).toContain('Attacker');
	expect(getComputedStyle(left().querySelector('[data-side]')!).borderInlineStartColor).toBe(
		'rgb(255, 70, 85)'
	);
	expect(getComputedStyle(right().querySelector('[data-side]')!).borderInlineStartColor).toBe(
		'rgb(36, 139, 255)'
	);
	await view.rerender({
		snapshot: { ...snapshot, presentation: { leftEntryId: 'a', rightEntryId: 'b' } },
		graphic: 'in-game'
	});
	expect(left().textContent).toContain('Team a');
	expect(left().textContent).toContain('Defender');
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
	expect(view.container.querySelector('[data-position="left"]')?.textContent ?? '').toContain(
		'Defender'
	);
	expect(view.container.textContent).toContain('Prepared sides');
	expect(view.container.textContent).toContain('Saved map');
	expect(view.container.textContent).toContain('Game 1');
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
	expect(view.container.textContent).toContain('Map unavailable');
	expect(view.container.textContent).toContain('Side unavailable');
	expect(
		[...view.container.querySelectorAll('[data-side]')].map((node) =>
			node.getAttribute('data-side')
		)
	).toEqual(['neutral', 'neutral']);
	expect(view.container.textContent).not.toMatch(
		/live score|round|health|armor|ammo|economy|killfeed|alive|K\/D\/A/i
	);
});

it('keeps all in-game content outside provisional native HUD areas at 1920x1080', async () => {
	await page.viewport(1920, 1080);
	// Provisional rehearsal bounds, not measured Valorant compatibility.
	const protectedAreas = [
		{ left: 0, top: 0, right: 460, bottom: 420 },
		{ left: 460, top: 0, right: 1460, bottom: 200 },
		{ left: 1460, top: 0, right: 1920, bottom: 420 },
		{ left: 0, top: 680, right: 1920, bottom: 1080 }
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
		expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([480, 224, 960, 112]);
		expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
		expect(section.scrollHeight).toBeLessThanOrEqual(section.clientHeight);
		for (const element of [section, ...section.querySelectorAll('*')]) {
			const box = element.getBoundingClientRect();
			if (!box.width || !box.height) continue;
			expect(box.left).toBeGreaterThanOrEqual(bounds.left);
			expect(box.right).toBeLessThanOrEqual(bounds.right);
			expect(box.top).toBeGreaterThanOrEqual(bounds.top);
			expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
			for (const area of protectedAreas) {
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
			expect(section.querySelectorAll('.placeholder')).toHaveLength(2);
		}
	}
});
