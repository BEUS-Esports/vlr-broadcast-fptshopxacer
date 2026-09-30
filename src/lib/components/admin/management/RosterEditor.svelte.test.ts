import { expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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
	const search = page.getByRole('combobox', { name: 'Search players', exact: true });
	await search.fill('Same');
	await expect
		.element(page.getByRole('option', { name: /Taken#123/ }))
		.toHaveAttribute('data-disabled');
	await expect.element(page.getByRole('option', { name: /Free#123/ })).toBeVisible();
	await search.fill('Available Player');
	await expect.element(page.getByRole('option', { name: /Taken#123/ })).not.toBeInTheDocument();
	await userEvent.keyboard('{ArrowDown}{Enter}');
	await expect
		.element(page.getByRole('button', { name: 'Remove Same (free)', exact: true }))
		.toBeVisible();
	await userEvent.keyboard('{Escape}');
	await expect.element(search).toHaveAttribute('aria-expanded', 'false');
	await page.getByRole('button', { name: 'Remove Veteran (old)', exact: true }).click();
	await view.rerender({ ...props, revision: 2, playerIds: [] });
	const payload = JSON.parse(
		view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value
	);
	expect(payload).toEqual({ entryId: 'a', expectedTournamentRevision: 1, playerIds: ['free'] });
	await search.fill('Hidden');
	await expect.element(page.getByText('No matching players.', { exact: true })).toBeVisible();
});
