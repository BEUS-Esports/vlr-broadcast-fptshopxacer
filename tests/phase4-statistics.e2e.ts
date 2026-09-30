import { expect, test } from '@playwright/test';
import { createGame, createMatch, prepareTournament, save, scores } from './management-helpers';

test('manual statistics, derived scopes, MVPs, and stale drafts survive navigation', async ({
	page,
	browser
}) => {
	test.setTimeout(180_000);
	page.on('dialog', (dialog) => dialog.accept());
	const tournament = await prepareTournament(page, 'Manual statistics event', [1]);
	const match = await createMatch(page, tournament, 'Manual final', 1);
	const game = await createGame(page, match);
	await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-1');
	await save(page, 'Save game info');
	await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
	await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-1');
	await page.getByRole('combobox', { name: 'Bravo slot 1', exact: true }).selectOption('Bravo-1');
	await save(page, 'Save lineup');
	await page.getByRole('tab', { name: 'Post-Game', exact: true }).click();
	await page.getByRole('textbox', { name: 'Alpha 1 Kills' }).fill('0');
	await page.getByRole('textbox', { name: 'Alpha 1 Performance Score' }).fill('200');
	await page.getByRole('textbox', { name: 'Alpha 1 Trades' }).fill('0');
	await page.getByRole('textbox', { name: 'Bravo 1 Kills' }).fill('5');
	await save(page, 'Save post-game statistics');
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Alpha 1 Kills' })).toHaveValue('0');
	await expect(page.getByRole('textbox', { name: 'Alpha 1 Deaths' })).toHaveValue('');
	await page
		.getByRole('region', { name: 'Game MVP' })
		.getByRole('combobox', { name: 'Player' })
		.selectOption({ label: 'Alpha 1' });
	await save(page, 'Save Game MVP');
	await scores(page, '13', '8');

	await page.goto(`${match}?tab=statistics`);
	const matchRow = page.getByRole('row', { name: /Alpha 1/ });
	await expect(matchRow.getByRole('cell').nth(2)).toContainText('0');
	await expect(matchRow.getByRole('cell').nth(2)).toContainText('complete coverage');
	await expect(matchRow.getByRole('cell').nth(3)).toContainText('Unavailable');
	await page
		.getByRole('region', { name: 'Match MVP' })
		.getByRole('combobox', { name: 'Player' })
		.selectOption({ label: 'Alpha 1' });
	await save(page, 'Save Match MVP');
	await page.goto(`${tournament}?tab=statistics`);
	await expect(
		page
			.getByRole('row', { name: /Alpha 1/ })
			.getByRole('cell')
			.nth(2)
	).toContainText('0');
	await page
		.getByRole('region', { name: 'Tournament MVP' })
		.getByRole('combobox', { name: 'Player' })
		.selectOption({ label: 'Alpha 1' });
	await save(page, 'Save Tournament MVP');

	const context = await browser.newContext();
	const other = await context.newPage();
	other.on('dialog', (dialog) => dialog.accept());
	try {
		await other.goto(`${game}?tab=statistics`);
		await other.getByRole('textbox', { name: 'Alpha 1 Kills' }).fill('4');
		await page.goto(`${game}?tab=statistics`);
		await page.getByRole('textbox', { name: 'Alpha 1 Kills' }).fill('3');
		await save(page, 'Save post-game statistics');
		const response = other.waitForResponse((response) => response.request().method() === 'POST');
		await other.getByRole('button', { name: 'Save post-game statistics' }).click();
		expect((await response).status()).toBe(409);
		await expect(other.getByRole('textbox', { name: 'Alpha 1 Kills' })).toHaveValue('4');
		await other.getByRole('button', { name: 'Reload this section' }).click();
		await expect(other.getByRole('textbox', { name: 'Alpha 1 Kills' })).toHaveValue('3');
		await expect(
			other.getByRole('region', { name: 'Game MVP' }).getByRole('combobox', { name: 'Player' })
		).toHaveValue(
			await page
				.getByRole('region', { name: 'Game MVP' })
				.getByRole('combobox', { name: 'Player' })
				.inputValue()
		);
	} finally {
		await context.close();
	}
	await page.goto(`${match}?tab=statistics`);
	await expect(
		page
			.getByRole('row', { name: /Alpha 1/ })
			.getByRole('cell')
			.nth(2)
	).toContainText('3');
	await page.goto(`${tournament}?tab=statistics`);
	await expect(
		page
			.getByRole('row', { name: /Alpha 1/ })
			.getByRole('cell')
			.nth(2)
	).toContainText('3');
});

test('substitutes count only their played games and reopening removes contributions', async ({
	page
}) => {
	test.setTimeout(180_000);
	page.on('dialog', (dialog) => dialog.accept());
	const tournament = await prepareTournament(page, 'Substitute statistics event', [1, 2]);
	const match = await createMatch(page, tournament, 'Drawn BO2', 2);
	const first = await createGame(page, match);
	await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-1');
	await save(page, 'Save game info');
	await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
	await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-1');
	await page.getByRole('combobox', { name: 'Bravo slot 1', exact: true }).selectOption('Bravo-1');
	await save(page, 'Save lineup');
	await page.getByRole('tab', { name: 'Post-Game', exact: true }).click();
	await page.getByRole('textbox', { name: 'Alpha 1 Kills' }).fill('2');
	await page.getByRole('textbox', { name: 'Bravo 1 Kills' }).fill('1');
	await save(page, 'Save post-game statistics');
	await scores(page, '13', '5');

	const second = await createGame(page, match);
	await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-2');
	await save(page, 'Save game info');
	await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
	await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-6');
	await page.getByRole('combobox', { name: 'Bravo slot 1', exact: true }).selectOption('Bravo-1');
	await save(page, 'Save lineup');
	await page.getByRole('tab', { name: 'Post-Game', exact: true }).click();
	await page.getByRole('textbox', { name: 'Alpha 6 Kills' }).fill('0');
	await save(page, 'Save post-game statistics');
	await scores(page, '8', '13');
	await page.goto(`${match}?tab=statistics`);
	const row = (name: string) => page.getByRole('row', { name: new RegExp(name) });
	await expect(row('Alpha 1').getByRole('cell').nth(1)).toHaveText('1 / 1');
	await expect(row('Alpha 6').getByRole('cell').nth(1)).toHaveText('1 / 1');
	await expect(row('Alpha 6').getByRole('cell').nth(2)).toContainText('0');
	await expect(row('Bravo 1').getByRole('cell').nth(2)).toContainText('partial coverage');
	await page.goto(second);
	await save(page, 'Reopen game');
	await page.getByRole('tab', { name: 'Post-Game', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Alpha 6 Kills' })).toHaveValue('0');
	await page.goto(`${match}?tab=statistics`);
	await expect(row('Alpha 6')).toHaveCount(0);
	await expect(row('Bravo 1').getByRole('cell').nth(2)).toContainText('complete coverage');
	await page.goto(first);
	await expect(page.getByLabel('Series result')).toContainText('incomplete');
});
