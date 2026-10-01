import { expect, test } from '@playwright/test';
import { createClient } from '@libsql/client';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

test('controller commits complete selections and rejects retained stale drafts across sessions', async ({
	page,
	browser
}) => {
	test.setTimeout(120_000);
	const tournament = await prepareTournament(page, 'Graphics event', [1]);
	const match = await createMatch(page, tournament, 'Graphics match', 3);
	const game = await createGame(page, match);
	await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-1');
	await save(page, 'Save game info');
	await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
	await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-1');
	await page.getByRole('combobox', { name: 'Bravo slot 1', exact: true }).selectOption('Bravo-1');
	await save(page, 'Save lineup');
	const nextGame = await createGame(page, match);
	const db = createClient({ url: process.env.DATABASE_URL! });
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
	await page.goto('/admin/graphics');
	await expect(
		page.getByRole('heading', { name: 'Graphics Controller', exact: true })
	).toBeVisible();
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
	const onAir = page.getByRole('region', { name: 'On air', exact: true });
	await expect(onAir).toContainText('Graphics match');
	await expect(onAir).toContainText('Map 1');
	const context = await browser.newContext();
	const other = await context.newPage();
	await other.goto('http://localhost:4173/admin/graphics');
	await expect(other.getByLabel('Broadcast connection')).toContainText('Connection: connected');
	await page.getByRole('combobox', { name: 'Tournament', exact: true }).selectOption('tabs-event');
	await expect(onAir).toContainText('Graphics match');
	await other.goto(`http://localhost:4173${nextGame}`);
	await other.getByLabel('Game name', { exact: true }).fill('Updated preparation');
	await save(other, 'Save game info');
	await other.goto('http://localhost:4173/admin/graphics');
	await save(other, 'Swap Left/Right');
	await expect(onAir).toContainText('Left: Bravo');
	await expect(page.getByRole('combobox', { name: 'Tournament', exact: true })).toHaveValue(
		'tabs-event'
	);
	await page
		.getByRole('combobox', { name: 'Tournament', exact: true })
		.selectOption(tournament.split('/').pop()!);
	await page
		.getByRole('combobox', { name: 'Match', exact: true })
		.selectOption(match.split('/').pop()!);
	await expect(
		page.getByRole('combobox', { name: 'Game', exact: true }).locator('option')
	).toContainText(['Choose game', 'Game 1', 'Updated preparation']);
	await page
		.getByRole('combobox', { name: 'Game', exact: true })
		.selectOption(nextGame.split('/').pop()!);
	const stale = page.waitForResponse((r) => r.request().method() === 'POST');
	await page.getByRole('button', { name: 'Take game live', exact: true }).click();
	expect((await stale).status()).toBe(409);
	await expect(page.getByRole('alert')).toContainText('Reload before saving');
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Reload this section', exact: true }).click();
	await other
		.getByRole('combobox', { name: 'Current attackers', exact: true })
		.selectOption({ label: 'Bravo' });
	await save(other, 'Save presentation');
	await expect(onAir).toContainText('Attackers: Bravo');
	await other.getByRole('combobox', { name: 'Current attackers', exact: true }).selectOption('');
	await save(other, 'Save presentation');
	await expect(onAir).toContainText('Attackers: Unknown');
	await expect(onAir).toContainText('Left: Bravo');
	await other.getByRole('tab', { name: 'Player Stats', exact: true }).click();
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
		await save(other, 'Save Player Stats');
	}
	await other.getByRole('combobox', { name: 'Stats mode', exact: true }).selectOption('single');
	await save(other, 'Save Player Stats');
	await expect(other.getByRole('combobox', { name: 'Opponent player', exact: true })).toHaveCount(
		0
	);
	await other.getByRole('tab', { name: 'MVP', exact: true }).click();
	await other.getByRole('combobox', { name: 'MVP scope', exact: true }).selectOption('match');
	await save(other, 'Save MVP');
	await other.getByRole('tab', { name: 'Player Lineup', exact: true }).click();
	await other.getByLabel('Show Player Lineup').check();
	await save(other, 'Save Player Lineup');
	await expect(other.getByRole('link', { name: 'Open Player Lineup output' })).toHaveAttribute(
		'href',
		'/gfx/live/player-lineup'
	);
	expect(await preparedData()).toEqual(originalPreparation);
	db.close();
	await page.goto(game);
	await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toHaveValue('map-1');
	await expect(page.getByRole('combobox', { name: 'Starting attackers', exact: true })).toHaveValue(
		''
	);
	await page.goto('/admin/graphics');
	await save(page, 'Clear live selection');
	await expect(other.getByRole('region', { name: 'On air', exact: true })).toContainText(
		'No game selected'
	);
	await context.close();
});
