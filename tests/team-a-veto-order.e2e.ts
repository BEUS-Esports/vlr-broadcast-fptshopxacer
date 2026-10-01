import { expect, test } from '@playwright/test';
import { createMatch, prepareTournament, save } from './management-helpers';

test('match setup explains veto order and swaps Team A before the first veto', async ({ page }) => {
	const tournament = await prepareTournament(page, 'Veto order', [1, 2, 3, 4, 5, 6, 7]);
	await page.goto(`${tournament}?tab=matches`);
	await expect(page.getByText('Team A starts standard vetoes', { exact: false })).toBeVisible();
	await createMatch(page, tournament, 'Veto order match', 3);
	await expect(
		page
			.getByRole('region', { name: 'Match participants' })
			.getByText('Team A starts standard vetoes', { exact: false })
	).toBeVisible();
	await page.getByRole('button', { name: 'Swap Team A / Team B' }).click();
	await expect(
		page.getByRole('combobox', { name: 'Team A', exact: true }).locator('option:checked')
	).toHaveText('Bravo');
	page.once('dialog', (dialog) => dialog.accept());
	await save(page, 'Save participants');
	await page.reload();
	await expect(
		page.getByRole('combobox', { name: 'Team A', exact: true }).locator('option:checked')
	).toHaveText('Bravo');
	await page.getByRole('tab', { name: 'Map Veto', exact: true }).click();
	await page.getByRole('button', { name: 'Add veto action' }).click();
	await expect(
		page.getByRole('combobox', { name: 'Action 1 acting team' }).locator('option:checked')
	).toHaveText('Bravo');
	await page.getByRole('button', { name: 'Remove action 1' }).click();
	await page.getByRole('button', { name: 'Fill Map Veto' }).click();
	await page
		.getByRole('combobox', { name: 'Action 1 acting team' })
		.selectOption({ label: 'Alpha' });
	for (let number = 1; number <= 7; number++)
		await page
			.getByRole('combobox', { name: `Action ${number} map` })
			.selectOption(`map-${number}`);
	await save(page, 'Save match veto');
	await page.reload();
	await page.getByRole('tab', { name: 'Map Veto', exact: true }).click();
	await expect(
		page.getByRole('combobox', { name: 'Action 1 acting team' }).locator('option:checked')
	).toHaveText('Alpha');
});
