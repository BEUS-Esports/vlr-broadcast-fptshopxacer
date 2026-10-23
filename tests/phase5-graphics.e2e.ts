import { expect } from '@playwright/test';
import { test } from './fixtures';
import { createClient } from '@libsql/client';
import { graphicIds, graphicLabels } from '../src/lib/broadcast/controls';
import { mkdir } from 'node:fs/promises';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

test('production graphics stay stable, transparent and read-only across live selections', async ({
	page,
	browser
}) => {
	test.setTimeout(120_000);
	const tournament = await prepareTournament(page, 'Unknown graphics template', [1]);
	const match = await createMatch(page, tournament, 'Stable graphics match', 3);
	const game = await createGame(page, match);
	await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-1');
	await save(page, 'Save game info');
	await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
	await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-1');
	await page.getByRole('combobox', { name: 'Bravo slot 1', exact: true }).selectOption('Bravo-1');
	await save(page, 'Save lineup');
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
	for (const graphic of graphicIds) {
		await page.goto(`/admin/graphics/${graphic}`);
		await save(page, `Show ${graphicLabels[graphic]}`);
	}
	const outputs = await Promise.all(
		graphicIds.map(() => browser.newPage({ viewport: { width: 1920, height: 1080 } }))
	);
	const output = outputs[0];
	const errors: string[] = [];
	const mutations: string[] = [];
	for (const target of outputs) {
		target.on('pageerror', (error) => errors.push(error.message));
		target.on('request', (request) => {
			if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url());
		});
	}
	const db = createClient({ url: process.env.DATABASE_URL! });
	try {
		const original = (await db.execute('SELECT * FROM broadcast_state')).rows;
		await mkdir('docs/phase-5-screenshots', { recursive: true });
		for (const [index, graphic] of graphicIds.entries()) {
			const output = outputs[index];
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
			await expect(output.locator('[data-graphic] section').first()).toBeVisible();
			await output.screenshot({
				path: `docs/phase-5-screenshots/${graphic}.png`,
				omitBackground: true
			});
			await page.goto(`/admin/graphics/${graphic}`);
			await save(page, `Hide ${graphicLabels[graphic]}`);
			await expect(output.locator('[data-graphic] > div')).toHaveCount(0);
			await save(page, `Show ${graphicLabels[graphic]}`);
			await expect(output.locator('[data-graphic] section').first()).toBeVisible();
		}
		// Visibility mutations alone leave the persisted selection and presentation intact.
		const current = (await db.execute('SELECT * FROM broadcast_state')).rows[0];
		expect(original[0].selected_game_id).toBe(game.split('/').pop()!);
		for (const key of ['selected_game_id', 'swapped', 'current_attackers_entry_id'])
			expect(current[key]).toEqual(original[0][key]);
		await expect(output.getByRole('heading', { name: 'Player Lineup', exact: true })).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Tournament', exact: true })).toBeDisabled();
		for (const graphic of graphicIds) {
			await page.goto(`/admin/graphics/${graphic}`);
			await save(page, `Hide ${graphicLabels[graphic]}`);
		}
		await page
			.getByRole('combobox', { name: 'Tournament', exact: true })
			.selectOption('tabs-event');
		for (const output of outputs)
			await expect(output.locator('[data-live-graphic]')).toHaveAttribute(
				'data-game-id',
				game.split('/').pop()!
			);
		await page
			.getByRole('combobox', { name: 'Tournament', exact: true })
			.selectOption(tournament.split('/').pop()!);
		await page
			.getByRole('combobox', { name: 'Match', exact: true })
			.selectOption(match.split('/').pop()!);
		await page
			.getByRole('combobox', { name: 'Game', exact: true })
			.selectOption(nextGame.split('/').pop()!);
		await save(page, 'Take game live');
		for (const graphic of graphicIds) {
			await page.goto(`/admin/graphics/${graphic}`);
			await save(page, `Show ${graphicLabels[graphic]}`);
		}
		for (const output of outputs)
			await expect(output.locator('[data-graphic]')).toHaveAttribute(
				'data-game-id',
				nextGame.split('/').pop()!
			);
		await expect(output).toHaveURL(/\/gfx\/live\/player-lineup$/);
		const controlRevisions = await Promise.all(
			outputs.map((output) =>
				output.locator('[data-live-graphic]').getAttribute('data-control-revision')
			)
		);
		expect(new Set(controlRevisions).size).toBe(1);
		expect(Number(controlRevisions[0])).toBeGreaterThan(Number(current.control_revision));
		for (const output of outputs) {
			await output.reload();
			await expect(output.locator('[data-graphic]')).toHaveAttribute(
				'data-game-id',
				nextGame.split('/').pop()!
			);
		}
		for (const graphic of graphicIds) {
			await page.goto(`/admin/graphics/${graphic}`);
			await save(page, `Hide ${graphicLabels[graphic]}`);
		}
		await save(page, 'Clear live selection');
		for (const output of outputs)
			await expect(output.locator('[data-graphic] > div')).toHaveCount(0);
		expect(errors).toEqual([]);
		expect(mutations).toEqual([]);
		expect((await output.goto('/gfx/live/unknown'))?.status()).toBe(404);
	} finally {
		db.close();
		await Promise.all(outputs.map((output) => output.close()));
	}
});
