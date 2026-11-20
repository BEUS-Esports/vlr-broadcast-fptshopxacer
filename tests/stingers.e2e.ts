import { expect, type Page } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { test } from './fixtures';
import { save } from './management-helpers';

const webm = () => readFile('src/lib/broadcast/fixtures/stinger.webm');

test.beforeEach(async () => {
	// Stingers are not part of the shared broadcast reset; deleting rows also clears the active one.
	const db = createClient({ url: process.env.DATABASE_URL! });
	try {
		await db.execute('DELETE FROM stingers');
	} finally {
		db.close();
	}
});

async function upload(page: Page, name: string, file: { name: string; buffer: Buffer }) {
	const form = page.getByRole('form', { name: 'Upload stinger', exact: true });
	await form.getByLabel('Name', { exact: true }).fill(name);
	await form.locator('input[name="file"]').setInputFiles({ ...file, mimeType: 'video/webm' });
	return form;
}

async function activate(page: Page, name: string) {
	await page.goto('/admin/stingers');
	const form = await upload(page, name, { name: 'stinger.webm', buffer: await webm() });
	await form.getByRole('button', { name: 'Upload', exact: true }).click();
	await expect(page.getByRole('form', { name: `Stinger ${name}`, exact: true })).toBeVisible();
	const active = page.getByRole('form', { name: 'Active stinger', exact: true });
	const saved = page.waitForResponse((response) => response.request().method() === 'POST');
	await active.getByRole('radio', { name, exact: true }).check();
	expect((await (await saved).json()).type).toBe('success');
}

async function submit(page: Page, form: ReturnType<Page['getByRole']>, button: string) {
	const response = page.waitForResponse((response) => response.request().method() === 'POST');
	await form.getByRole('button', { name: button, exact: true }).click();
	expect((await (await response).json()).type).toBe('success');
}

test('uploads a WebM with its duration pre-filled and saves a cut point', async ({ page }) => {
	await page.goto('/admin/stingers');
	const form = await upload(page, 'Main', { name: 'stinger.webm', buffer: await webm() });
	const duration = form.getByLabel('Duration (ms)', { exact: true });
	await expect(duration).toHaveValue(/^(9\d\d|10\d\d)$/);
	await form.getByRole('button', { name: 'Upload', exact: true }).click();

	const row = page.getByRole('form', { name: 'Stinger Main', exact: true });
	await expect(row).toBeVisible();
	await expect(row.getByLabel('Duration (ms)', { exact: true })).toHaveValue(/^(9\d\d|10\d\d)$/);
	await row.getByLabel('Cut point (ms)', { exact: true }).fill('500');
	await submit(page, row, 'Save');

	await page.reload();
	await expect(row.getByLabel('Cut point (ms)', { exact: true })).toHaveValue('500');
});

test('activates a stinger and clears it with None', async ({ page }) => {
	await page.goto('/admin/stingers');
	const form = await upload(page, 'Main', { name: 'stinger.webm', buffer: await webm() });
	await form.getByRole('button', { name: 'Upload', exact: true }).click();
	await expect(page.getByRole('form', { name: 'Stinger Main', exact: true })).toBeVisible();

	const active = page.getByRole('form', { name: 'Active stinger', exact: true });
	await expect(active.getByRole('radio', { name: 'None' })).toBeChecked();
	const activated = page.waitForResponse((response) => response.request().method() === 'POST');
	await active.getByRole('radio', { name: 'Main' }).check();
	expect((await (await activated).json()).type).toBe('success');
	await page.reload();
	await expect(active.getByRole('radio', { name: 'Main' })).toBeChecked();

	const cleared = page.waitForResponse((response) => response.request().method() === 'POST');
	await active.getByRole('radio', { name: 'None' }).check();
	expect((await (await cleared).json()).type).toBe('success');
	await page.reload();
	await expect(active.getByRole('radio', { name: 'None' })).toBeChecked();
	await expect(active.getByRole('radio', { name: 'Main' })).not.toBeChecked();
});

test('the composite page shows the active stinger and drops it for None', async ({
	page,
	browser
}) => {
	const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	try {
		await page.goto('/admin/stingers');
		const form = await upload(page, 'Main', { name: 'stinger.webm', buffer: await webm() });
		await form.getByRole('button', { name: 'Upload', exact: true }).click();
		const active = page.getByRole('form', { name: 'Active stinger', exact: true });
		await active.getByRole('radio', { name: 'Main' }).check();
		await output.goto('/gfx/live/composite');
		await expect(output.locator('[data-stinger] video')).toHaveAttribute(
			'src',
			/^\/assets\/.+\.webm$/
		);
		await active.getByRole('radio', { name: 'None' }).check();
		await expect(output.locator('[data-stinger] video')).toHaveCount(0);
	} finally {
		await output.close();
	}
});

