import { expect } from '@playwright/test';
import { test } from './fixtures';
import { createClient } from '@libsql/client';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

test('live context changes preserve preparation on cancellation and failure, then discard on success', async ({
	page
}) => {
	test.setTimeout(120_000);
	const tournament = await prepareTournament(page, 'Context change event', [1]);
	const match = await createMatch(page, tournament, 'Context change match', 3);
	const game = await createGame(page, match);
	const nextGame = await createGame(page, match);
	const db = createClient({ url: process.env.DATABASE_URL! });
	try {
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
		await page.goto('/admin/graphics/player-lineup');
		const slot = page.getByRole('combobox', { name: 'Alpha slot 1', exact: true });
		await slot.selectOption('Alpha-1');
		const lineup = page
			.getByRole('button', { name: 'Save lineup', exact: true })
			.locator('xpath=ancestor::form');
		const originalDraft = await lineup.locator('input[name="payload"]').inputValue();
		await page
			.getByRole('combobox', { name: 'Game', exact: true })
			.selectOption(nextGame.split('/').pop()!);
		page.once('dialog', (dialog) => dialog.dismiss());
		await page.getByRole('button', { name: 'Take game live', exact: true }).click();
		await expect(slot).toHaveValue('Alpha-1');
		expect(await lineup.locator('input[name="payload"]').inputValue()).toBe(originalDraft);

		await page.route('**/admin/graphics?/select', async (route) => {
			await db.execute('UPDATE broadcast_state SET control_revision = control_revision + 1');
			await route.continue();
		});
		page.once('dialog', (dialog) => dialog.accept());
		const rejected = page.waitForResponse((response) => response.request().method() === 'POST');
		await page.getByRole('button', { name: 'Take game live', exact: true }).click();
		expect((await rejected).status()).toBe(409);
		await expect(page.getByRole('alert')).toContainText('Reload before saving');
		await expect(slot).toHaveValue('Alpha-1');
		expect(await lineup.locator('input[name="payload"]').inputValue()).toBe(originalDraft);
		expect(
			(await db.execute('SELECT selected_game_id FROM broadcast_state')).rows[0].selected_game_id
		).toBe(game.split('/').pop()!);
		await page.unroute('**/admin/graphics?/select');
		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Reload this section', exact: true }).click();
		await expect(
			page.getByRole('button', { name: 'Reload this section', exact: true })
		).toHaveCount(0);
		await page
			.getByRole('combobox', { name: 'Game', exact: true })
			.selectOption(nextGame.split('/').pop()!);
		page.once('dialog', (dialog) => dialog.accept());
		await save(page, 'Take game live');
		await expect(slot).toHaveValue('');
		await expect(lineup).toHaveAttribute('action', `${nextGame}?/lineup`);

		await slot.selectOption('Alpha-2');
		const nextDraft = await lineup.locator('input[name="payload"]').inputValue();
		await page.route('**/admin/graphics?/clear', (route) => route.abort('failed'));
		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Clear live selection', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText(
			'Could not save. Your draft is still here.'
		);
		await expect(slot).toHaveValue('Alpha-2');
		expect(await lineup.locator('input[name="payload"]').inputValue()).toBe(nextDraft);
		await page.unroute('**/admin/graphics?/clear');
		page.once('dialog', (dialog) => dialog.accept());
		await save(page, 'Clear live selection');
		await expect(page.getByRole('region', { name: 'On air', exact: true })).toContainText(
			'No game selected'
		);
		await expect(slot).toHaveCount(0);
	} finally {
		db.close();
	}
});

test('Swap Left/Right submits only screen positions and leaves the attacker draft unsaved', async ({
	page
}) => {
	test.setTimeout(120_000);
	const tournament = await prepareTournament(page, 'Independent controls event', [1]);
	const match = await createMatch(page, tournament, 'Independent controls match', 3);
	const game = await createGame(page, match);
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
	const attackers = page.getByRole('combobox', { name: 'Current attackers', exact: true });
	await attackers.selectOption({ label: 'Alpha' });
	const pendingAttackers = await attackers.inputValue();
	const swap = page.waitForRequest((request) => request.method() === 'POST');
	await save(page, 'Swap Left/Right');
	const payload = JSON.parse(new URLSearchParams((await swap).postData()!).get('payload')!);
	expect(payload).toEqual({ expectedRevision: expect.any(Number), swapped: true });
	const onAir = page.getByRole('region', { name: 'On air', exact: true });
	await expect(onAir).toContainText('Left: Bravo');
	await expect(onAir).toContainText('Attackers: Unknown');
	await expect(attackers).toHaveValue(pendingAttackers);
	const rejected = page.waitForResponse((response) => response.request().method() === 'POST');
	await page.getByRole('button', { name: 'Save presentation', exact: true }).click();
	expect((await rejected).status()).toBe(409);
	await expect(attackers).toHaveValue(pendingAttackers);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Reload this section', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Reload this section', exact: true })).toHaveCount(
		0
	);
	await expect(attackers).toHaveValue('');
	await attackers.selectOption({ label: 'Alpha' });
	await save(page, 'Save presentation');
	await expect(onAir).toContainText('Attackers: Alpha');
	await expect(onAir).toContainText('Left: Bravo');
	await save(page, 'Swap Left/Right');
	await expect(onAir).toContainText('Left: Alpha');
	await expect(onAir).toContainText('Attackers: Alpha');
	await save(page, 'Clear live selection');
});
