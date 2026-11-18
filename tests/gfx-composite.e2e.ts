import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { save } from './management-helpers';

async function takeGameLive(page: Page) {
	await page.goto('/admin/graphics/player-lineup');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('pg-event');
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption('pg-match');
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption('pg-henrik');
	await save(page, 'Take game live');
}

test('composite follows Take Live, not standalone Show', async ({ page, browser }) => {
	await takeGameLive(page);
	const link = page.getByRole('link', { name: 'Open composite output' });
	await expect(link).toHaveAttribute('href', '/gfx/live/composite');
	const composite = await browser.newPage();
	const individual = await browser.newPage();
	try {
		const requests: string[] = [];
		composite.on('request', (request) => requests.push(new URL(request.url()).pathname));
		await composite.goto((await link.getAttribute('href')) as string);
		await individual.goto('/gfx/live/player-lineup');
		const lineup = composite.locator('[data-graphic="player-lineup"] > div');
		await expect(composite.locator('[data-live-layer]')).toHaveCount(3);
		await expect(lineup).toHaveCount(0);
		await save(page, 'Show Player Lineup');
		await expect(individual.locator('[data-graphic="player-lineup"] > div')).toHaveCount(1);
		await expect(lineup).toHaveCount(0);
		await save(page, 'Take Player Lineup Live');
		await expect(lineup).toHaveCount(1);
		// Standalone Hide leaves the composite alone.
		await save(page, 'Hide Player Lineup');
		await expect(individual.locator('[data-graphic="player-lineup"] > div')).toHaveCount(0);
		await expect(lineup).toHaveCount(1);
		await save(page, 'Take Player Lineup Off');
		await expect(lineup).toHaveCount(0);
		expect(requests.filter((path) => path === '/api/broadcast/events')).toHaveLength(1);
		expect(requests.filter((path) => path === '/api/live-game/events')).toHaveLength(1);
		expect(requests.filter((path) => path === '/api/live-game/resources')).toHaveLength(1);
	} finally {
		await composite.close();
		await individual.close();
	}
});

test('taking a full-screen graphic replaces the one on its layer', async ({ page, browser }) => {
	await takeGameLive(page);
	const composite = await browser.newPage();
	try {
		await composite.goto('/gfx/live/composite');
		await page.goto('/admin/graphics/post-game');
		await save(page, 'Take Post-Game Live');
		await expect(composite.locator('[data-graphic="post-game"] > div')).toHaveCount(1);
		const liveNow = page.getByRole('region', { name: 'Live now', exact: true });
		await expect(liveNow.getByText('Layer 1: Post-Game', { exact: true })).toBeVisible();
		await page.goto('/admin/graphics/mvp');
		await save(page, 'Take MVP Live');
		await expect(composite.locator('[data-graphic="mvp"] > div')).toHaveCount(1);
		await expect(composite.locator('[data-graphic="post-game"] > div')).toHaveCount(0);
		await expect(liveNow.getByText('Layer 1: MVP', { exact: true })).toBeVisible();
		await expect(composite.locator('[data-live-layer="1"] [data-graphic] > div')).toHaveCount(1);
		await save(page, 'Clear composite');
	} finally {
		await composite.close();
	}
});

test('HUD and Agent Select stack with a full-screen graphic', async ({ page, browser }) => {
	await takeGameLive(page);
	const composite = await browser.newPage();
	try {
		await composite.goto('/gfx/live/composite');
		for (const [id, label] of [
			['in-game', 'In-Game'],
			['player-lineup', 'Player Lineup'],
			['agent-select', 'Agent Select']
		] as const) {
			await page.goto(`/admin/graphics/${id}`);
			await save(page, `Take ${label} Live`);
		}
		for (const [layer, id] of [
			[0, 'in-game'],
			[1, 'player-lineup'],
			[2, 'agent-select']
		] as const)
			await expect(
				composite.locator(`[data-live-layer="${layer}"] [data-graphic="${id}"] > div`)
			).toHaveCount(1);
		const liveNow = page.getByRole('region', { name: 'Live now', exact: true });
		for (const row of ['Layer 0: In-Game', 'Layer 1: Player Lineup', 'Layer 2: Agent Select'])
			await expect(liveNow.getByText(row, { exact: true })).toBeVisible();
		await save(page, 'Clear composite');
		await expect(composite.locator('[data-graphic] > div')).toHaveCount(0);
	} finally {
		await composite.close();
	}
});

test('Update Live keeps the graphic on air', async ({ page, browser }) => {
	await takeGameLive(page);
	const composite = await browser.newPage();
	let moved = false;
	try {
		await composite.goto('/gfx/live/composite');
		await save(page, 'Take Player Lineup Live');
		const lineup = composite.locator('[data-live-layer="1"] [data-graphic="player-lineup"]');
		await expect(lineup.locator(':scope > div')).toHaveCount(1);
		const before = Number(await lineup.getAttribute('data-data-revision'));
		// Record whether the layer is ever empty from here on.
		await lineup.evaluate((element) => {
			const win = window as unknown as { emptied: boolean };
			win.emptied = false;
			new MutationObserver(() => {
				if (!element.querySelector(':scope > div')) win.emptied = true;
			}).observe(element, { childList: true });
		});
		await page.getByRole('button', { name: 'Alpha slot 1 Move Down', exact: true }).click();
		moved = true;
		await save(page, 'Save lineup');
		// Saved data does not reach the composite until Update.
		await expect(lineup).toHaveAttribute('data-data-revision', String(before));
		await save(page, 'Update Player Lineup Live');
		await expect
			.poll(async () => Number(await lineup.getAttribute('data-data-revision')))
			.toBeGreaterThan(before);
		await expect(lineup.locator(':scope > div')).toHaveCount(1);
		expect(
			await composite.evaluate(() => (window as unknown as { emptied: boolean }).emptied)
		).toBe(false);
		await save(page, 'Take Player Lineup Off');
		await expect(lineup.locator(':scope > div')).toHaveCount(0);
	} finally {
		if (moved) {
			await page.getByRole('button', { name: 'Alpha slot 2 Move Up', exact: true }).click();
			await save(page, 'Save lineup');
		}
		await composite.close();
	}
});

test('each graphic keeps its standalone and composite outputs independent across a reload', async ({
	page,
	browser
}) => {
	test.setTimeout(120_000);
	await takeGameLive(page);
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
			await expect(individualGraphic).toHaveCount(1);
			await expect(combinedGraphic).toHaveCount(0);
			await save(page, `Take ${label} Live`);
			await expect(combinedGraphic).toHaveCount(1);
			await output.reload();
			await expect(combinedGraphic).toHaveCount(1);
			await save(page, `Hide ${label}`);
			await expect(individualGraphic).toHaveCount(0);
			await expect(combinedGraphic).toHaveCount(1);
			await save(page, `Take ${label} Off`);
			await expect(combinedGraphic).toHaveCount(0);
		}
	} finally {
		await output.close();
		await individual.close();
	}
});
