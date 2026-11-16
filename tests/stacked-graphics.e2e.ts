import { expect } from '@playwright/test';
import { test } from './fixtures';
import { save } from './management-helpers';

test('showing a full-screen graphic over another asks first, and Hide all clears program', async ({
	page
}) => {
	await page.goto('/admin/graphics/post-game');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(page, 'Take game live');
	await expect(page.getByRole('button', { name: 'Hide all graphics', exact: true })).toHaveCount(0);
	await save(page, 'Show Post-Game');
	const dot = (label: string) => page.getByRole('img', { name: new RegExp(`^${label}: `) });
	await expect(dot('Post-Game')).toHaveAccessibleName('Post-Game: shown');

	await page.getByRole('link', { name: 'MVP', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/graphics\/mvp$/);
	const dialogs: string[] = [];
	page.once('dialog', (dialog) => {
		dialogs.push(dialog.message());
		void dialog.dismiss();
	});
	await page.getByRole('button', { name: 'Show MVP', exact: true }).click();
	await expect.poll(() => dialogs).toEqual(['Post-Game is already on air. Show MVP on top?']);
	await expect(dot('MVP')).toHaveAccessibleName('MVP: hidden');
	page.once('dialog', (dialog) => void dialog.accept());
	await save(page, 'Show MVP');
	await expect(dot('MVP')).toHaveAccessibleName('MVP: shown');

	// In-Game is the HUD layer under everything else, so it never asks.
	await page.getByRole('link', { name: 'In-Game', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/graphics\/in-game$/);
	page.once('dialog', (dialog) => {
		dialogs.push(dialog.message());
		void dialog.dismiss();
	});
	await save(page, 'Show In-Game');
	expect(dialogs).toHaveLength(1);

	await expect(page.getByText('Shown: In-Game, Post-Game, MVP', { exact: true })).toBeVisible();
	// The control disappears once nothing is shown, so check the outcome rather than "Saved.".
	await page.getByRole('button', { name: 'Hide all graphics', exact: true }).click();
	for (const label of ['Post-Game', 'MVP', 'In-Game'])
		await expect(dot(label)).toHaveAccessibleName(`${label}: hidden`);
	await expect(page.getByRole('button', { name: 'Hide all graphics', exact: true })).toHaveCount(0);
	await save(page, 'Clear live selection');
});
