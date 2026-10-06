import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import PostGameEditor from './PostGameEditor.svelte';

it('shows both explicit sources and missing Riot ID feedback without disabling manual statistics', async () => {
	render(PostGameEditor, {
		revision: 0,
		entries: [{ id: 'a', name: 'Alpha' }],
		scoreboard: [{ entryId: 'a', playerId: 'a1', slot: 1, agentId: null }],
		players: [{ id: 'a1', displayName: 'Alpha 1' }],
		agents: [],
		provenance: {
			importSource: null,
			externalMatchId: null,
			importedAt: null,
			lastManualEditAt: null,
			manuallyChangedPlayerIds: []
		},
		resultType: null,
		postGame: {
			gameId: 'game',
			anchors: [],
			availability: {
				henrikdev: { available: true, message: null },
				spectra: { available: true, message: null }
			},
			groupCode: ''
		}
	});
	await expect
		.element(page.getByRole('heading', { name: 'HenrikDev · Recommended' }))
		.toBeVisible();
	await expect.element(page.getByRole('heading', { name: 'ValoSpectra' })).toBeVisible();
	await expect
		.element(page.getByText('Save a Riot ID for a lineup player to fetch recent matches.'))
		.toBeVisible();
	await expect.element(page.getByRole('button', { name: 'Fetch Recent Matches' })).toBeDisabled();
	await expect.element(page.getByRole('textbox', { name: 'Alpha 1 Kills' })).toBeEnabled();
});
