import { expect } from '@playwright/test';
import { test } from './fixtures';
import {
	createGame,
	createMatch,
	prepareTournament,
	save,
	scores,
	vetoPick
} from './management-helpers';

test('game preparation follows assigned veto maps and sides while unassigned choices remain editable', async ({
	page
}) => {
	test.setTimeout(120_000);
	const tournament = await prepareTournament(page, 'Preparation choices', [1, 2, 3, 4, 5]);
	const match = await createMatch(page, tournament, 'Preparation BO3', 3);
	const first = await createGame(page, match);
	const map = page.getByRole('combobox', { name: 'Map', exact: true });
	const attackers = page.getByRole('combobox', { name: 'Starting attackers', exact: true });
	const defenders = page.getByRole('combobox', { name: 'Starting defenders', exact: true });
	await expect(map.locator('option')).toHaveText([
		'Unknown',
		'Map 1',
		'Map 2',
		'Map 3',
		'Map 4',
		'Map 5'
	]);
	await map.selectOption('map-1');
	await attackers.selectOption({ label: 'Bravo' });
	await defenders.selectOption({ label: 'Alpha' });
	await save(page, 'Save game info');

	await page.getByRole('tab', { name: 'Map Veto', exact: true }).click();
	await vetoPick(page, 1, 1, 1);
	await page
		.getByRole('combobox', { name: 'Action 1 side chooser', exact: true })
		.selectOption({ label: 'Alpha' });
	await page
		.getByRole('combobox', { name: 'Action 1 starting side', exact: true })
		.selectOption('attack');
	await page.getByRole('button', { name: 'Add veto action', exact: true }).click();
	await page.getByRole('combobox', { name: 'Action 2 type', exact: true }).selectOption('ban');
	await page.getByRole('combobox', { name: 'Action 2 map', exact: true }).selectOption('map-5');
	await page.getByRole('button', { name: 'Save match veto', exact: true }).click();
	await page.getByLabel('Apply to affected draft games', { exact: true }).check();
	await save(page, 'Save match veto');
	await page.getByRole('tab', { name: 'Info', exact: true }).click();
	await expect(map.locator('option')).toHaveText(['Map 1']);
	await expect(map).toBeDisabled();
	await expect(attackers).toBeDisabled();
	await expect(defenders).toBeDisabled();
	await expect(attackers.locator('option:checked')).toHaveText('Alpha');
	await expect(defenders.locator('option:checked')).toHaveText('Bravo');
	await page.getByLabel('Game name', { exact: true }).fill('Veto-prepared opener');
	await save(page, 'Save game info');
	await page.reload();
	await expect(page.getByLabel('Game name', { exact: true })).toHaveValue('Veto-prepared opener');
	await expect(map).toHaveValue('map-1');

	const second = await createGame(page, match);
	await expect(map.locator('option')).toHaveText(['Unknown', 'Map 2', 'Map 3', 'Map 4']);
	await expect(map).toBeEnabled();
	await expect(attackers).toBeEnabled();
	await expect(defenders).toBeEnabled();
	await map.selectOption('map-2');
	await attackers.selectOption({ label: 'Bravo' });
	await defenders.selectOption({ label: 'Alpha' });
	await save(page, 'Save game info');

	await page.getByRole('tab', { name: 'Map Veto', exact: true }).click();
	await vetoPick(page, 3, 2, 2);
	await vetoPick(page, 4, 3, 3);
	await page.getByRole('combobox', { name: 'Action 4 type', exact: true }).selectOption('decider');
	await page
		.getByRole('combobox', { name: 'Action 4 side chooser', exact: true })
		.selectOption({ label: 'Alpha' });
	await page
		.getByRole('combobox', { name: 'Action 4 starting side', exact: true })
		.selectOption('defense');
	await save(page, 'Save match veto');
	await page.getByRole('tab', { name: 'Info', exact: true }).click();
	await expect(map.locator('option')).toHaveText(['Map 2']);
	await expect(map).toBeDisabled();
	await expect(attackers).toBeEnabled();
	await expect(defenders).toBeEnabled();
	await expect(attackers.locator('option:checked')).toHaveText('Bravo');
	await expect(defenders.locator('option:checked')).toHaveText('Alpha');

	await createGame(page, match);
	await expect(map.locator('option')).toHaveText(['Map 3']);
	await expect(map).toBeDisabled();
	await expect(attackers).toBeDisabled();
	await expect(defenders).toBeDisabled();
	await expect(attackers.locator('option:checked')).toHaveText('Bravo');
	await expect(defenders.locator('option:checked')).toHaveText('Alpha');
	await page.getByRole('tab', { name: 'Map Veto', exact: true }).click();
	await page.getByRole('button', { name: 'Remove action 4', exact: true }).click();
	await save(page, 'Save match veto');
	await page.getByRole('tab', { name: 'Info', exact: true }).click();
	await expect(map.locator('option')).toHaveText(['Unknown', 'Map 3', 'Map 4']);
	await expect(map).toBeEnabled();
	await expect(attackers).toBeEnabled();
	await expect(defenders).toBeEnabled();
	await map.selectOption('map-4');
	await save(page, 'Save game info');
	await page.goto(first);
	await expect(map).toHaveValue('map-1');
	await page.goto(second);
	await expect(map).toHaveValue('map-2');
});