test('rejects a file that is not a stinger and adds no row', async ({ page }) => {
	const before = await readdir(process.env.ASSET_DIR!);
	await page.goto('/admin/stingers');
	const form = page.getByRole('form', { name: 'Upload stinger', exact: true });
	await form.getByLabel('Name', { exact: true }).fill('Fake');
	await form.locator('input[name="file"]').setInputFiles({
		name: 'fake.webm',
		mimeType: 'video/webm',
		buffer: Buffer.from('89504e470d0a1a0a0000000000000000', 'hex')
	});
	await form.getByLabel('Duration (ms)', { exact: true }).fill('1000');
	await form.getByLabel('Cut point (ms)', { exact: true }).fill('500');
	await form.getByRole('button', { name: 'Upload', exact: true }).click();

	await expect(page.getByRole('alert')).toContainText('Use a WebM, WebP or AVIF stinger.');
	await expect(page.getByRole('form', { name: /^Stinger / })).toHaveCount(0);
	expect(await readdir(process.env.ASSET_DIR!)).toEqual(before);
});

test('the endpoint rejects bad fields before storing anything', async ({ page }) => {
	const before = await readdir(process.env.ASSET_DIR!);
	const data = await webm();
	const post = (query: string) =>
		page.request.post(`/admin/stingers/upload?${query}`, {
			data,
			headers: { 'content-type': 'application/octet-stream' }
		});

	const late = await post('name=Late&durationMs=1000&cutPointMs=99999');
	expect(late.status()).toBe(400);
	expect((await late.json()).error).toBe('Cut point must be between 0 and the duration.');
	const unnamed = await post('name=&durationMs=1000&cutPointMs=0');
	expect(unnamed.status()).toBe(400);
	const short = await post('name=Short&durationMs=0&cutPointMs=0');
	expect(short.status()).toBe(400);

	await page.goto('/admin/stingers');
	await expect(page.getByRole('form', { name: /^Stinger / })).toHaveCount(0);
	expect(await readdir(process.env.ASSET_DIR!)).toEqual(before);
});

test('deletes a stinger after confirmation', async ({ page }) => {
	await page.goto('/admin/stingers');
	const form = await upload(page, 'Gone', { name: 'stinger.webm', buffer: await webm() });
	await form.getByRole('button', { name: 'Upload', exact: true }).click();
	const row = page.getByRole('form', { name: 'Stinger Gone', exact: true });
	await expect(row).toBeVisible();

	page.once('dialog', (dialog) => dialog.dismiss());
	await row.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(row).toBeVisible();

	page.once('dialog', (dialog) => dialog.accept());
	const removed = page.waitForResponse((response) => response.request().method() === 'POST');
	await row.getByRole('button', { name: 'Delete', exact: true }).click();
	expect((await (await removed).json()).type).toBe('success');
	await expect(row).toHaveCount(0);
});

test('a layer 1 swap on the composite plays the stinger and ends on the new graphic', async ({
	page,
	browser
}) => {
	await activate(page, 'Main');
	await page.goto('/admin/graphics/player-lineup');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(page, 'Take game live');

	const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	try {
		await output.goto('/gfx/live/composite');
		const layer = output.locator('[data-live-layer="1"]');
		// The first snapshot mounts without a stinger, so wait for it before taking anything.
		await expect(layer).not.toHaveAttribute('data-stream-sequence', '0');
		await output.evaluate(() => {
			const win = window as unknown as { stingerPlays: number };
			win.stingerPlays = 0;
			document.addEventListener('playing', () => win.stingerPlays++, true);
		});
		const plays = () =>
			output.evaluate(() => (window as unknown as { stingerPlays: number }).stingerPlays);

		await save(page, 'Take Player Lineup Live');
		await expect(layer.locator('[data-graphic="player-lineup"] > div')).toHaveCount(1);
		await expect.poll(plays).toBe(1);

		await page.goto('/admin/graphics/mvp');
		await save(page, 'Take MVP Live');
		await expect(layer.locator('[data-graphic="mvp"] > div')).toHaveCount(1);
		await expect(layer.locator('[data-graphic="player-lineup"]')).toHaveCount(0);
		await expect.poll(plays).toBe(2);
		await expect(output.locator('[data-stinger]')).toHaveCSS('visibility', 'hidden');
		await save(page, 'Clear composite');
	} finally {
		await output.close();
	}
});
