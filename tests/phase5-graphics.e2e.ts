import { expect, test } from '@playwright/test';
import { createClient } from '@libsql/client';
import { graphicIds } from '../src/lib/broadcast/controls';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

test('production graphics stay stable, transparent and read-only across live selections', async ({
	page,
	browser
}) => {
	test.setTimeout(120_000);
	const tournament = await prepareTournament(page, 'Unknown graphics template', [1]);
	const match = await createMatch(page, tournament, 'Stable graphics match', 3);
	const game = await createGame(page, match);
	const nextGame = await createGame(page, match);
	await page.goto('/admin/graphics');
	await page
		.getByRole('combobox', { name: 'Tournament', exact: true })
		.selectOption(tournament.split('/').pop()!);
	await page
		.getByRole('combobox', { name: 'Match', exact: true })
		.selectOption(match.split('/').pop()!);
	await page
		.getByRole('combobox', { name: 'Game', exact: true })
		.selectOption(game.split('/').pop()!);
	await save(page, 'Take game live');
	await page.getByLabel('Show Player Lineup', { exact: true }).check();
	await save(page, 'Save Player Lineup');
	const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	const mutations: string[] = [];
	output.on('request', (request) => {
		if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url());
	});
	const db = createClient({ url: process.env.DATABASE_URL! });
	try {
		const original = (await db.execute('SELECT * FROM broadcast_state')).rows;
		for (const graphic of graphicIds) {
			await output.goto(`/gfx/live/${graphic}`);
			await expect(output.locator('[data-graphic]')).toHaveAttribute(
				'data-game-id',
				game.split('/').pop()!
			);
			await expect(output.locator('[data-graphic]')).toHaveAttribute('data-template', 'test');
			await expect(output.locator('form, button, input, select')).toHaveCount(0);
			expect(await output.locator('#graphics-container').boundingBox()).toMatchObject({
				width: 1920,
				height: 1080
			});
			expect(
				await output.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)
			).toBe('rgba(0, 0, 0, 0)');
		}
		expect((await db.execute('SELECT * FROM broadcast_state')).rows).toEqual(original);
		await output.goto('/gfx/live/player-lineup');
		await expect(output.getByRole('heading', { name: 'Player Lineup', exact: true })).toBeVisible();
		await page
			.getByRole('combobox', { name: 'Game', exact: true })
			.selectOption(nextGame.split('/').pop()!);
		await save(page, 'Take game live');
		await expect(output.locator('[data-graphic]')).toHaveAttribute(
			'data-game-id',
			nextGame.split('/').pop()!
		);
		await expect(output).toHaveURL(/\/gfx\/live\/player-lineup$/);
		await save(page, 'Clear live selection');
		await expect(output.getByText('No game selected', { exact: true })).toBeVisible();
		expect(mutations).toEqual([]);
		expect((await output.goto('/gfx/live/unknown'))?.status()).toBe(404);
	} finally {
		db.close();
		await output.close();
	}
});
