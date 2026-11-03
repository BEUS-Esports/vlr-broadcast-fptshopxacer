import { expect } from '@playwright/test';
import { test } from './fixtures';
import { save } from './management-helpers';

test('live lineup team choice follows competition identity through swap and game change', async ({
	page,
	browser
}) => {
	await page.goto('/admin/graphics/player-lineup');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(page, 'Take game live');
	await save(page, 'Show Player Lineup');
	const sidebar = page.getByRole('navigation', { name: 'Management' });
	await expect(sidebar.getByLabel('Player Lineup: shown')).toBeVisible();
	const single = page.getByRole('region', { name: 'Preview', exact: true });
	const both = page.getByRole('region', { name: 'Preview Both Lineups', exact: true });
	await expect(single.locator('[data-position][data-entry-id]')).toHaveCount(1);
	await expect(both.locator('[data-position][data-entry-id]')).toHaveCount(2);
	await single.getByLabel('Single lineup preview').selectOption('team-b');
	await expect(single.locator('[data-position][data-entry-id="pg-entry-1"]')).toHaveCount(1);
	await both.getByRole('button', { name: 'Large Preview' }).click();
	const largeBoth = page.getByRole('dialog', { name: 'Large Preview · Both Lineups' });
	await expect(largeBoth.locator('[data-position][data-entry-id]')).toHaveCount(2);
	await largeBoth.getByRole('button', { name: 'Close Preview' }).click();
	const output = await browser.newPage();
	try {
		await output.goto('/gfx/live/player-lineup');
		await expect(output.locator('[data-position][data-entry-id]')).toHaveCount(2);
		let response = page.waitForResponse((result) => result.request().method() === 'POST');
		await page.getByRole('button', { name: 'Team A lineup', exact: true }).click();
		expect((await response).ok()).toBe(true);
		await expect(output.locator('[data-position][data-entry-id]')).toHaveCount(1);
		await expect(output.locator('[data-position="left"][data-entry-id="pg-entry-0"]')).toHaveCount(
			1
		);
		await save(page, 'Swap Left/Right');
		await expect(output.locator('[data-position="right"][data-entry-id="pg-entry-0"]')).toHaveCount(
			1
		);
		response = page.waitForResponse((result) => result.request().method() === 'POST');
		await page.getByRole('button', { name: 'Team B lineup', exact: true }).click();
		expect((await response).ok()).toBe(true);
		await expect(output.locator('[data-position="left"][data-entry-id="pg-entry-1"]')).toHaveCount(
			1
		);
		await save(page, 'Hide Player Lineup');
		await expect(sidebar.getByLabel('Player Lineup: hidden')).toBeVisible();
		await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-spectra');
		await save(page, 'Take game live');
		await expect(page.getByRole('button', { name: 'Both lineups', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	} finally {
		await output.close();
	}
});

test('stats and MVP fields are independent and shown stats keep their captured fields', async ({
	page,
	browser
}) => {
	await page.goto('/admin/graphics/player-stats');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(page, 'Take game live');
	await page.getByLabel('Stats player').selectOption('pg-0');
	for (const label of [
		'Deaths',
		'Assists',
		'Performance Score',
		'Trades',
		'First Bloods',
		'Plants',
		'Defuses'
	])
		await page.getByRole('checkbox', { name: new RegExp(`^${label} ·`) }).uncheck();
	await save(page, 'Save Player Stats controls');
	await save(page, 'Show Player Stats');
	const output = await browser.newPage();
	try {
		await output.goto('/gfx/live/player-stats');
		await expect(output.locator('[data-field]')).toHaveCount(1);
		await expect(output.locator('[data-field="kills"]')).toHaveCount(1);
		await page.getByRole('checkbox', { name: /^Deaths ·/ }).check();
		await save(page, 'Save Player Stats controls');
		await expect(output.locator('[data-field]')).toHaveCount(1);
		await save(page, 'Hide Player Stats');
		await save(page, 'Show Player Stats');
		await expect(output.locator('[data-field]')).toHaveCount(2);
		await save(page, 'Hide Player Stats');
		await page.goto('/admin/graphics/mvp');
		await expect(page.getByRole('checkbox', { name: /^Deaths ·/ })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: /^Defuses ·/ })).toBeChecked();
		await page.getByRole('checkbox', { name: /^Defuses ·/ }).uncheck();
		await save(page, 'Save MVP controls');
		await page.goto('/admin/graphics/player-stats');
		await expect(page.getByRole('checkbox', { name: /^Deaths ·/ })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: /^Defuses ·/ })).not.toBeChecked();
	} finally {
		await output.close();
	}
});
