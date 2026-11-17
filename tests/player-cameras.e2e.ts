import { expect } from '@playwright/test';
import { test } from './fixtures';
import { save } from './management-helpers';

test('hands out seat links and swaps booths without touching Team A/B', async ({
	page,
	context
}) => {
	await page.route('https://vdo.ninja/**', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
	);
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	// Fresh install: labels exist, but no room means no links and no previews.
	await page.goto('/admin/player-cameras');
	const tiles = page.locator('[data-seat]');
	await expect(tiles).toHaveCount(10);
	await expect(tiles.first()).toContainText('BOOTH1_S1');
	await expect(tiles.first()).toContainText('Empty seat');
	await expect(tiles.last()).toContainText('BOOTH2_S5');
	await expect(page.getByText('Set a room name to enable links')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Copy link' }).first()).toBeDisabled();
	await expect(page.locator('iframe')).toHaveCount(0);

	await page.getByLabel('Room name').fill('e2e_room');
	const password = await page.getByLabel('Password').inputValue();
	expect(password).toMatch(/^[0-9a-f]{24}$/);
	await save(page, 'Save room');
	await expect(page.locator('iframe')).toHaveCount(10);
	await expect(page.locator('iframe').first()).toHaveAttribute(
		'src',
		/^https:\/\/vdo\.ninja\/\?view=BOOTH1_S1&/
	);

	// Links stay reachable as text where the Clipboard API is unavailable (plain-HTTP LAN).
	await page.getByText('Show all player links').click();
	await expect(page.getByLabel('All player links')).toHaveValue(
		/BOOTH1_S1 {2}https:\/\/vdo\.ninja\/\?push=BOOTH1_S1&/
	);

	await tiles.first().getByRole('button', { name: 'Copy link' }).click();
	const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
	expect(copied.searchParams.get('push')).toBe('BOOTH1_S1');
	expect(copied.searchParams.get('room')).toBe('e2e_room');
	expect(copied.searchParams.get('password')).toBe(password);

	// Seating follows the live game's lineup, even when another operator takes it live.
	const graphics = await context.newPage();
	await graphics.goto('/admin/graphics/player-lineup');
	await graphics
		.getByRole('combobox', { name: 'Tournament', exact: true })
		.selectOption('pg-event');
	await graphics.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await graphics.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(graphics, 'Take game live');
	await graphics.close();
	const booth1 = page.getByRole('region', { name: 'Booth 1' });
	const booth2 = page.getByRole('region', { name: 'Booth 2' });
	await expect(booth1.getByRole('heading', { level: 2 })).toContainText('Team A · Alpha');
	await expect(tiles.first()).toContainText('Alp · Player 0');

	await save(page, 'Swap booths');
	await expect(booth1.getByRole('heading', { level: 2 })).toContainText('Team B · Bravo');
	await expect(booth2.getByRole('heading', { level: 2 })).toContainText('Team A · Alpha');
	await expect(tiles.first()).toContainText('Bra · Player 5');
	await page.reload();
	await expect(booth1.getByRole('heading', { level: 2 })).toContainText('Team B · Bravo');

	// Re-keying the room invalidates handed-out links, so it asks first.
	let dialog = '';
	page.once('dialog', (event) => {
		dialog = event.message();
		void event.accept();
	});
	await page.getByLabel('Room name').fill('e2e_room_2');
	await save(page, 'Save room');
	expect(dialog).toContain('Every handed-out player link stops working');
});
