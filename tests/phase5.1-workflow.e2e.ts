import { expect, test } from '@playwright/test';
import { graphicIds, graphicLabels } from '../src/lib/broadcast/controls';
import { createClient } from '@libsql/client';
import { createGame, createMatch, prepareTournament, save, vetoPick } from './management-helpers';

test('each graphics control route shares setup and a visibility-independent preview', async ({
	page
}) => {
	await page.goto('/admin/graphics');
	await expect(page.getByRole('heading', { name: 'Global Settings', exact: true })).toBeVisible();
	const sidebar = page.getByRole('navigation', { name: 'Management', exact: true });
	await expect(sidebar.getByRole('link')).toHaveText([
		'Dashboard',
		'Settings',
		'Teams',
		'Players',
		'Game Resources',
		'Tournaments',
		'Global Settings',
		...graphicIds.map((id) => graphicLabels[id])
	]);
	await expect(sidebar.getByRole('link', { name: 'Global Settings', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	for (const graphic of graphicIds) {
		await sidebar.getByRole('link', { name: graphicLabels[graphic], exact: true }).click();
		await expect(page).toHaveURL(`/admin/graphics/${graphic}`);
		await expect(sidebar.locator('a[aria-current="page"]')).toHaveText(graphicLabels[graphic]);
		await expect(
			page.getByRole('heading', { name: graphicLabels[graphic], exact: true }).first()
		).toBeVisible();
		await expect(page.getByRole('region', { name: 'Global Setup', exact: true })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Graphics controls' })).toHaveCount(0);
		const preview = page.getByRole('region', { name: 'Preview', exact: true });
		await expect(preview.locator('[data-graphic]')).toHaveAttribute('data-graphic', graphic);
		const launch = preview.getByRole('button', { name: 'Large Preview', exact: true });
		await launch.click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByRole('dialog').locator('[data-graphic]')).toHaveAttribute(
			'data-graphic',
			graphic
		);
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).not.toBeVisible();
		await expect(launch).toBeFocused();
	}
	await page.goBack();
	await expect(page).toHaveURL('/admin/graphics/post-game');
	await page.goForward();
	await expect(page).toHaveURL('/admin/graphics/mvp');
	expect((await page.goto('/admin/graphics/unknown'))?.status()).toBe(404);
});

test('inline saved editing updates preview while shared program captures hold and dirty context stays bound', async ({
	page,
	browser,
	request
}) => {
	test.setTimeout(180_000);
	const tournament = await prepareTournament(page, 'Phase 5.1 workflow', [1, 2]);
	const match = await createMatch(page, tournament, 'Workflow match', 3);
	const game = await createGame(page, match);
	const nextGame = await createGame(page, match);
	const tournamentId = tournament.split('/').pop()!;
	const matchId = match.split('/').pop()!;
	const gameId = game.split('/').pop()!;
	const nextGameId = nextGame.split('/').pop()!;
	const db = createClient({ url: process.env.DATABASE_URL! });
	const other = await browser.newPage();
	const output = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	const output2 = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	try {
		await db.execute(
			"INSERT INTO agents (id, key, display_name, is_active) VALUES ('workflow-agent', 'workflow-agent', 'Workflow agent', 1)"
		);
		await page.goto('/admin/graphics');
		await page
			.getByRole('combobox', { name: 'Tournament', exact: true })
			.selectOption(tournamentId);
		await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption(matchId);
		await expect(page.getByRole('button', { name: 'Take game live', exact: true })).toBeDisabled();
		await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption(gameId);
		await save(page, 'Take game live');
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Player Lineup', exact: true })
			.click();
		for (const team of ['Alpha', 'Bravo'])
			for (let slot = 1; slot <= 5; slot++) {
				await page
					.getByRole('combobox', { name: `${team} slot ${slot}`, exact: true })
					.selectOption(`${team}-${slot}`);
			}
		await save(page, 'Save lineup');
		await other.goto(`${game}?tab=lineup`);
		await expect(other.getByRole('combobox', { name: 'Alpha slot 1', exact: true })).toHaveValue(
			'Alpha-1'
		);
		await save(page, 'Show Player Lineup');
		await output.goto('/gfx/live/player-lineup');
		const program = output.locator('[data-graphic]');
		const preview = page
			.getByRole('region', { name: 'Preview', exact: true })
			.locator('[data-graphic]');
		await expect(program.getByText('Alpha 1', { exact: true })).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Tournament', exact: true })).toBeDisabled();
		await expect(
			page.getByRole('button', { name: 'Clear live selection', exact: true })
		).toBeDisabled();
		const revision = Number(
			(await db.execute('SELECT control_revision FROM broadcast_state')).rows[0].control_revision
		);
		const rejected = await request.post('/admin/graphics?/select', {
			headers: { origin: 'http://localhost:4173' },
			form: {
				payload: JSON.stringify({
					expectedRevision: revision,
					tournamentId,
					matchId,
					gameId: nextGameId
				})
			}
		});
		expect(rejected.ok()).toBe(false);
		expect(
			(await db.execute('SELECT selected_game_id FROM broadcast_state')).rows[0].selected_game_id
		).toBe(gameId);
		await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-6');
		await save(page, 'Save lineup');
		await expect(preview.getByText('Alpha 6', { exact: true })).toBeVisible();
		await expect(program.getByText('Alpha 1', { exact: true })).toBeVisible();
		await expect(page.getByRole('region', { name: 'Program controls' })).toContainText(
			'newer saved data'
		);
		await output2.goto('/gfx/live/player-lineup');
		await output.reload();
		await expect(
			output.locator('[data-graphic]').getByText('Alpha 1', { exact: true })
		).toBeVisible();
		await expect(output2.getByText('Alpha 1', { exact: true })).toBeVisible();
		const captureBefore = (await db.execute('SELECT publications FROM broadcast_state')).rows[0]
			.publications;
		const repeatRevision = Number(
			(await db.execute('SELECT control_revision FROM broadcast_state')).rows[0].control_revision
		);
		const repeated = await request.post('/admin/graphics?/controls', {
			headers: { origin: 'http://localhost:4173' },
			form: {
				payload: JSON.stringify({
					expectedRevision: repeatRevision,
					visibility: { 'player-lineup': true }
				})
			}
		});
		expect(repeated.ok()).toBe(true);
		expect(
			(await db.execute('SELECT publications FROM broadcast_state')).rows[0].publications
		).toBe(captureBefore);
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Map Veto', exact: true })
			.click();
		await vetoPick(page, 1, 1, 1);
		const vetoReview = page.waitForResponse((response) => response.request().method() === 'POST');
		await page.getByRole('button', { name: 'Save match veto', exact: true }).click();
		expect((await vetoReview).status()).toBe(409);
		await page
			.getByRole('checkbox', { name: 'Apply to affected draft games', exact: true })
			.check();
		await save(page, 'Save match veto');
		await other.goto(`${match}?tab=veto`);
		await expect(other.getByRole('combobox', { name: 'Action 1 map', exact: true })).toHaveValue(
			'map-1'
		);
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Agent Select', exact: true })
			.click();
		await page
			.getByRole('combobox', { name: 'Alpha 6 Agent', exact: true })
			.selectOption('workflow-agent');
		await save(page, 'Save agent selections');
		await save(page, 'Show Agent Select');
		await output2.goto('/gfx/live/agent-select');
		await expect(output2.getByText('Alpha 6', { exact: true })).toBeVisible();
		await expect(output2.getByText('Workflow agent', { exact: true })).toBeVisible();
		await expect(output.getByText('Alpha 1', { exact: true })).toBeVisible();
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Post-Game', exact: true })
			.click();
		await expect(page.getByRole('combobox', { name: 'Alpha 6 Agent', exact: true })).toHaveCount(0);
		await expect(page.getByRole('region', { name: 'Saved post-game report' })).toContainText(
			'Workflow agent'
		);
		await page.getByRole('textbox', { name: 'Alpha 6 Kills', exact: true }).fill('0');
		await save(page, 'Save post-game statistics');
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Agent Select', exact: true })
			.click();
		await expect(page.getByRole('combobox', { name: 'Alpha 6 Agent', exact: true })).toHaveValue(
			'workflow-agent'
		);
		await save(page, 'Hide Agent Select');
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Player Lineup', exact: true })
			.click();
		await save(page, 'Hide Player Lineup');
		await expect(output.locator('[data-graphic] > div')).toHaveCount(0);
		await expect(
			page
				.getByRole('region', { name: 'Preview', exact: true })
				.getByText('Alpha 6', { exact: true })
		).toBeVisible();
		await save(page, 'Show Player Lineup');
		await expect(output.getByText('Alpha 6', { exact: true })).toBeVisible();
		await save(page, 'Hide Player Lineup');
		await page.getByRole('button', { name: 'Alpha slot 1 Move Down', exact: true }).click();
		await other.goto('/admin/graphics');
		await other.getByRole('combobox', { name: 'Game', exact: true }).selectOption(nextGameId);
		await save(other, 'Take game live');
		await expect(page.getByRole('region', { name: 'Retained preparation draft' })).toContainText(
			'Game 1'
		);
		await expect(page.getByRole('combobox', { name: 'Alpha slot 1', exact: true })).toHaveValue(
			'Alpha-2'
		);
		await expect(
			page.getByRole('button', { name: 'Save lineup' }).locator('xpath=ancestor::form')
		).toHaveAttribute('action', `${game}?/lineup`);
		await save(page, 'Save lineup');
		expect(
			(
				await db.execute({
					sql: 'SELECT player_id FROM game_lineups WHERE game_id = ? AND slot = 1 AND player_id LIKE ?',
					args: [gameId, 'Alpha%']
				})
			).rows[0].player_id
		).toBe('Alpha-2');
		expect(
			(
				await db.execute({
					sql: 'SELECT * FROM game_lineups WHERE game_id = ?',
					args: [nextGameId]
				})
			).rows
		).toHaveLength(0);
		await expect(page.getByRole('combobox', { name: 'Alpha slot 1', exact: true })).toHaveValue('');
		await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-6');
		page.once('dialog', (dialog) => dialog.dismiss());
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Player Stats', exact: true })
			.click();
		await expect(page).toHaveURL('/admin/graphics/player-lineup');
		page.once('dialog', (dialog) => dialog.accept());
		await page
			.getByRole('navigation', { name: 'Management' })
			.getByRole('link', { name: 'Player Stats', exact: true })
			.click();
		await expect(page).toHaveURL('/admin/graphics/player-stats');
		await save(page, 'Clear live selection');
	} finally {
		db.close();
		await other.close();
		await output.close();
		await output2.close();
	}
});
