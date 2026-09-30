import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import MapPoolEditor from './MapPoolEditor.svelte';

it('offers retained inactive maps and excludes new inactive choices', async () => {
	render(MapPoolEditor, {
		revision: 1,
		mapIds: ['old'],
		maps: [
			{ id: 'old', displayName: 'Old map', isActive: false },
			{ id: 'new', displayName: 'Hidden map', isActive: false },
			{ id: 'active', displayName: 'Available map', isActive: true }
		]
	});
	await expect.element(page.getByRole('checkbox', { name: /Old map/ })).toBeChecked();
	await expect.element(page.getByRole('checkbox', { name: /Hidden map/ })).not.toBeInTheDocument();
	await page.getByRole('checkbox', { name: /Available map/ }).click();
	await expect.element(page.getByRole('checkbox', { name: /Available map/ })).toBeChecked();
});
