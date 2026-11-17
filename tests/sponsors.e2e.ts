import { expect, type Page } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { test } from './fixtures';
import { defaultSponsorConfig } from '../src/lib/broadcast/sponsor';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
	'base64'
);
const image = (name: string) => ({ name, mimeType: 'image/png', buffer: png });

type Fixture = { tournamentId: string; matchId: string; gameId: string };
const fixtures = new Map<string, Fixture>();

// One tournament per template slug, built once and reused by every test in this file.
async function fixture(page: Page, slug: string) {
	const cached = fixtures.get(slug);
	if (cached) return cached;
	const db = createClient({ url: process.env.DATABASE_URL! });
	try {
		// A restarted worker has an empty cache, but the unique slug already exists in the database.
		const existing = (
			await db.execute({
				sql: `SELECT t.id AS tournament_id, m.id AS match_id, g.id AS game_id
					FROM tournaments t JOIN matches m ON m.tournament_id = t.id JOIN games g ON g.match_id = m.id
					WHERE t.slug = ? LIMIT 1`,
				args: [slug]
			})
		).rows[0];
		if (existing) {
			const reused = {
				tournamentId: String(existing.tournament_id),
				matchId: String(existing.match_id),
				gameId: String(existing.game_id)
			};
			fixtures.set(slug, reused);
			return reused;
		}
		const tournament = await prepareTournament(page, `Sponsor ${slug}`, [1]);
		const match = await createMatch(page, tournament, `Sponsor ${slug}`, 1);
		const game = await createGame(page, match);
		const created = {
			tournamentId: tournament.split('/').pop()!,
			matchId: match.split('/').pop()!,
			gameId: game.split('/').pop()!
		};
		const entries = (
			await db.execute({
				sql: 'SELECT team_a_entry_id, team_b_entry_id FROM matches WHERE id = ?',
				args: [created.matchId]
			})
		).rows[0];
		await db.batch(
			[
				{ sql: 'UPDATE tournaments SET slug = ? WHERE id = ?', args: [slug, created.tournamentId] },
				{
					sql: 'UPDATE games SET map_id = ?, starting_attackers_entry_id = ?, starting_defenders_entry_id = ? WHERE id = ?',
					args: ['map-1', entries.team_a_entry_id, entries.team_b_entry_id, created.gameId]
				}
			],
			'write'
		);
		fixtures.set(slug, created);
		return created;
	} finally {
		db.close();
	}
}

/** Takes the template's game live, shows In-Game and returns the on-air output page. */
async function showInGame(page: Page, output: Page, slug: string) {
	const { tournamentId, matchId, gameId } = await fixture(page, slug);
	await page.goto('/admin/graphics');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption(tournamentId);
	await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption(matchId);
	await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption(gameId);
	await save(page, 'Take game live');
	await page.goto('/admin/graphics/in-game');
	await save(page, 'Show In-Game');
	await output.goto('/gfx/live/in-game');
}

async function technicalPause(page: Page, output: Page) {
	await page.goto('/admin/graphics/in-game');
	await page.getByRole('button', { name: 'Technical Pause', exact: true }).click();
	await expect(output.locator('[data-match-banner]')).toContainText('TECHNICAL PAUSE');
}

async function submit(page: Page, form: string, button: string) {
	const region = page.getByRole('form', { name: form, exact: true });
	const response = page.waitForResponse((response) => response.request().method() === 'POST');
	await region.getByRole('button', { name: button, exact: true }).click();
	expect((await (await response).json()).type).toBe('success');
}

test.beforeEach(async () => {
	// Sponsor settings are not part of the shared broadcast reset; start every test unset.
	const db = createClient({ url: process.env.DATABASE_URL! });
	try {
		await db.execute({
			sql: "UPDATE sponsor_settings SET banners = ?, loop_logos = '[]', loop_interval_ms = 5000 WHERE id = 1",
			args: [JSON.stringify(defaultSponsorConfig.banners)]
		});
	} finally {
		db.close();
	}
});

