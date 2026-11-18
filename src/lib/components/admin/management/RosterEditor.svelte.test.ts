import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import RosterEditor from './RosterEditor.svelte';

it('searches players, disables other teams, previews selections and preserves a dirty draft on refresh', async () => {
	const props = {
		entryId: 'a',
		revision: 1,
		playerIds: ['old'],
		assignments: [{ playerId: 'taken', teamName: 'Beta' }],
		players: [
			{ id: 'old', displayName: 'Veteran', archivedAt: new Date() },
			{
				id: 'free',
				displayName: 'Same',
				riotId: 'Free#123',
				fullName: 'Available Player',
				archivedAt: null
			},
			{ id: 'taken', displayName: 'Same', riotId: 'Taken#123', archivedAt: null },
			{ id: 'archived', displayName: 'Hidden', archivedAt: new Date() }
		]
	};
	const view = render(RosterEditor, props);
	const search = page.getByRole('searchbox', { name: 'Search players', exact: true });
	await search.fill('Same');
	await expect.element(page.getByRole('checkbox', { name: /Taken#123/ })).toBeDisabled();
	await expect.element(page.getByRole('checkbox', { name: /Free#123/ })).toBeVisible();
	await search.fill('Available Player');
	await expect.element(page.getByRole('checkbox', { name: /Taken#123/ })).not.toBeInTheDocument();
	await page.getByRole('checkbox', { name: /Free#123/ }).click();
	await expect
		.element(page.getByRole('button', { name: 'Remove Same (free)', exact: true }))
		.toBeVisible();
	await page.getByRole('button', { name: 'Remove Veteran (old)', exact: true }).click();
	await view.rerender({ ...props, revision: 2, playerIds: [] });
	const payload = JSON.parse(
		view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value
	);
	expect(payload).toEqual({ entryId: 'a', expectedTournamentRevision: 1, playerIds: ['free'] });
	await search.fill('Hidden');
	await expect.element(page.getByText('No matching players.', { exact: true })).toBeVisible();
});

it('keeps earlier picks and the search text while ticking players across searches', async () => {
	render(RosterEditor, {
		entryId: 'a',
		revision: 1,
		playerIds: [],
		assignments: [],
		players: [
			{ id: 'a1', displayName: 'Alpha 1', archivedAt: null },
			{ id: 'a2', displayName: 'Alpha 2', archivedAt: null },
			{ id: 'b1', displayName: 'Bravo 1', archivedAt: null }
		]
	});
	const search = page.getByRole('searchbox', { name: 'Search players', exact: true });
	const selected = page.getByRole('list', { name: 'Selected players' });
	await search.fill('Alpha');
	await page.getByRole('checkbox', { name: /Alpha 1/ }).click();
	await page.getByRole('checkbox', { name: /Alpha 2/ }).click();
	await expect.element(search).toHaveValue('Alpha');
	await search.fill('Bravo');
	await page.getByRole('checkbox', { name: /Bravo 1/ }).click();
	await expect.element(selected).toHaveTextContent(/Alpha 1.*Alpha 2.*Bravo 1/);
	await page.getByRole('checkbox', { name: /Bravo 1/ }).click();
	await expect.element(selected).not.toHaveTextContent(/Bravo 1/);
});
