import { expect, test } from '@playwright/test';
import { createClient } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import { createGame, createMatch, prepareTournament, save, scores } from './management-helpers';

test('controller commits complete selections and rejects retained stale drafts across sessions', async ({
	page,
	browser
}) => {
	test.setTimeout(120_000);
	const tournament = await prepareTournament(page, 'Graphics event', [1, 2]);
	const match = await createMatch(page, tournament, 'Graphics match', 3);
	const game = await createGame(page, match);
	await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-1');
	await save(page, 'Save game info');
	await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
	await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-1');
	await page.getByRole('combobox', { name: 'Alpha slot 2', exact: true }).selectOption('Alpha-2');
	await page.getByRole('combobox', { name: 'Bravo slot 1', exact: true }).selectOption('Bravo-1');
	await save(page, 'Save lineup');
	page.once('dialog', (dialog) => dialog.accept());
	await scores(page, '13', '7');
	await page.getByRole('tab', { name: 'Post-Game Report', exact: true }).click();
	await page
		.getByRole('region', { name: 'Game MVP', exact: true })
		.getByRole('combobox', { name: 'Player', exact: true })
		.selectOption('Alpha-1');
	await save(page, 'Save Game MVP');
	const nextGame = await createGame(page, match);
	const db = createClient({ url: process.env.DATABASE_URL! });
	const matchId = match.split('/').pop()!;
	const gameId = game.split('/').pop()!;
	const participants = (
		await db.execute({
			sql: 'SELECT team_a_entry_id, team_b_entry_id FROM matches WHERE id = ?',
			args: [matchId]
		})
	).rows[0];
	await db.batch(
		[
			{
				sql: 'INSERT INTO match_veto_actions (id, match_id, sequence, action, map_id, acting_entry_id) VALUES (?, ?, 1, ?, ?, ?)',
				args: [`veto-${matchId}`, matchId, 'ban', 'map-2', participants.team_a_entry_id]
			},
			{
				sql: 'INSERT INTO game_player_statistics (game_id, player_id, entry_id, kills, deaths, performance_score) VALUES (?, ?, ?, 0, 3, 240)',
				args: [gameId, 'Alpha-1', participants.team_a_entry_id]
			},
			{
				sql: 'INSERT INTO game_player_statistics (game_id, player_id, entry_id, kills) VALUES (?, ?, ?, 7)',
				args: [gameId, 'Bravo-1', participants.team_b_entry_id]
			}
		],
		'write'
	);
	const preparedData = async () =>
		(
			await db.batch(
				[
					{ sql: 'SELECT * FROM games WHERE id = ?', args: [game.split('/').pop()!] },
					{
						sql: 'SELECT * FROM game_lineups WHERE game_id = ? ORDER BY entry_id, slot',
						args: [game.split('/').pop()!]
					},
					{
						sql: 'SELECT * FROM match_veto_actions WHERE match_id = ? ORDER BY sequence',
						args: [match.split('/').pop()!]
					},
					{
						sql: 'SELECT * FROM game_player_statistics WHERE game_id = ? ORDER BY player_id',
						args: [game.split('/').pop()!]
					}
				],
				'read'
			)
		).map((result) => result.rows);
	const originalPreparation = await preparedData();
	expect(originalPreparation[2]).toHaveLength(1);
	expect(originalPreparation[3]).toHaveLength(2);
	await page.goto('/admin/graphics');
	await expect(page.getByRole('heading', { name: 'Global Settings', exact: true })).toBeVisible();
	await page
		.getByRole('combobox', { name: 'Tournament', exact: true })
		.selectOption(tournament.split('/').pop()!);
	await page
		.getByRole('combobox', { name: 'Match', exact: true })
		.selectOption(match.split('/').pop()!);
	await expect(page.getByRole('button', { name: 'Take game live', exact: true })).toBeDisabled();
	await expect(page.getByRole('region', { name: 'On air', exact: true })).toContainText(
		'No game selected'
	);
	await page
		.getByRole('combobox', { name: 'Game', exact: true })
		.selectOption(game.split('/').pop()!);
	await save(page, 'Take game live');
	await page.goto('/admin/graphics/in-game');
	await save(page, 'Show In-Game');
	await mkdir('docs/phase-5-screenshots', { recursive: true });
	const identityOutput = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	await identityOutput.goto('/gfx/live/in-game');
	const left = identityOutput.locator('[data-position="left"]');
	const right = identityOutput.locator('[data-position="right"]');
	await expect(left).toContainText('Alpha');
	await expect(right).toContainText('Bravo');
	const onAir = page.getByRole('region', { name: 'On air', exact: true });
	await expect(onAir).toContainText('Graphics match');
	await expect(onAir).toContainText('Map 1');
	const context = await browser.newContext();
	const other = await context.newPage();
	await other.goto('http://localhost:4173/admin/graphics');
	await expect(other.getByLabel('Broadcast connection')).toContainText('Connection: connected');
	await expect(page.getByRole('combobox', { name: 'Tournament', exact: true })).toBeDisabled();
	await page
		.getByRole('combobox', { name: 'Current attackers', exact: true })
		.selectOption({ label: 'Alpha' });
	await other.goto(`http://localhost:4173${nextGame}`);
	await other.getByLabel('Game name', { exact: true }).fill('Updated preparation');
	await save(other, 'Save game info');
	await other.goto('http://localhost:4173/admin/graphics');
	await save(other, 'Swap Left/Right');
	await expect(left).toContainText('Bravo');
	await expect(right).toContainText('Alpha');
	await expect(onAir).toContainText('Left: Bravo');
	await expect(page.getByRole('combobox', { name: 'Current attackers', exact: true })).toHaveValue(
		String(participants.team_a_entry_id)
	);
	await expect(
		page.getByRole('combobox', { name: 'Game', exact: true }).locator('option')
	).toContainText(['Choose game', 'Game 1', 'Updated preparation']);
	const stale = page.waitForResponse((r) => r.request().method() === 'POST');
	await page.getByRole('button', { name: 'Save presentation', exact: true }).click();
	expect((await stale).status()).toBe(409);
	await expect(page.getByRole('alert')).toContainText('Reload before saving');
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Reload this section', exact: true }).click();
	await other
		.getByRole('combobox', { name: 'Current attackers', exact: true })
		.selectOption({ label: 'Bravo' });
	await save(other, 'Save presentation');
	await expect(onAir).toContainText('Attackers: Bravo');
	await expect(left.locator('.identity')).toHaveAttribute('data-side', 'attack');
	await expect(right.locator('.identity')).toHaveAttribute('data-side', 'defense');
	expect(
		await left.locator('.identity').evaluate((el) => getComputedStyle(el).borderInlineStartColor)
	).toBe('rgb(36, 139, 255)');
	expect(
		await right.locator('.identity').evaluate((el) => getComputedStyle(el).borderInlineStartColor)
	).toBe('rgb(255, 70, 85)');
	await identityOutput.screenshot({
		path: 'docs/phase-5-screenshots/in-game-current-sides.png',
		omitBackground: true
	});
	await other
		.getByRole('combobox', { name: 'Current attackers', exact: true })
		.selectOption({ label: 'Alpha' });
	await save(other, 'Save presentation');
	await expect(left).toContainText('Bravo');
	await expect(left.locator('.identity')).toHaveAttribute('data-side', 'defense');
	await expect(right.locator('.identity')).toHaveAttribute('data-side', 'attack');
	await other.getByRole('combobox', { name: 'Current attackers', exact: true }).selectOption('');
	await save(other, 'Save presentation');
	await expect(onAir).toContainText('Attackers: Unknown');
	await expect(onAir).toContainText('Left: Bravo');
	await other.goto('/admin/graphics/player-stats');
	const statsOutput = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	await statsOutput.goto('/gfx/live/player-stats');
	await other
		.getByRole('combobox', { name: 'Stats mode', exact: true })
		.selectOption('head-to-head');
	for (const scope of ['game', 'match', 'tournament']) {
		await other.getByRole('combobox', { name: 'Stats scope', exact: true }).selectOption(scope);
		await other
			.getByRole('combobox', { name: 'Stats player', exact: true })
			.selectOption('Alpha-1');
		await other
			.getByRole('combobox', { name: 'Opponent player', exact: true })
			.selectOption('Bravo-1');
		await save(other, 'Save Player Stats controls');
		await save(other, 'Show Player Stats');
		await expect(
			statsOutput.getByText(`Head-to-Head · Scope: ${scope}`, { exact: true })
		).toBeVisible();
		await expect(statsOutput.locator('[data-player-panel]')).toHaveCount(2);
		await expect(statsOutput.locator('[data-player-panel="Alpha-1"]')).toContainText('Alpha 1');
		await expect(statsOutput.locator('[data-player-panel="Bravo-1"]')).toContainText('Bravo 1');
		await expect(statsOutput).toHaveURL(/\/gfx\/live\/player-stats$/);
		await save(other, 'Hide Player Stats');
	}
	await other
		.getByRole('combobox', { name: 'Opponent player', exact: true })
		.selectOption('Alpha-2');
	await save(other, 'Save Player Stats controls');
	await save(other, 'Show Player Stats');
	await expect(statsOutput.locator('[data-player-panel="Alpha-2"]')).toContainText('Alpha 2');
	await statsOutput.screenshot({
		path: 'docs/phase-5-screenshots/player-stats-head-to-head.png',
		omitBackground: true
	});
	await save(other, 'Hide Player Stats');
	await other.getByRole('combobox', { name: 'Stats mode', exact: true }).selectOption('single');
	await save(other, 'Save Player Stats controls');
	await save(other, 'Show Player Stats');
	await expect(statsOutput.locator('[data-player-panel]')).toHaveCount(1);
	await expect(statsOutput.locator('body')).toContainText('Single / Player to Watch');
	await statsOutput.screenshot({
		path: 'docs/phase-5-screenshots/player-stats-single.png',
		omitBackground: true
	});
	await expect(other.getByRole('combobox', { name: 'Opponent player', exact: true })).toHaveCount(
		0
	);
	await other.goto('/admin/graphics/mvp');
	await other.getByRole('combobox', { name: 'MVP scope', exact: true }).selectOption('match');
	await save(other, 'Save MVP controls');
	await other.getByRole('combobox', { name: 'MVP scope', exact: true }).selectOption('game');
	await save(other, 'Save MVP controls');
	await save(other, 'Show MVP');
	const preparedOutput = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	await preparedOutput.goto('/gfx/live/mvp');
	await expect(preparedOutput.getByText('Alpha 1', { exact: true })).toBeVisible();
	await preparedOutput.screenshot({
		path: 'docs/phase-5-screenshots/mvp-saved.png',
		omitBackground: true
	});
	await other.goto('/admin/graphics/map-veto');
	await save(other, 'Show Map Veto');
	await preparedOutput.goto('/gfx/live/map-veto');
	await expect(preparedOutput.getByText('Map 2', { exact: true })).toBeVisible();
	await preparedOutput.screenshot({
		path: 'docs/phase-5-screenshots/map-veto-saved.png',
		omitBackground: true
	});
	await other.goto('/admin/graphics/player-lineup');
	await save(other, 'Show Player Lineup');
	await expect(other.getByRole('link', { name: 'Open Player Lineup output' })).toHaveAttribute(
		'href',
		'/gfx/live/player-lineup'
	);
	expect(await preparedData()).toEqual(originalPreparation);
	expect(
		(
			await db.execute({
				sql: 'SELECT team_a_entry_id, team_b_entry_id FROM matches WHERE id = ?',
				args: [matchId]
			})
		).rows[0]
	).toEqual(participants);
	db.close();
	await page.goto(game);
	await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toHaveValue('map-1');
	await expect(page.getByRole('combobox', { name: 'Starting attackers', exact: true })).toHaveValue(
		''
	);
	for (const [id, label] of [
		['player-lineup', 'Player Lineup'],
		['player-stats', 'Player Stats'],
		['map-veto', 'Map Veto'],
		['mvp', 'MVP'],
		['in-game', 'In-Game']
	]) {
		await page.goto('/admin/graphics/' + id);
		await save(page, 'Hide ' + label);
	}
	await page.goto('/admin/graphics');
	await save(page, 'Clear live selection');
	await expect(other.getByRole('region', { name: 'On air', exact: true })).toContainText(
		'No game selected'
	);
	await context.close();
	await identityOutput.close();
	await statsOutput.close();
	await preparedOutput.close();
});
