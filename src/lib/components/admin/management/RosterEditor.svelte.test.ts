import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import RosterEditor from './RosterEditor.svelte';

it('keeps an edited collection and its revision when other sections refresh', async () => {
	const props = {
		entryId: 'a',
		revision: 1,
		playerIds: ['p1'],
		players: [
			{ id: 'p1', displayName: 'First', archivedAt: null },
			{ id: 'p2', displayName: 'Second', archivedAt: null }
		]
	};
	const view = render(RosterEditor, props);
	await page.getByRole('checkbox', { name: /Second/ }).click();
	await view.rerender({ ...props, revision: 2, playerIds: [] });
	await expect.element(page.getByRole('checkbox', { name: /First/ })).toBeChecked();
	await expect.element(page.getByRole('checkbox', { name: /Second/ })).toBeChecked();
	const payload = view.container.querySelector<HTMLInputElement>('input[name="payload"]')!;
	expect(JSON.parse(payload.value)).toMatchObject({
		expectedTournamentRevision: 1,
		playerIds: ['p1', 'p2']
	});
});
