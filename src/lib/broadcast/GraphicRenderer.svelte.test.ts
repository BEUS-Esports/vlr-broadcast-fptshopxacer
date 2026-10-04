import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GraphicRenderer from './GraphicRenderer.svelte';
import { defaultPlayerStats, defaultVisibility, graphicIds } from './controls';
import type { BroadcastPreparedSnapshot, BroadcastPublications, BroadcastSnapshot } from './types';
import { liveGameFixture, liveSessionFixture } from '#lib/live/fixtures.ts';
import type { LiveGameEnvelope } from '#lib/live/types.ts';

function preparedFixture(): BroadcastPreparedSnapshot {
	const scope = {
		statistics: { scope: 'game' as const, gamesTotal: 0, gamesContributing: 0, players: [] },
		candidates: [],
		mvpPlayerId: null
	};
	return {
		version: 2,
		controlRevision: 1,
		dataRevision: 1,
		liveControls: { swapped: false, currentAttackersEntryId: null },
		selection: { tournamentId: 't', matchId: 'm', gameId: 'g' },
		tournament: { id: 't', name: 'Test', slug: 'test' },
		match: {
			id: 'm',
			label: 'Match',
			bestOf: 1,
			scoreA: 0,
			scoreB: 0,
			resultType: null,
			winnerEntryId: null
		},
		game: {
			id: 'g',
			name: 'Saved',
			number: 1,
			map: null,
			scoreA: null,
			scoreB: null,
			resultType: null,
			winnerEntryId: null
		},
		competition: { teamAEntryId: null, teamBEntryId: null },
		presentation: { leftEntryId: null, rightEntryId: null },
		sides: {
			preparedAttackersEntryId: null,
			preparedDefendersEntryId: null,
			attackersEntryId: null,
			defendersEntryId: null,
			source: 'unknown'
		},
		teams: [],
		lineups: [],
		veto: [],
		scopes: {
			game: scope,
			match: { ...scope, statistics: { ...scope.statistics, scope: 'match' } },
			tournament: { ...scope, statistics: { ...scope.statistics, scope: 'tournament' } }
		},
		controls: { visibility: defaultVisibility, playerStats: defaultPlayerStats, mvpScope: 'game' },
		readiness: { selected: true, map: false, lineups: false, agents: false, result: false }
	};
}

it('renders latest preview when hidden and shared captured program data when shown', async () => {
	const prepared = preparedFixture();
	const snapshot: BroadcastSnapshot = {
		...prepared,
		dataRevision: 2,
		publications: Object.fromEntries(graphicIds.map((id) => [id, null])) as BroadcastPublications
	};
	const preview = render(GraphicRenderer, { snapshot, graphic: 'in-game', mode: 'preview' });
	const program = render(GraphicRenderer, { snapshot, graphic: 'in-game' });
	const previewFrame = () => preview.container.querySelector('[data-render-mode]')!;
	const programFrame = () => program.container.querySelector('[data-render-mode]')!;
	expect(previewFrame().getAttribute('data-data-revision')).toBe('2');
	expect(previewFrame().children.length).toBe(1);
	expect(programFrame().children.length).toBe(0);
	const shown = {
		...snapshot,
		controls: { ...snapshot.controls, visibility: { ...defaultVisibility, 'in-game': true } },
		publications: { ...snapshot.publications, 'in-game': prepared }
	};
	await program.rerender({ snapshot: shown, graphic: 'in-game' });
	expect(programFrame().getAttribute('data-data-revision')).toBe('1');
	expect(programFrame().children.length).toBe(1);
	await preview.rerender({ snapshot: shown, graphic: 'in-game', mode: 'preview' });
	expect(previewFrame().getAttribute('data-data-revision')).toBe('2');
	await program.rerender({
		snapshot: { ...shown, publications: snapshot.publications },
		graphic: 'in-game'
	});
	await expect.poll(() => programFrame().children.length).toBe(0);
});

