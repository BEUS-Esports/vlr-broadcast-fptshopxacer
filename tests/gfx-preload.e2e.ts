import { expect, type Page } from '@playwright/test';
import { createClient } from '@libsql/client';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from './fixtures';
import { save } from './management-helpers';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
	'base64'
);
const newAsset = () => `/assets/${randomUUID()}.png`;
const put = (path: string) => writeFile(join(process.env.ASSET_DIR!, path.split('/').pop()!), png);

async function selectGame(page: Page) {
	await page.goto('/admin/graphics/player-lineup');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(page, 'Take game live');
}

test('hidden output prepares saved images before first Show and preserves held Program artwork', async ({
	page,
	browser
}) => {
	test.setTimeout(90000);
	const first = newAsset();
	const latest = newAsset();
	await put(first);
	await put(latest);
	const db = createClient({ url: process.env.DATABASE_URL! });
	const output = await browser.newPage();
	try {
		await db.execute({
			sql: "UPDATE players SET portrait_path = ? WHERE id = 'pg-0'",
			args: [first]
		});
		await db.execute({
			sql: "UPDATE players SET portrait_path = ? WHERE id = 'pg-1'",
			args: [latest]
		});
		await selectGame(page);
		const prepared = output.waitForResponse(
			(response) => response.url().endsWith(first) && response.ok()
		);
		await output.goto('/gfx/live/player-lineup');
		await prepared;
		await expect(output.locator('[data-graphic] > div')).toHaveCount(0);
		// Wait for Image.decode(), then ask Show to publish the saved capture.
		await output.waitForFunction(
			(path) => performance.getEntriesByName(location.origin + path).length > 0,
			first
		);
		await save(page, 'Show Player Lineup');
		const image = output.locator(`img[src="${first}"]`);
		await expect(image).toBeVisible();
		await expect
			.poll(() =>
				image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)
			)
			.toBe(true);
		const transfers = await output.evaluate(
			(path) =>
				performance
					.getEntriesByName(location.origin + path)
					.map((entry) => (entry as PerformanceResourceTiming).transferSize),
			first
		);
		expect(transfers[0]).toBeGreaterThan(0);
		expect(transfers.slice(1).every((size) => size === 0)).toBe(true);
		const slot = page.getByRole('combobox', { name: 'Alpha slot 1', exact: true });
		await page.getByRole('combobox', { name: 'Alpha slot 2', exact: true }).selectOption('');
		await slot.selectOption('pg-1');
		await save(page, 'Save lineup');
		const preview = page.getByRole('region', { name: 'Preview', exact: true });
		await expect(preview.locator(`img[src="${latest}"]`)).toHaveCount(1);
		await expect(output.locator(`img[src="${first}"]`)).toHaveCount(1);
		await output.reload();
		await expect(output.locator(`img[src="${first}"]`)).toHaveCount(1);
	} finally {
		await output.close();
		db.close();
	}
});

test('transient images recover without reload and permanent images exhaust their retries', async ({
	page,
	browser
}) => {
	test.setTimeout(90000);
	const transient = newAsset();
	const permanent = newAsset();
	const db = createClient({ url: process.env.DATABASE_URL! });
	const output = await browser.newPage();
	const requests: string[] = [];
	output.on('request', (request) => {
		if ([transient, permanent].some((path) => request.url().endsWith(path)))
			requests.push(new URL(request.url()).pathname);
	});
	try {
		await db.execute({
			sql: "UPDATE players SET portrait_path = ? WHERE id = 'pg-0'",
			args: [transient]
		});
		await db.execute({
			sql: "UPDATE players SET portrait_path = ? WHERE id = 'pg-2'",
			args: [permanent]
		});
		await selectGame(page);
		await output.clock.install();
		await output.goto('/gfx/live/player-lineup');
		await expect.poll(() => requests.filter((url) => url === transient).length).toBe(1);
		await save(page, 'Show Player Lineup');
		await expect(
			output.getByRole('img', { name: 'Player 0: image unavailable', exact: true })
		).toBeVisible();
		await put(transient);
		await output.clock.runFor(1000);
		const recovered = output.locator(`img[src="${transient}"]`);
		await expect(recovered).toBeVisible();
		await expect
			.poll(() =>
				recovered.evaluate(
					(element: HTMLImageElement) => element.complete && element.naturalWidth > 0
				)
			)
			.toBe(true);
		// Each failed load must settle before its next retry delay starts.
		for (const delay of [5000, 15000]) {
			const before = requests.filter((url) => url === permanent).length;
			await output.clock.runFor(delay);
			await expect
				.poll(() => requests.filter((url) => url === permanent).length)
				.toBeGreaterThan(before);
			await expect(
				output.getByRole('img', { name: 'Player 2: image unavailable', exact: true })
			).toBeVisible();
		}
		const exhausted = requests.filter((url) => url === permanent).length;
		await output.clock.runFor(60000);
		expect(requests.filter((url) => url === permanent)).toHaveLength(exhausted);
	} finally {
		await output.close();
		db.close();
	}
});
