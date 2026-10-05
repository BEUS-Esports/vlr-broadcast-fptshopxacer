import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import { defaultVisibility } from '../src/lib/broadcast/controls';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

async function command(page: Page, name: string) {
	const response = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('?/controls')
	);
	await page.getByRole('button', { name, exact: true }).click();
	const result = await response;
	expect(result.ok()).toBe(true);
	expect((await result.json()).type).toBe('success');
}

test('match banners share native, empty live and Program state without publication recapture', async ({
	page,
	browser,
	request
}) => {
	test.setTimeout(150_000);
	const db = createClient({ url: process.env.DATABASE_URL! });
	const outputs: Page[] = [];
	try {
		// This fixture owns the disposable app, including any shown graphics from earlier journeys.
		await db.execute({
			sql: 'UPDATE broadcast_state SET visibility = ?, publications = ? WHERE id = 1',
			args: [JSON.stringify(defaultVisibility), '{}']
		});
		const tournament = await prepareTournament(page, 'Phase 6.1 banners', [1]);
		const match = await createMatch(page, tournament, 'Match banners', 1);
		const game = await createGame(page, match);
		const gameId = game.split('/').pop()!;
		const matchId = match.split('/').pop()!;
		const entries = (
			await db.execute({
				sql: 'SELECT team_a_entry_id, team_b_entry_id FROM matches WHERE id = ?',
				args: [matchId]
			})
		).rows[0];
		await db.execute({
			sql: 'UPDATE games SET map_id = ?, starting_attackers_entry_id = ?, starting_defenders_entry_id = ? WHERE id = ?',
			args: ['map-1', entries.team_a_entry_id, entries.team_b_entry_id, gameId]
		});
		await page.goto('/admin/graphics');
		await page
			.getByRole('combobox', { name: 'Tournament', exact: true })
			.selectOption(tournament.split('/').pop()!);
		await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption(matchId);
		await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption(gameId);
		await save(page, 'Take game live');
		await page.goto('/admin/graphics/in-game');
		await save(page, 'Show In-Game');
		const native = page.getByRole('region', { name: 'Preview', exact: true });
		const live = page.getByRole('region', { name: 'Preview Live Data HUD', exact: true });
		const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
		outputs.push(output);
		await output.goto('/gfx/live/in-game');
		const banner = (surface: Page | ReturnType<Page['getByRole']>) =>
			surface.locator('[data-match-banner]');
		const persisted = async () =>
			(
				await db.execute(
					'SELECT control_revision, revision AS data_revision, publications, pause, ceremony FROM broadcast_state WHERE id = 1'
				)
			).rows[0];
		const before = await persisted();
		const providerBefore = await (await request.get('/admin/live')).json();
		await mkdir('docs/phase-6.1-screenshots', { recursive: true });
		async function capture(name: string) {
			await output.screenshot({
				path: `docs/phase-6.1-screenshots/${name}.png`,
				omitBackground: true
			});
		}
		async function allBanners(label: string, owner?: string) {
			for (const surface of [native, live, output]) {
				await expect(banner(surface)).toHaveCount(1);
				await expect(banner(surface)).toContainText(label);
				if (owner) await expect(banner(surface)).toContainText(owner);
			}
		}
		await command(page, 'Tactical Timeout · Alpha');
		await allBanners('TACTICAL TIMEOUT', 'Alpha');
		await expect(banner(output)).toContainText('ATK');
		await expect.poll(async () => (await banner(output).boundingBox())?.y).toBe(200);
		const bounds = await banner(output).boundingBox();
		expect(bounds?.y).toBe(200);
		expect(bounds?.height).toBeLessThanOrEqual(185);
		expect(bounds && bounds.y + bounds.height).toBeLessThanOrEqual(385);
		await capture('tactical-native-atk');
		for (const preview of [native, live]) {
			await preview.getByRole('button', { name: 'Large Preview', exact: true }).click();
			await expect(
				page
					.getByRole('dialog', {
						name: preview === native ? 'Large Preview · In-Game' : 'Large Preview · Live Data HUD',
						exact: true
					})
					.locator('[data-match-banner]')
			).toContainText('Alpha');
			await page
				.getByRole('dialog', {
					name: preview === native ? 'Large Preview · In-Game' : 'Large Preview · Live Data HUD',
					exact: true
				})
				.getByRole('button', { name: 'Close Preview', exact: true })
				.click();
		}
		// Reduced motion also applies to the provider-independent Live Data Preview.
		const liveCapture = await browser.newPage({
			viewport: { width: 1920, height: 1080 },
			reducedMotion: 'reduce'
		});
		outputs.push(liveCapture);
		await liveCapture.goto('/admin/graphics/in-game');
		const composition = liveCapture
			.getByRole('region', { name: 'Preview Live Data HUD', exact: true })
			.locator('.composition');
		await expect(composition.locator('[data-match-banner]')).toContainText('Alpha');
		expect(
			await composition
				.locator('[data-match-banner]')
				.evaluate((element) => getComputedStyle(element).animationName)
		).toBe('none');
		await command(page, 'Technical Pause After Timeout');
		await expect(page.getByRole('region', { name: 'Match pause', exact: true })).toContainText(
			'Technical Pause pending'
		);
		await allBanners('TACTICAL TIMEOUT', 'Alpha');
		await expect(banner(output)).not.toContainText('pending');
		await command(page, 'Finish Timeout');
		await allBanners('TECHNICAL PAUSE');
		await capture('technical-native');
		await command(page, 'Resume Match');
		await expect(banner(output)).toHaveCount(0);
		// Skew only browser wall clocks; server time and monotonic timers remain untouched.
		await page.clock.setFixedTime(new Date(Date.now() - 5000));
		await output.clock.setFixedTime(new Date(Date.now() + 7000));
		await command(page, 'Trigger Ceremony');
		await allBanners('ROUND WIN', 'Alpha');
		await capture('round-win-native');
		await command(page, 'Tactical Timeout · Bravo');
		await allBanners('ROUND WIN', 'Alpha');
		await expect(page.getByRole('region', { name: 'Match pause', exact: true })).toContainText(
			'will display after the current ceremony'
		);
		await expect(banner(output)).toContainText('TACTICAL TIMEOUT', { timeout: 8000 });
		await allBanners('TACTICAL TIMEOUT', 'Bravo');
		await expect(banner(output)).toContainText('DEF');
		await capture('ceremony-to-tactical-native-def');
		await command(page, 'Finish Timeout');
		await page
			.getByRole('combobox', { name: 'Ceremony team', exact: true })
			.selectOption(String(entries.team_b_entry_id));
		await page.getByRole('combobox', { name: 'Ceremony', exact: true }).selectOption('clutch');
		await command(page, 'Trigger Ceremony');
		await allBanners('CLUTCH', 'Bravo');
		await capture('clutch-native');
		await command(page, 'Dismiss Ceremony');
		for (const surface of [native, live, output]) await expect(banner(surface)).toHaveCount(0);
		await command(page, 'Trigger Ceremony');
		await allBanners('CLUTCH', 'Bravo');
		await expect(banner(output)).toHaveCount(0, { timeout: 8000 });
		await output.reload();
		await expect(output.locator('[data-graphic]')).toHaveAttribute('data-game-id', gameId);
		await expect(banner(output)).toHaveCount(0);
		const staleRevision = Number((await persisted()).control_revision);
		await command(page, 'Tactical Timeout · Alpha');
		await allBanners('TACTICAL TIMEOUT', 'Alpha');
		const stale = await request.post('/admin/graphics/in-game?/controls', {
			headers: { 'x-sveltekit-action': 'true', origin: 'http://localhost:4173' },
			form: {
				payload: JSON.stringify({
					expectedRevision: staleRevision,
					intent: 'in-game',
					command: 'start-tactical',
					entryId: entries.team_b_entry_id
				})
			}
		});
		expect(stale.status()).toBe(409);
		expect(JSON.parse(String((await persisted()).pause))).toMatchObject({
			type: 'tactical',
			entryId: entries.team_a_entry_id
		});
		const after = await persisted();
		expect(after.publications).toBe(before.publications);
		expect(after.data_revision).toBe(before.data_revision);
		const providerAfter = await (await request.get('/admin/live')).json();
		expect(providerAfter.connection.generation).toBe(providerBefore.connection.generation);
		expect(providerAfter.connection.provider).toBe(providerBefore.connection.provider);
		await command(page, 'Finish Timeout');
		await save(page, 'Hide In-Game');
	} finally {
		db.close();
		for (const output of outputs) await output.close();
	}
});
