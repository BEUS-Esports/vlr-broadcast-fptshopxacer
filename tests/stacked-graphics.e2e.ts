import { expect } from '@playwright/test';
import { test } from './fixtures';
import { save } from './management-helpers';

test('showing over another standalone graphic never asks, and Hide all clears standalone only', async ({
	page
}) => {
	const dialogs: string[] = [];
	page.on('dialog', (dialog) => {
		dialogs.push(dialog.message());
		void dialog.dismiss();
	});
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
	await save(page, 'Show MVP');
	await expect(dot('MVP')).toHaveAccessibleName('MVP: shown');
	await page.getByRole('link', { name: 'In-Game', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/graphics\/in-game$/);
	await save(page, 'Show In-Game');
	await expect(page.getByText('Shown: In-Game, Post-Game, MVP', { exact: true })).toBeVisible();

	// The composite is separate state: Hide all must leave its occupant alone.
	await page.getByRole('link', { name: 'Post-Game', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/graphics\/post-game$/);
	await save(page, 'Take Post-Game Live');
	const liveNow = page.getByRole('region', { name: 'Live now', exact: true });
	await expect(liveNow.getByText('Layer 1: Post-Game', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Hide all graphics', exact: true }).click();
	for (const label of ['Post-Game', 'MVP', 'In-Game'])
		await expect(dot(label)).toHaveAccessibleName(`${label}: hidden`);
	await expect(page.getByRole('button', { name: 'Hide all graphics', exact: true })).toHaveCount(0);
	await expect(liveNow.getByText('Layer 1: Post-Game', { exact: true })).toBeVisible();

	// A composite occupant still locks the live selection; clearing it releases the lock.
	await expect(
		page.getByRole('button', { name: 'Clear live selection', exact: true })
	).toBeDisabled();
	await save(page, 'Clear composite');
	await expect(liveNow.getByText('Layer 1: —', { exact: true })).toBeVisible();
	await save(page, 'Clear live selection');
	expect(dialogs).toEqual([]);
});