test('workspace tabs switch immediately and retain drafts across keyboard and history navigation', async ({
	page
}) => {
	await page.goto('/admin/tournaments/tabs-event');
	await page.getByLabel('Tournament name', { exact: true }).fill('Unsaved name');
	await page
		.getByRole('link', { name: 'Teams & Players', exact: true })
		.or(page.getByRole('tab', { name: 'Teams & Players', exact: true }))
		.click();
	await expect(page.getByRole('heading', { name: 'Teams & Players', exact: true })).toBeVisible();
	await expect(page).toHaveURL(/tab=teams/);
	await page.getByRole('tab', { name: 'Teams & Players', exact: true }).press('ArrowRight');
	await expect(page.getByRole('tabpanel', { name: 'Map Pool' })).toBeVisible();
	await page.goBack();
	await expect(page.getByRole('heading', { name: 'Teams & Players', exact: true })).toBeVisible();
	await page.goBack();
	await expect(page.getByLabel('Tournament name', { exact: true })).toHaveValue('Unsaved name');
	page.once('dialog', (dialog) => dialog.accept());
	await page.reload();
	await expect(page.getByLabel('Tournament name', { exact: true })).toHaveValue('Navigation event');
	await page.goto('/admin/tournaments/tabs-event?tab=maps');
	await expect(page.getByRole('tabpanel', { name: 'Map Pool' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('tab', { name: 'Map Pool', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await page.goto('/admin/tournaments/tabs-event?tab=invalid');
	await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
});

test('prepares independent tournaments, historical lineups, BO2 corrections and shared BO5 vetoes', async ({
	page
}) => {
	test.setTimeout(180_000);
	page.on('dialog', (dialog) => dialog.accept());
	const first = await prepareTournament(page, 'First event', [1, 2]);
	const bo2 = await createMatch(page, first, 'BO2 final', 2);
	const one = await createGame(page, bo2);
	await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-1');
	await save(page, 'Save game info');
	await scores(page, '13', '5');
	const two = await createGame(page, bo2);
	await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-2');
	await save(page, 'Save game info');
	await scores(page, '13', '6');
	await expect(page.getByLabel('Series result')).toHaveText('Series: 2–0 · completed');
	await scores(page, '7', '13', 'Correct result');
	await expect(page.getByLabel('Series result')).toHaveText('Series: 1–1 · draw');
	await save(page, 'Reopen game');
	await expect(page.getByLabel('Series result')).toHaveText('Series: 1–0 · incomplete');
	await scores(page, '7', '13');
	await page.goto(bo2);
	await save(page, 'Set match-wide outcome');
	await expect(page.getByText(/Match-wide forfeit.*Alpha wins/)).toBeVisible();
	await page.goto(two);
	await expect(page.getByRole('button', { name: 'Correct result', exact: true })).toBeDisabled();
	await page.goto(bo2);
	await save(page, 'Clear match-wide outcome');
	await expect(page.getByText('Series drawn.', { exact: true })).toBeVisible();

	const second = await prepareTournament(page, 'Second event', [3, 4, 5, 6, 7]);
	const bo5 = await createMatch(page, second, 'BO5 final', 5);
	await page.getByRole('tab', { name: 'Map Veto', exact: true }).click();
	await vetoPick(page, 1, 3, 1);
	await vetoPick(page, 2, 4, 2);
	await save(page, 'Save match veto');
	const game = await createGame(page, bo5);
	await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toHaveValue('map-3');
	await page.goto(`${bo5}?tab=games`);
	await expect(page.locator('a[href^="/admin/games/"]')).toHaveCount(1);
	await page.goto(`${game}?tab=lineup`);
	await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-1');
	await save(page, 'Save lineup');
	await expect(page.getByRole('region', { name: 'Alpha lineup' })).toContainText(
		'1/5 selected · Incomplete draft'
	);
	for (const team of ['Alpha', 'Bravo'])
		for (let slot = 1; slot <= 5; slot++)
			await page
				.getByRole('combobox', { name: `${team} slot ${slot}`, exact: true })
				.selectOption(`${team}-${slot}`);
	await save(page, 'Save lineup');
	await expect(page.getByRole('region', { name: 'Alpha lineup' })).toContainText(
		'5/5 selected · Ready'
	);
	await scores(page, '8', '3', 'Save draft scores');
	await page
		.getByRole('combobox', { name: 'Starting attackers', exact: true })
		.selectOption({ label: 'Bravo' });
	await page
		.getByRole('combobox', { name: 'Starting defenders', exact: true })
		.selectOption({ label: 'Alpha' });
	await save(page, 'Save game info');
	await expect(page.getByLabel('Alpha score (Team A)', { exact: true })).toHaveValue('8');
	await expect(page.getByLabel('Bravo score (Team B)', { exact: true })).toHaveValue('3');
	const later = await createGame(page, bo5);
	await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
	for (const team of ['Alpha', 'Bravo'])
		for (let slot = 1; slot <= 5; slot++)
			await page
				.getByRole('combobox', { name: `${team} slot ${slot}`, exact: true })
				.selectOption(`${team}-${slot === 5 ? 6 : slot}`);
	await save(page, 'Save lineup');
	await page.goto(`${second}?tab=teams`);
	const roster = page.getByRole('region', { name: 'Alpha roster', exact: true });
	await roster.getByRole('button', { name: 'Remove Alpha 5 (Alpha-5)', exact: true }).click();
	await roster.getByRole('button', { name: 'Save roster', exact: true }).click();
	await expect(roster.getByRole('status')).toHaveText('Saved.');
	await page.goto(`${game}?tab=lineup`);
	await expect(page.getByRole('combobox', { name: 'Alpha slot 5', exact: true })).toHaveValue(
		'Alpha-5'
	);
	await expect(page.getByText('No longer on current roster', { exact: true })).toBeVisible();

	await page.getByRole('tab', { name: 'Map Veto', exact: true }).click();
	await page.getByRole('combobox', { name: 'Action 1 map', exact: true }).selectOption('map-5');
	await page.getByRole('button', { name: 'Save match veto', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Veto conflict preview' })).toContainText('Map 5');
	await page.getByLabel('Apply to affected draft games', { exact: true }).check();
	await page.getByRole('combobox', { name: 'Action 1 map', exact: true }).selectOption('map-6');
	await expect(page.getByRole('region', { name: 'Veto conflict preview' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Save match veto', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Veto conflict preview' })).toContainText('Map 6');
	await expect(page.getByLabel('Apply to affected draft games', { exact: true })).not.toBeChecked();
	await page.getByRole('combobox', { name: 'Action 1 map', exact: true }).selectOption('map-5');
	await page.getByRole('button', { name: 'Save match veto', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Veto conflict preview' })).toContainText('Map 5');
	await page.getByLabel('Apply to affected draft games', { exact: true }).check();
	await save(page, 'Save match veto');
	await page.getByRole('tab', { name: 'Info', exact: true }).click();
	await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toHaveValue('map-5');
	await scores(page, '13', '3');
	await page.getByRole('tab', { name: 'Map Veto', exact: true }).click();
	await page.getByRole('combobox', { name: 'Action 1 map', exact: true }).selectOption('map-6');
	await page.getByRole('button', { name: 'Save match veto', exact: true }).click();
	await expect(
		page.getByText('Reopen this game before applying veto changes.', { exact: true })
	).toBeVisible();
	await expect(page.getByLabel('Apply to affected draft games', { exact: true })).toHaveCount(0);
	await page.goto(`${later}?tab=veto`);
	await expect(page.getByRole('combobox', { name: 'Action 1 map', exact: true })).toHaveValue(
		'map-5'
	);
	await page.goto(`${first}?tab=maps`);
	await expect(page.getByRole('checkbox', { name: 'Map 1', exact: true })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Map 3', exact: true })).not.toBeChecked();
	await page.goto(one);
	await expect(page.getByLabel('Alpha score (Team A)', { exact: true })).toHaveValue('13');
});
