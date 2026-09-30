import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import LineupEditor from './LineupEditor.svelte';

it('offers five slots per team, distinct names and historical players, and retains reordered drafts on refresh', async () => {
	const props = {
		revision: 1,
		entries: [
			{ id: 'a', name: 'Alpha' },
			{ id: 'b', name: 'Beta' }
		],
		lineup: [{ entryId: 'a', slot: 1, playerId: 'p1' }],
		roster: [{ entryId: 'a', playerId: 'p2' }],
		players: [
			{ id: 'p1', displayName: 'Same' },
			{ id: 'p2', displayName: 'Same' }
		]
	};
	const view = render(LineupEditor, props);
	expect(view.container.querySelectorAll('select')).toHaveLength(10);
	await expect
		.element(page.getByText('No longer on current roster', { exact: true }))
		.toBeVisible();
	await page.getByRole('combobox', { name: 'Alpha slot 2', exact: true }).selectOptions('p2');
	await page.getByRole('button', { name: 'Alpha slot 2 Move Up', exact: true }).click();
	await view.rerender({ ...props, revision: 2, lineup: [] });
	const payload = JSON.parse(
		view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value
	);
	expect(payload.expectedGameRevision).toBe(1);
	expect(payload.teams[0].slots.slice(0, 2)).toEqual([
		{ slot: 1, playerId: 'p2' },
		{ slot: 2, playerId: 'p1' }
	]);
	await expect
		.element(page.getByText('2/5 selected · Incomplete draft', { exact: true }))
		.toBeVisible();
});
