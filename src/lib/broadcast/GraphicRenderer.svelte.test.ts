import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import GraphicRenderer from './GraphicRenderer.svelte';
import GraphicPreview from '#lib/components/admin/graphics/GraphicPreview.svelte';
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
		version: 3,
		controlRevision: 1,
		dataRevision: 1,
		liveControls: {
			swapped: false,
			currentAttackersEntryId: null,
			pause: { type: 'none' },
			ceremony: null
		},
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

it('credits saved Spectra reports independently of the live provider and respects captured scope', async () => {
	const prepared = preparedFixture();
	prepared.scopes.game.usesSpectra = true;
	const snapshot: BroadcastSnapshot = {
		...prepared,
		publications: Object.fromEntries(graphicIds.map((id) => [id, null])) as BroadcastPublications
	};
	const view = render(GraphicRenderer, { snapshot, graphic: 'post-game', mode: 'preview' });
	const badge = () => view.container.querySelector('[aria-label="Provider attribution"]');
	expect(badge()).not.toBeNull();
	const telemetry: LiveGameEnvelope = {
		version: 1,
		stream: { epoch: 'test', sequence: 1 },
		state: null,
		status: liveSessionFixture({ provider: null, spectraAttribution: 'supporter' })
	};
	await view.rerender({ snapshot, graphic: 'post-game', mode: 'preview', telemetry });
	expect(badge()).toBeNull();
	telemetry.status = liveSessionFixture({ provider: 'gstack', spectraAttribution: 'required' });
	await view.rerender({ snapshot, graphic: 'post-game', mode: 'preview', telemetry });
	expect(badge()).not.toBeNull();
	for (const graphic of ['player-stats', 'mvp'] as const) {
		await view.rerender({ snapshot, graphic, mode: 'preview', telemetry });
		expect(badge()).not.toBeNull();
	}
	const shown = {
		...snapshot,
		scopes: { ...snapshot.scopes, game: { ...snapshot.scopes.game, usesSpectra: false } },
		controls: { ...snapshot.controls, visibility: { ...defaultVisibility, 'post-game': true } },
		publications: { ...snapshot.publications, 'post-game': prepared }
	};
	await view.rerender({ snapshot: shown, graphic: 'post-game', mode: 'program', telemetry });
	expect(badge()).not.toBeNull();
	await view.rerender({ snapshot, graphic: 'post-game', mode: 'program', telemetry });
	await expect.poll(badge).toBeNull();
	await view.rerender({ snapshot, graphic: 'player-lineup', mode: 'preview', telemetry });
	expect(badge()).toBeNull();
});

