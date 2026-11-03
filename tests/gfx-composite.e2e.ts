import { expect } from '@playwright/test';
import { test } from './fixtures';
import { save } from './management-helpers';

test('the composite output follows individual Show and Hide controls', async ({
	page,
	browser
}) => {
	await page.goto('/admin/graphics/player-lineup');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(page, 'Take game live');

	const link = page.getByRole('link', { name: 'Open composite output' });
	await expect(link).toHaveAttribute('href', '/gfx/live/composite');
	const composite = await browser.newPage();
	const individual = await browser.newPage();
	try {
		const requests: string[] = [];
		composite.on('request', (request) => requests.push(new URL(request.url()).pathname));
		await composite.goto((await link.getAttribute('href')) as string);
		await individual.goto('/gfx/live/player-lineup');
		const lineup = composite.locator('[data-graphic="player-lineup"]');
		const veto = composite.locator('[data-graphic="map-veto"]');
		await expect(composite.locator('[data-live-graphic]')).toHaveCount(7);
		await expect(lineup.locator(':scope > div')).toHaveCount(0);
		await save(page, 'Show Player Lineup');
		await expect(lineup.locator(':scope > div')).toHaveCount(1);
		await expect(individual.locator('[data-graphic="player-lineup"] > div')).toHaveCount(1);
		await page.goto('/admin/graphics/map-veto');
		await save(page, 'Show Map Veto');
		await expect(veto.locator(':scope > div')).toHaveCount(1);
		await expect(lineup.locator(':scope > div')).toHaveCount(1);
		await save(page, 'Hide Map Veto');
		await expect(veto.locator(':scope > div')).toHaveCount(0);
		await expect(lineup.locator(':scope > div')).toHaveCount(1);
		expect(requests.filter((path) => path === '/api/broadcast/events')).toHaveLength(1);
		expect(requests.filter((path) => path === '/api/live-game/events')).toHaveLength(1);
		expect(requests.filter((path) => path === '/api/live-game/resources')).toHaveLength(1);
	} finally {
		await composite.close();
		await individual.close();
	}
});

test('all individual outputs match the composite and survive a document reload', async ({
	page,
	browser
}) => {
	test.setTimeout(90_000);
	await page.goto('/admin/graphics/player-lineup');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(page, 'Take game live');
	const output = await browser.newPage();
	const individual = await browser.newPage();
	const graphics = [
		['player-lineup', 'Player Lineup'],
		['player-stats', 'Player Stats'],
		['map-veto', 'Map Veto'],
		['agent-select', 'Agent Select'],
		['in-game', 'In-Game'],
		['post-game', 'Post-Game'],
		['mvp', 'MVP']
	] as const;
	try {
		await output.goto('/gfx/live/composite');
		for (const [id, label] of graphics) {
			await page.goto(`/admin/graphics/${id}`);
			await individual.goto(`/gfx/live/${id}`);
			const combinedGraphic = output.locator(`[data-graphic="${id}"] > div`);
			const individualGraphic = individual.locator(`[data-graphic="${id}"] > div`);
			await expect(combinedGraphic).toHaveCount(0);
			await save(page, `Show ${label}`);
			await expect(combinedGraphic).toHaveCount(1);
			await expect(individualGraphic).toHaveCount(1);
			await output.reload();
			await expect(combinedGraphic).toHaveCount(1);
			await save(page, `Hide ${label}`);
			await expect(combinedGraphic).toHaveCount(0);
			await expect(individualGraphic).toHaveCount(0);
		}
	} finally {
		await output.close();
		await individual.close();
	}
});
