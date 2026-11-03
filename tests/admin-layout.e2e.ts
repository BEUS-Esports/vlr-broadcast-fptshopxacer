import { expect } from '@playwright/test';
import { test } from './fixtures';

test('admin content scrolls inside the main area and large previews center on screen', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto('/admin/graphics/player-lineup');
	const main = page.locator('main');
	await main.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	expect(
		await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
	).toBeLessThanOrEqual(1);
	const preview = page.getByRole('region', { name: 'Preview', exact: true });
	await preview.getByRole('button', { name: 'Large Preview' }).click();
	const box = await page.getByRole('dialog').boundingBox();
	expect(box).not.toBeNull();
	expect(Math.abs(box!.x + box!.width / 2 - 640)).toBeLessThan(2);
	expect(Math.abs(box!.y + box!.height / 2 - 360)).toBeLessThan(2);
});
