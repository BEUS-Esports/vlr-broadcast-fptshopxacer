import { createClient } from '@libsql/client';
import { expect, test } from '@playwright/test';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

test('duplication retains stale and ineligible drafts, copies lineup safely and leaves shown program alone', async ({
	page
}) => {
	test.setTimeout(180_000);
	page.on('dialog', (dialog) => dialog.accept());
	const tournament = await prepareTournament(page, 'Game duplication', [1, 2]);
	const match = await createMatch(page, tournament, 'Duplicate BO3', 3);
	const game = await createGame(page, match);
	const gameId = game.split('/').pop()!;
	const matchId = match.split('/').pop()!;
	const db = createClient({ url: process.env.DATABASE_URL! });
	try {
		await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
		await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-2');
		await page.getByRole('combobox', { name: 'Alpha slot 2', exact: true }).selectOption('Alpha-1');
		await page.getByRole('combobox', { name: 'Bravo slot 1', exact: true }).selectOption('Bravo-1');
		await save(page, 'Save lineup');
		await db.execute(
			"INSERT INTO agents (id, key, display_name, is_active) VALUES ('duplication-agent', 'duplication-agent', 'Duplication agent', 1)"
		);
		await db.execute({
			sql: 'UPDATE game_lineups SET agent_id = ? WHERE game_id = ? AND player_id IS NOT NULL',
			args: ['duplication-agent', gameId]
		});
		await db.execute({
			sql: 'UPDATE games SET map_id = ?, starting_attackers_entry_id = (SELECT team_a_entry_id FROM matches WHERE id = ?), starting_defenders_entry_id = (SELECT team_b_entry_id FROM matches WHERE id = ?), score_a = 8, score_b = 3, revision = revision + 1 WHERE id = ?',
			args: ['map-1', matchId, matchId, gameId]
		});
		await page.goto('/admin/graphics');
		await page
			.getByRole('combobox', { name: 'Tournament', exact: true })
			.selectOption(tournament.split('/').pop()!);
		await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption(matchId);
		await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption(gameId);
		await save(page, 'Take game live');
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Player Lineup', exact: true })
			.click();
		await save(page, 'Show Player Lineup');
		const broadcastBefore = (
			await db.execute(
				'SELECT selected_game_id, control_revision, visibility, publications FROM broadcast_state'
			)
		).rows;
		const rosterBefore = (
			await db.execute('SELECT * FROM tournament_entry_players ORDER BY entry_id, player_id')
		).rows;
		await page.goto(`${match}?tab=games`);
		await page.locator('summary').filter({ hasText: 'Duplicate Game 1' }).click();
		const form = page.getByRole('region', { name: 'Duplicate Game 1', exact: true });
		await expect(form.getByLabel('Copy Agent Select', { exact: true })).not.toBeChecked();
		await expect(
			form.getByRole('combobox', { name: 'Target Game No.', exact: true }).locator('option')
		).toHaveText(['2', '3']);
		await form.getByRole('combobox', { name: 'Target Game No.', exact: true }).selectOption('3');
		await expect(form.getByLabel('New Game label', { exact: true })).toHaveValue('Game 3');
		await form.getByLabel('New Game label', { exact: true }).fill('Retained duplication draft');
		await db.execute({
			sql: 'UPDATE games SET revision = revision + 1 WHERE id = ?',
			args: [gameId]
		});
		await form.getByRole('button', { name: 'Duplicate game', exact: true }).click();
		await expect(form.getByRole('alert')).toContainText('source game changed');
		await expect(form.getByLabel('New Game label', { exact: true })).toHaveValue(
			'Retained duplication draft'
		);
		await expect(form.getByRole('combobox', { name: 'Target Game No.', exact: true })).toHaveValue(
			'3'
		);
		expect(
			(await db.execute({ sql: 'SELECT id FROM games WHERE match_id = ?', args: [matchId] })).rows
		).toHaveLength(1);
		await form.getByRole('button', { name: 'Reload this section', exact: true }).click();
		await expect(form.getByRole('alert')).toHaveCount(0);
		await form.getByLabel('New Game label', { exact: true }).fill('Eligibility draft');
		await db.execute("UPDATE players SET archived_at = 1 WHERE id = 'Alpha-1'");
		await form.getByRole('button', { name: 'Duplicate game', exact: true }).click();
		await expect(form.getByRole('alert')).toContainText('Alpha 1');
		await expect(form.getByLabel('New Game label', { exact: true })).toHaveValue(
			'Eligibility draft'
		);
		expect(
			(await db.execute({ sql: 'SELECT id FROM games WHERE match_id = ?', args: [matchId] })).rows
		).toHaveLength(1);
		await db.execute("UPDATE players SET archived_at = NULL WHERE id = 'Alpha-1'");
		await form.getByRole('button', { name: 'Reload this section', exact: true }).click();
		await expect(form.getByRole('alert')).toHaveCount(0);
		const sourceBefore = (
			await db.execute({ sql: 'SELECT * FROM games WHERE id = ?', args: [gameId] })
		).rows;
		const lineupBefore = (
			await db.execute({
				sql: 'SELECT * FROM game_lineups WHERE game_id = ? ORDER BY entry_id, slot',
				args: [gameId]
			})
		).rows;
		await form.getByRole('button', { name: 'Duplicate game', exact: true }).click();
		await expect(page).toHaveURL(/\/admin\/games\/[^/?]+$/);
		const duplicateId = new URL(page.url()).pathname.split('/').pop()!;
		expect(duplicateId).not.toBe(gameId);
		await expect(page.getByLabel('Game name', { exact: true })).toHaveValue('Game 2');
		await expect(page.getByLabel('Alpha score (Team A)', { exact: true })).toHaveValue('');
		await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toHaveValue('');
		await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
		await expect(page.getByRole('combobox', { name: 'Alpha slot 1', exact: true })).toHaveValue(
			'Alpha-2'
		);
		await expect(page.getByRole('combobox', { name: 'Alpha slot 2', exact: true })).toHaveValue(
			'Alpha-1'
		);
		await expect(page.getByRole('combobox', { name: 'Alpha slot 5', exact: true })).toHaveValue('');
		await page.getByRole('tab', { name: 'Agent Select', exact: true }).click();
		await expect(page.getByRole('combobox', { name: 'Alpha 2 Agent', exact: true })).toHaveValue(
			''
		);
		expect(
			(await db.execute({ sql: 'SELECT * FROM games WHERE id = ?', args: [gameId] })).rows
		).toEqual(sourceBefore);
		expect(
			(
				await db.execute({
					sql: 'SELECT * FROM game_lineups WHERE game_id = ? ORDER BY entry_id, slot',
					args: [gameId]
				})
			).rows
		).toEqual(lineupBefore);
		expect(
			(await db.execute('SELECT * FROM tournament_entry_players ORDER BY entry_id, player_id')).rows
		).toEqual(rosterBefore);
		expect(
			(
				await db.execute(
					'SELECT selected_game_id, control_revision, visibility, publications FROM broadcast_state'
				)
			).rows
		).toEqual(broadcastBefore);
		await page.goto(`${match}?tab=games`);
		await page.locator('summary').filter({ hasText: 'Duplicate Game 1' }).click();
		await form.getByLabel('Copy Agent Select', { exact: true }).check();
		await form.getByRole('button', { name: 'Duplicate game', exact: true }).click();
		await expect(page).toHaveURL(/\/admin\/games\/[^/?]+$/);
		await page.getByRole('tab', { name: 'Agent Select', exact: true }).click();
		await expect(page.getByRole('combobox', { name: 'Alpha 2 Agent', exact: true })).toHaveValue(
			'duplication-agent'
		);
		await page.goto('/admin/graphics/player-lineup');
		await save(page, 'Hide Player Lineup');
		await save(page, 'Clear live selection');
	} finally {
		await db.execute("UPDATE players SET archived_at = NULL WHERE id = 'Alpha-1'");
		db.close();
	}
});