test('banner art reaches on-air output without re-Show', async ({ page, browser }) => {
	test.setTimeout(240_000);
	const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	try {
		await showInGame(page, output, 'predator-roadshow-val');
		await technicalPause(page, output);
		await expect(output.locator('[data-banner-sponsor-background]')).toHaveCount(0);

		await page.goto('/admin/sponsors');
		const technical = page.getByRole('form', { name: 'Technical Pause', exact: true });
		await expect(technical).toContainText('Uses Tournament Banner');
		await technical.locator('input[name="background"]').setInputFiles(image('banner.png'));
		await submit(page, 'Technical Pause', 'Save banner');
		await expect(output.locator('[data-banner-sponsor-background]')).toBeVisible();
	} finally {
		await output.close();
	}
});

test('loop shows uploaded logos', async ({ page, browser }) => {
	test.setTimeout(240_000);
	const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	try {
		await showInGame(page, output, 'predator-roadshow-val');
		await expect(output.locator('[data-sponsor-loop]')).toHaveCount(0);

		await page.goto('/admin/sponsors');
		await page.getByLabel('Seconds per logo').fill('2');
		await submit(page, 'Loop interval', 'Save interval');
		await page.locator('input[name="logos"]').setInputFiles([image('one.png'), image('two.png')]);
		await submit(page, 'Add loop logos', 'Add logos');
		await expect(page.getByRole('img', { name: 'Loop logo 2' })).toBeVisible();

		const loop = output.locator('[data-sponsor-loop]');
		await expect(loop).toBeVisible();
		const first = await loop.getAttribute('data-index');
		await expect.poll(() => loop.getAttribute('data-index'), { timeout: 3500 }).not.toBe(first);
	} finally {
		await output.close();
	}
});

test('unsupported template stays clean', async ({ page, browser }) => {
	test.setTimeout(240_000);
	const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	try {
		await page.goto('/admin/sponsors');
		await page.getByLabel('Seconds per logo').fill('2');
		await submit(page, 'Loop interval', 'Save interval');
		await page.locator('input[name="logos"]').setInputFiles([image('one.png'), image('two.png')]);
		await submit(page, 'Add loop logos', 'Add logos');
		await page
			.getByRole('form', { name: 'Technical Pause', exact: true })
			.locator('input[name="background"]')
			.setInputFiles(image('banner.png'));
		await submit(page, 'Technical Pause', 'Save banner');

		await showInGame(page, output, 'beus-graph-test');
		await technicalPause(page, output);
		await expect(output.locator('[data-banner-sponsor-background]')).toHaveCount(0);
		await expect(output.locator('[data-banner-sponsor-logo]')).toHaveCount(0);
		await expect(output.locator('[data-sponsor-loop]')).toHaveCount(0);
	} finally {
		await output.close();
	}
});

test('invalid upload keeps config', async ({ page }) => {
	await page.goto('/admin/sponsors');
	const clutch = page.getByRole('form', { name: 'Clutch', exact: true });
	await clutch.locator('input[name="logo"]').setInputFiles({
		name: 'logo.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not an image')
	});
	await clutch.getByRole('button', { name: 'Save banner', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Use a PNG, JPEG, or WebP image.');

	await page.reload();
	await expect(clutch).toContainText('Uses Tournament Banner');
	await expect(clutch.getByRole('img')).toHaveCount(0);
});

test('failed banner save removes the already-uploaded background', async ({ page }) => {
	await page.goto('/admin/sponsors');
	const clutch = page.getByRole('form', { name: 'Clutch', exact: true });
	const before = await readdir(process.env.ASSET_DIR!);
	await clutch.locator('input[name="background"]').setInputFiles(image('background.png'));
	await clutch.locator('input[name="logo"]').setInputFiles({
		name: 'logo.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not an image')
	});
	await clutch.getByRole('button', { name: 'Save banner', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Use a PNG, JPEG, or WebP image.');

	await page.reload();
	await expect(clutch).toContainText('Uses Tournament Banner');
	await expect(clutch.getByRole('img')).toHaveCount(0);
	// The valid background was stored before the logo was rejected, so it must have been rolled back.
	expect(await readdir(process.env.ASSET_DIR!)).toEqual(before);
});
