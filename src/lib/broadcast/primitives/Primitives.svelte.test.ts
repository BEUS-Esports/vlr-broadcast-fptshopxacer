import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Identity from './Identity.svelte';
import StatValue from './StatValue.svelte';
import ResourceCard from './ResourceCard.svelte';
import ScoreHeader from './ScoreHeader.svelte';
import type { BroadcastSnapshot } from '../types';
import { defaultVisibility, defaultPlayerStats } from '../controls';

it('shows missing and failed assets, resets on a new identity, and preserves zero and coverage', async () => {
	const identity = render(Identity, {
		name: null,
		assetPath: null,
		unavailable: 'Player unavailable'
	});
	expect(identity.container.textContent).toContain('Player unavailable');
	expect(identity.container.querySelector('img')).toBeNull();
	await identity.rerender({
		name: 'Player',
		assetPath: '/missing.png',
		unavailable: 'Player unavailable',
		side: 'attack'
	});
	identity.container.querySelector('img')!.dispatchEvent(new Event('error'));
	await expect.poll(() => identity.container.querySelector('img')).toBeNull();
	expect(identity.container.querySelector('[data-side]')?.getAttribute('data-side')).toBe('attack');
	await identity.rerender({
		name: 'Next',
		assetPath: '/next.png',
		unavailable: 'Player unavailable',
		side: 'defense'
	});
	expect(identity.container.querySelector('img')?.getAttribute('src')).toBe('/next.png');
	const stat = render(StatValue, { label: 'Kills', metric: { value: 0, coverage: 'partial' } });
	expect(stat.container.textContent).toContain('0');
	expect(stat.container.textContent).toContain('Partial coverage');
	await stat.rerender({ label: 'Kills', metric: { value: null, coverage: 'none' } });
	expect(stat.container.textContent).toContain('Unavailable');
});

it('renders unknown resources and competition-owned scores in swapped presentation order', async () => {
	const resource = render(ResourceCard, { resource: { kind: 'agent', value: null } });
	expect(resource.container.textContent).toContain('Agent unavailable');
	await resource.rerender({ resource: { kind: 'map', value: null } });
	expect(resource.container.textContent).toContain('Map unavailable');
	await resource.rerender({
		resource: {
			kind: 'player',
			value: { playerId: 'p', displayName: 'Saved player', portraitPath: null }
		}
	});
	expect(resource.container.textContent).toContain('Saved player');
	const team = (entryId: string) => ({
		entryId,
		teamId: entryId,
		name: entryId,
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
	const snapshot: BroadcastSnapshot = {
		version: 3,
		controlRevision: 1,
		dataRevision: 1,
		liveControls: {
			swapped: true,
			currentAttackersEntryId: 'b',
			pause: { type: 'none' },
			ceremony: null
		},
		publications: {
			'player-lineup': null,
			'player-stats': null,
			'map-veto': null,
			'agent-select': null,
			'in-game': null,
			'post-game': null,
			mvp: null
		},
		selection: null,
		tournament: null,
		match: null,
		game: {
			id: 'g',
			name: 'g',
			number: 1,
			map: null,
			scoreA: 0,
			scoreB: null,
			resultType: 'forfeit',
			winnerEntryId: 'a'
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
		lineups: [],
		veto: [],
		scopes: {
			game: scope,
			match: { ...scope, statistics: { ...scope.statistics, scope: 'match' } },
			tournament: { ...scope, statistics: { ...scope.statistics, scope: 'tournament' } }
		},
		controls: { visibility: defaultVisibility, playerStats: defaultPlayerStats, mvpScope: 'game' },
		readiness: { selected: false, map: false, lineups: false, agents: false, result: false }
	};
	const header = render(ScoreHeader, { snapshot, sides: 'prepared' });
	const left = () => header.container.querySelector('[data-position="left"]')!;
	const right = () => header.container.querySelector('[data-position="right"]')!;
	expect(left().getAttribute('data-entry-id')).toBe('b');
	expect(left().textContent).toContain('Unavailable');
	expect(right().querySelector('.score')?.textContent).toBe('0');
	expect(left().textContent).toContain('Defender');
	expect(getComputedStyle(left().querySelector('[data-side]')!).borderInlineStartColor).toBe(
		'rgb(255, 70, 85)'
	);
	expect(getComputedStyle(right().querySelector('[data-side]')!).borderInlineStartColor).toBe(
		'rgb(36, 139, 255)'
	);
	expect(header.container.textContent).toContain('Forfeit');
	expect(header.container.textContent).toContain('Winner: a');
	await header.rerender({ snapshot, sides: 'current' });
	expect(left().textContent).toContain('Attacker');
	expect(left().getAttribute('data-entry-id')).toBe('b');
	await header.rerender({ snapshot, sides: 'neutral' });
	expect(left().querySelector('[data-side]')?.getAttribute('data-side')).toBe('neutral');
	const neutral = render(ScoreHeader, { snapshot });
	expect(neutral.container.querySelector('[data-side]')?.getAttribute('data-side')).toBe('neutral');
	await header.rerender({ snapshot: { ...snapshot, teams: [] }, sides: 'prepared' });
	expect(right().getAttribute('data-entry-id')).toBe('a');
	expect(right().querySelector('.score')?.textContent).toBe('0');
	expect(right().querySelector('[data-side]')?.getAttribute('data-side')).toBe('attack');
	expect(header.container.textContent).toContain('Winner: Team unavailable');
});
