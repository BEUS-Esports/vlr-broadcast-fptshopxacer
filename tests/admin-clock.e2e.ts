import { expect } from '@playwright/test';
import { test } from './fixtures';

test('admin server clock survives navigation with one shared broadcast connection', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let streams = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/broadcast/events') streams++;
	});
	await page.clock.setFixedTime(new Date(Date.now() + 7000));
	await page.goto('/admin');
	const clock = page.locator('time[aria-label="Server Time"]');
	await expect(clock).toBeVisible();
	const first = Date.parse((await clock.getAttribute('datetime'))!);
	expect(Math.abs(first - Date.now())).toBeLessThan(2000);
	await expect
		.poll(async () => Date.parse((await clock.getAttribute('datetime'))!))
		.toBeGreaterThan(first);
	await page.getByRole('link', { name: 'In-Game', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/graphics\/in-game$/);
	await expect(clock).toBeVisible();
	await page.getByRole('link', { name: 'Teams', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/teams$/);
	const afterNavigation = Date.parse((await clock.getAttribute('datetime'))!);
	await expect
		.poll(async () => Date.parse((await clock.getAttribute('datetime'))!))
		.toBeGreaterThan(afterNavigation);
	await page.getByRole('link', { name: 'In-Game', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Preview', exact: true })).toContainText(
		'Latest saved data · connected.'
	);
	expect(streams).toBe(1);
	expect(errors).toEqual([]);
});