it('refreshes weapon artwork in an open preview without a snapshot change', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	const icon = (color: string) =>
		`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="${color}" d="M0 0h1v1H0z"/></svg>`)}`;
	let displayIconPath = icon('red');
	const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
		Response.json({
			agents: [],
			weapons: [{ key: 'classic', displayName: 'Classic', displayIconPath }]
		})
	);
	const snapshot: BroadcastSnapshot = {
		...preparedFixture(),
		publications: Object.fromEntries(graphicIds.map((id) => [id, null])) as BroadcastPublications
	};
	const view = render(GraphicPreview, {
		graphic: 'in-game',
		snapshot,
		connection: 'connected',
		variant: 'live-data',
		telemetry: {
			version: 1,
			stream: { epoch: 'test', sequence: 1 },
			state: liveGameFixture(),
			status: liveSessionFixture()
		}
	});
	const weaponIcon = () => view.container.querySelector('img[alt="Classic"]')?.getAttribute('src');
	try {
		await vi.advanceTimersByTimeAsync(0);
		await tick();
		await expect.poll(weaponIcon).toBe(displayIconPath);
		displayIconPath = icon('blue');
		await vi.advanceTimersByTimeAsync(30_000);
		await tick();
		expect(fetcher).toHaveBeenCalledTimes(2);
		await expect.poll(weaponIcon).toBe(displayIconPath);
	} finally {
		await view.unmount();
		fetcher.mockRestore();
		vi.useRealTimers();
	}
});

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
	expect(preview.container.querySelector('[data-sponsor-safe-area]')).toBeNull();
	expect(preview.container.querySelector('img[alt="ValoSpectra"]')).not.toBeNull();
	expect(
		preview.container.querySelector('.team-rail[data-position="left"]')?.getAttribute('data-side')
	).toBe('attack');
	expect(
		preview.container.querySelector('[data-winner-position="right"]')?.getAttribute('title')
	).toContain('Provider Bravo');
});

function bannerFixture(): BroadcastSnapshot {
	const prepared = preparedFixture();
	return {
		...prepared,
		competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
		presentation: { leftEntryId: 'a', rightEntryId: 'b' },
		teams: ['a', 'b'].map((entryId) => ({
			entryId,
			teamId: entryId,
			name: entryId === 'a' ? 'Local Alpha' : 'Local Bravo',
			tag: entryId.toUpperCase(),
			logoPath: null,
			logoWhitePath: null,
			logoBlackPath: null
		})),
		liveControls: {
			...prepared.liveControls,
			pause: { type: 'tactical', entryId: 'a', pendingTechnical: false }
		},
		publications: Object.fromEntries(graphicIds.map((id) => [id, null])) as BroadcastPublications
	};
}

it('shares the local banner across native, live, empty-provider previews and HUD mode changes', async () => {
	const snapshot = bannerFixture();
	const state = liveGameFixture({ selectedGameId: 'g' });
	state.teams[0].observedName = 'Provider Alpha';
	const telemetry: LiveGameEnvelope = {
		version: 1,
		stream: { epoch: 'epoch', sequence: 1 },
		state,
		status: liveSessionFixture({ selectedGameId: 'g', health: 'fallback' })
	};
	for (const mode of ['preview', 'preview-live'] as const) {
		const view = render(GraphicRenderer, { snapshot, graphic: 'in-game', mode, telemetry });
		const banner = () => view.container.querySelector('[data-match-banner]');
		expect(banner()?.textContent).toContain('TACTICAL TIMEOUT');
		expect(banner()?.textContent).toContain('Local Alpha');
		expect(banner()?.textContent).not.toContain('Provider Alpha');
		await view.rerender({ snapshot, graphic: 'in-game', mode, telemetry: null });
		expect(banner()?.getAttribute('data-entry-id')).toBe('a');
	}
	const held = {
		...preparedFixture(),
		competition: snapshot.competition,
		presentation: snapshot.presentation,
		teams: snapshot.teams
	};
	const shown = {
		...snapshot,
		controls: { ...snapshot.controls, visibility: { ...defaultVisibility, 'in-game': true } },
		publications: { ...snapshot.publications, 'in-game': held }
	};
	const program = render(GraphicRenderer, { snapshot: shown, graphic: 'in-game', telemetry });
	await program.rerender({
		snapshot: shown,
		graphic: 'in-game',
		telemetry: {
			...telemetry,
			status: { ...telemetry.status, mode: 'external', health: 'live', mappingReady: true }
		}
	});
	expect(
		program.container.querySelector('[data-match-banner]')?.getAttribute('data-entry-id')
	).toBe('a');
	await program.rerender({
		snapshot: {
			...shown,
			dataRevision: 2,
			liveControls: { ...shown.liveControls, pause: { type: 'technical' } }
		},
		graphic: 'in-game',
		telemetry
	});
	expect(program.container.querySelector('[data-match-banner]')?.textContent).toContain(
		'TECHNICAL PAUSE'
	);
	expect(
		program.container.querySelector('[data-render-mode]')?.getAttribute('data-data-revision')
	).toBe('1');
	expect(shown.publications['in-game']).toBe(held);
});

it('removes the banner immediately on hide and never retains an outgoing slot on show', async () => {
	const snapshot = bannerFixture();
	const held = {
		...preparedFixture(),
		competition: snapshot.competition,
		presentation: snapshot.presentation,
		teams: snapshot.teams
	};
	const shown = {
		...snapshot,
		controls: { ...snapshot.controls, visibility: { ...defaultVisibility, 'in-game': true } },
		publications: { ...snapshot.publications, 'in-game': held }
	};
	const view = render(GraphicRenderer, { snapshot: shown, graphic: 'in-game' });
	expect(view.container.querySelectorAll('[data-match-banner]')).toHaveLength(1);
	await view.rerender({ snapshot, graphic: 'in-game' });
	expect(view.container.querySelectorAll('[data-match-banner]')).toHaveLength(0);
	await view.rerender({ snapshot: shown, graphic: 'in-game' });
	expect(view.container.querySelectorAll('[data-match-banner]')).toHaveLength(1);
});
