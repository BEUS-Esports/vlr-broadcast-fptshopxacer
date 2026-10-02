import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GraphicRenderer from './GraphicRenderer.svelte';
import { defaultPlayerStats, defaultVisibility, graphicIds } from './controls';
import type { BroadcastPreparedSnapshot, BroadcastPublications, BroadcastSnapshot } from './types';

it('renders latest preview when hidden and shared captured program data when shown', async () => {
	const scope = {
		statistics: { scope: 'game' as const, gamesTotal: 0, gamesContributing: 0, players: [] },
		candidates: [],
		mvpPlayerId: null
	};
	const prepared: BroadcastPreparedSnapshot = {
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
