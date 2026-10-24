import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { save } from './management-helpers';

async function scenario(name: string) {
	const response = await fetch(`${process.env.VLR_E2E_PROVIDER_URL}/scenario?name=${name}`);
	expect(response.ok).toBe(true);
}
async function chooseHenrik(page: Page) {
	await page.getByLabel('Anchor player', { exact: true }).selectOption('pg-0');
	await page.getByRole('button', { name: 'Fetch Recent Matches', exact: true }).click();
	await expect(page.getByRole('article', { name: 'Candidate older-match' })).toBeVisible();
	await page.getByRole('button', { name: 'Select Match event-match', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Post-game import review' })).toBeVisible();
}
async function confirm(page: Page) {
	await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Post-game import review' })).toHaveCount(0);
	await expect(page.getByText(/Imported from/)).toBeVisible();
}

test('Henrik choice, mapping/diff, import, manual conflict and persistent scoped resolution', async ({
	page
}) => {
	test.setTimeout(90_000);
	page.on('dialog', (dialog) => dialog.accept());
	await scenario('ready');
	await page.goto('/admin/games/pg-henrik?tab=statistics');
	await chooseHenrik(page);
	const review = page.getByRole('region', { name: 'Post-game import review' });
	await expect(review.getByRole('combobox', { name: /Map provider player/ })).toHaveCount(10);
	await expect(review.getByRole('table')).toHaveCount(10);
	await expect(review.getByText('Performance Score', { exact: true })).toHaveCount(10);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await review
		.getByRole('heading', { name: 'Review HenrikDev · event-match' })
		.scrollIntoViewIfNeeded();
	await page.screenshot({
		path: join(tmpdir(), 'vlr-phase7-import', 'ui-review.png'),
		fullPage: false
	});
	await confirm(page);
	await expect(page.getByRole('textbox', { name: 'Player 0 Kills', exact: true })).toHaveValue('1');
	await expect(
		page.getByRole('textbox', { name: 'Player 0 Performance Score', exact: true })
	).toHaveValue('');
	await page.getByRole('textbox', { name: 'Player 0 Kills', exact: true }).fill('7');
	await save(page, 'Save post-game statistics');
	await chooseHenrik(page);
	await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeDisabled();
	await expect(
		review.getByText('Manual statistics conflict for Player 0. Choose what to keep.', {
			exact: true
		})
	).toBeVisible();
	await page.getByLabel('Player 0 statistics conflict', { exact: true }).selectOption('keep-local');
	await confirm(page);
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Player 0 Kills', exact: true })).toHaveValue('7');
	await chooseHenrik(page);
	await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeDisabled();
	await page
		.getByLabel('Player 0 statistics conflict', { exact: true })
		.selectOption('use-provider');
	await confirm(page);
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Player 0 Kills', exact: true })).toHaveValue('1');
	await scenario('manual-map');
	await chooseHenrik(page);
	await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeDisabled();
	await page.getByLabel('Map provider player 1', { exact: true }).selectOption('pg-0');
	await page.getByRole('button', { name: 'Review updated mappings', exact: true }).click();
	await expect(review.getByText('Renamed#EVENT · manual mapping', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeEnabled();
	// A manual save invalidates confirmation but leaves the prior report visible.
	await page.getByRole('textbox', { name: 'Player 0 Kills', exact: true }).fill('8');
	await save(page, 'Save post-game statistics');
	await expect(
		review.getByText('This review is stale. Fetch and review the report again before confirming.')
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeDisabled();
	await scenario('rate-limit');
	await page.getByRole('button', { name: 'Fetch Recent Matches', exact: true }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Provider rate limit reached.' })
	).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Player 0 Kills', exact: true })).toBeEnabled();
});

test('Spectra bounded pending/cancel and shared import persist without stale late responses', async ({
	page,
	browser
}, testInfo) => {
	test.setTimeout(60_000);
	page.on('dialog', (dialog) => dialog.accept());
	await page.goto('/admin/games/pg-spectra?tab=statistics');
	await scenario('pending');
	await page.getByRole('button', { name: 'Fetch Report', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText(
		'The Spectra report is not ready. Fetch again later.'
	);
	await expect(page.getByRole('textbox', { name: 'Player 0 Kills', exact: true })).toBeEnabled();
	await scenario('delayed');
	await page.getByRole('button', { name: 'Fetch Report', exact: true }).click();
	await page.getByRole('button', { name: 'Stop / Cancel', exact: true }).click();
	await expect(page.getByText('Request stopped. Fetch again when ready.')).toBeVisible();
	await page.waitForTimeout(900);
	await expect(page.getByRole('region', { name: 'Post-game import review' })).toHaveCount(0);
	await scenario('pending-ready');
	await page.getByRole('button', { name: 'Fetch Report', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Review ValoSpectra · spectra-event-match' })
	).toBeVisible();
	await expect(page.getByRole('combobox', { name: /Map provider player/ })).toHaveCount(10);
	await confirm(page);
	await page.reload();
	await expect(page.getByText(/Imported from spectra/)).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Player 0 Kills', exact: true })).toHaveValue('1');
	await page.goto('/admin/graphics');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-spectra');
	await save(page, 'Take game live');
	await page.goto('/admin/graphics/post-game');
	await save(page, 'Show Post-Game');
	const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	try {
		await output.goto('/gfx/live/post-game');
		const badge = output.getByRole('complementary', { name: 'Provider attribution' });
		await expect(badge).toHaveText('Powered by Spectra');
		await expect(badge.getByRole('img', { name: 'ValoSpectra' })).toBeVisible();
		await expect
			.poll(() => badge.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
			.toBeGreaterThan(0);
		expect(await badge.boundingBox()).toEqual({ x: 1672, y: 0, width: 218, height: 27 });
		await output.screenshot({ path: testInfo.outputPath('spectra-post-match-watermark.png') });
	} finally {
		await output.close();
	}
	await scenario('ready');
});
