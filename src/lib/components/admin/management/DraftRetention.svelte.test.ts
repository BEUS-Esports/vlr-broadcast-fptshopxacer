import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import PostGameEditor from './PostGameEditor.svelte';
import MvpPicker from './MvpPicker.svelte';
import GraphicControls from '../graphics/GraphicControls.svelte';
import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
import { defaultVisibility, defaultPlayerStats } from '#lib/broadcast/controls.ts';

it('retains a dirty statistics row and reviewed identity when the saved lineup becomes empty', async () => {
	const props = {
		revision: 3,
		entries: [{ id: 'a', name: 'Alpha' }],
		scoreboard: [{ entryId: 'a', playerId: 'p1', slot: 1, agentId: 'jett', kills: null }],
		players: [{ id: 'p1', displayName: 'First player' }],
		agents: [{ id: 'jett', displayName: 'Jett', isActive: true }],
		provenance: {
			importSource: null,
			externalMatchId: null,
			importedAt: null,
			lastManualEditAt: null,
			manuallyChangedPlayerIds: []
		},
		resultType: null
	};
	const view = render(PostGameEditor, props);
	const kills = page.getByRole('textbox', { name: 'First player Kills', exact: true });
	await kills.fill('12');
	await view.rerender({ ...props, revision: 4, scoreboard: [], players: [], agents: [] });
	await expect.element(kills).toHaveValue('12');
	await expect
		.element(page.getByRole('cell', { name: 'First player Agent', exact: true }))
		.toHaveTextContent('Jett');
	const payload = JSON.parse(
		view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value
	);
	expect(payload).toMatchObject({
		expectedGameRevision: 3,
		players: [{ playerId: 'p1', entryId: 'a', kills: '12' }]
	});
});

it('keeps an unsaved MVP candidate visible after their last eligible appearance is removed', async () => {
	const props = {
		revision: 2,
		selected: null,
		candidates: [{ id: 'p1', displayName: 'Reviewed player' }],
		scope: 'Game'
	};
	const view = render(MvpPicker, props);
	const select = page.getByRole('combobox', { name: 'Player', exact: true });
	await select.selectOptions('p1');
	await view.rerender({ ...props, revision: 3, candidates: [] });
	await expect.element(select).toHaveValue('p1');
	expect((select.element() as HTMLSelectElement).selectedOptions[0].textContent).toBe(
		'Reviewed player · Unavailable'
	);
	expect(
		JSON.parse(view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value)
	).toMatchObject({ expectedRevision: 2, playerId: 'p1' });
});

it('MVP scope owns only its controls and does not resubmit retained Player Stats picks', async () => {
	const live = {
		controlRevision: 4,
		dataRevision: 2,
		selection: { tournamentId: 't', matchId: 'm', gameId: 'g' },
		publications: { mvp: null },
		controls: {
			visibility: defaultVisibility,
			playerStats: { ...defaultPlayerStats, playerId: 'removed-player' },
			mvpScope: 'game'
		}
	} as BroadcastSnapshot;
	const view = render(GraphicControls, { graphic: 'mvp', live });
	await page.getByRole('combobox', { name: 'MVP scope', exact: true }).selectOptions('match');
	const payloads = Array.from(
		view.container.querySelectorAll<HTMLInputElement>('input[name="payload"]'),
		(input) => JSON.parse(input.value)
	);
	expect(payloads[1]).toEqual({ expectedRevision: 4, mvpScope: 'match' });
});