it('keeps normal and live HUD previews independent of the on-air HUD mode', async () => {
	const prepared = {
		...preparedFixture(),
		competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
		presentation: { leftEntryId: 'a', rightEntryId: 'b' }
	};
	const snapshot: BroadcastSnapshot = {
		...prepared,
		controls: { ...prepared.controls, visibility: { ...defaultVisibility, 'in-game': true } },
		publications: {
			...Object.fromEntries(graphicIds.map((id) => [id, null])),
			'in-game': prepared
		} as BroadcastPublications
	};
	const state = liveGameFixture({ selectedGameId: 'g' });
	state.teams = state.teams.map((team, index) => ({
		...team,
		entryId: index ? 'b' : 'a',
		players: team.players
	}));
	const telemetry: LiveGameEnvelope = {
		version: 1,
		stream: { epoch: 'epoch', sequence: 1 },
		state,
		status: liveSessionFixture({ selectedGameId: 'g', mappingReady: true, health: 'ready' })
	};
	const normal = render(GraphicRenderer, {
		snapshot,
		graphic: 'in-game',
		mode: 'preview',
		telemetry
	});
	const live = render(GraphicRenderer, {
		snapshot,
		graphic: 'in-game',
		mode: 'preview-live',
		telemetry
	});
	const program = render(GraphicRenderer, { snapshot, graphic: 'in-game', telemetry });
	expect(normal.container.querySelector('[data-live-hud]')).toBeNull();
	expect(normal.container.querySelector('[aria-label="In-Game"]')).not.toBeNull();
	expect(live.container.querySelector('[data-live-hud]')).not.toBeNull();
	expect(live.container.querySelectorAll('[data-health]')).toHaveLength(2);
	expect(program.container.querySelector('[data-live-hud]')).toBeNull();
	const onAir = {
		...telemetry,
		status: { ...telemetry.status, mode: 'external' as const, health: 'live' as const }
	};
	await normal.rerender({ snapshot, graphic: 'in-game', mode: 'preview', telemetry: onAir });
	await program.rerender({ snapshot, graphic: 'in-game', telemetry: onAir });
	expect(normal.container.querySelector('[data-live-hud]')).toBeNull();
	expect(program.container.querySelector('[data-live-hud]')).not.toBeNull();
	await live.rerender({
		snapshot,
		graphic: 'in-game',
		mode: 'preview-live',
		telemetry: { ...telemetry, status: { ...telemetry.status, mappingReady: false } }
	});
	expect(live.container.querySelector('[data-live-hud]')).not.toBeNull();
	expect(live.container.textContent).toContain('Player');
	expect(live.container.querySelectorAll('[data-health]')).toHaveLength(2);
	expect(live.container.querySelector('[data-health]')?.textContent).toContain('100');
	expect(live.container.querySelector('[data-player-id=""]')).not.toBeNull();
	await live.rerender({
		snapshot,
		graphic: 'in-game',
		mode: 'preview-live',
		telemetry: { ...telemetry, state: null }
	});
	expect(live.container.querySelector('[data-live-hud]')).not.toBeNull();
	expect(live.container.querySelectorAll('[data-health]')).toHaveLength(0);
});

it('shows the entire live HUD template immediately with empty fields when no data exists', () => {
	const snapshot: BroadcastSnapshot = {
		...preparedFixture(),
		selection: null,
		match: null,
		game: null,
		publications: Object.fromEntries(graphicIds.map((id) => [id, null])) as BroadcastPublications
	};
	const view = render(GraphicRenderer, {
		graphic: 'in-game',
		snapshot,
		mode: 'preview-live'
	});
	const hud = view.container.querySelector('[data-live-hud]');
	expect(hud).not.toBeNull();
	expect(hud?.querySelectorAll('.team-rail')).toHaveLength(2);
	expect(hud?.querySelectorAll('article')).toHaveLength(10);
	expect(hud?.textContent?.trim()).toBe('');
	expect(view.container.textContent).not.toContain('Live data unavailable');
});

it('renders a provider template without game preparation or healthy status', () => {
	const snapshot: BroadcastSnapshot = {
		...preparedFixture(),
		selection: null,
		publications: Object.fromEntries(graphicIds.map((id) => [id, null])) as BroadcastPublications
	};
	const state = liveGameFixture({ provider: 'spectra', selectedGameId: null });
	state.teams = state.teams.map((team, index) => ({
		...team,
		providerSide: index ? 'team-1' : 'team-0',
		observedName: index ? 'Provider Bravo' : 'Provider Alpha',
		attacking: !index,
		players: team.players.map((player) => ({
			...player,
			providerSlot: null,
			observedName: index ? 'Observed Bravo' : 'Observed Alpha',
			health: index ? null : 75
		}))
	}));
	state.rounds = [{ round: 1, winnerProviderSide: 'team-1', reason: 'elimination' }];
	const preview = render(GraphicRenderer, {
		snapshot,
		graphic: 'in-game',
		mode: 'preview-live',
		telemetry: {
			version: 1,
			stream: { epoch: 'epoch', sequence: 1 },
			state,
			status: liveSessionFixture({ provider: 'spectra', selectedGameId: null, health: 'fallback' })
		}
	});
	expect(preview.container.querySelector('[data-live-hud]')?.getAttribute('data-identity')).toBe(
		'provider'
	);
	expect(preview.container.textContent).toContain('Provider Alpha');
	expect(preview.container.textContent).toContain('Provider Bravo');
	expect(preview.container.textContent).toContain('Observed Alpha');
	expect(preview.container.textContent).toContain('Observed Bravo');
	expect(preview.container.textContent).not.toContain('No game selected');
	expect(preview.container.querySelectorAll('[data-win-dots]')).toHaveLength(0);
	expect(preview.container.querySelectorAll('[data-health]')).toHaveLength(1);
	expect(preview.container.querySelector('[data-health]')?.textContent).toMatch(/^75\s+HP$/);
	expect(preview.container.querySelectorAll('[data-player-id=""]')).toHaveLength(10);
	expect(
		preview.container.querySelector('.team-rail[data-position="left"]')?.getAttribute('data-side')
	).toBe('attack');
	expect(
		preview.container.querySelector('[data-winner-position="right"]')?.getAttribute('title')
	).toContain('Provider Bravo');
});
