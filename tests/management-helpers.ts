import { expect, type Page } from '@playwright/test';

export async function save(page: Page, name: string) {
	const button = page.getByRole('button', { name, exact: true });
	const action = await button.locator('xpath=ancestor::form').getAttribute('action');
	const form = page.locator(`form[action=${JSON.stringify(action)}]`);
	const response = page.waitForResponse((response) => response.request().method() === 'POST');
	await button.click();
	const result = await response;
	expect(result.ok()).toBe(true);
	expect((await result.json()).type).toBe('success');
	// Successful outcomes can rename the button or replace the completed command.
	await expect
		.poll(
			async () =>
				!(await form.count()) ||
				(await form.getByRole('status').allTextContents()).includes('Saved.')
		)
		.toBe(true);
}

export async function prepareTournament(page: Page, name: string, mapNumbers: number[]) {
	await page.goto('/admin/tournaments?new=1');
	await page.getByLabel('Tournament name', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/tournaments\/[^/?]+$/);
	const path = new URL(page.url()).pathname;
	await page.getByRole('tab', { name: 'Map Pool', exact: true }).click();
	for (const number of mapNumbers)
		await page.getByRole('checkbox', { name: `Map ${number}`, exact: true }).check();
	await save(page, 'Save map pool');
	await page.getByRole('tab', { name: 'Teams & Players', exact: true }).click();
	for (const team of ['Alpha', 'Bravo', 'Charlie']) {
		await page
			.getByRole('combobox', { name: 'Participating team', exact: true })
			.selectOption(team);
		await save(page, 'Add team entry');
		const roster = page.getByRole('region', { name: `${team} roster`, exact: true });
		for (let i = 1; i <= 6; i++) {
			await roster
				.getByRole('combobox', { name: 'Search players', exact: true })
				.fill(`${team}-${i}`);
			await roster
				.getByRole('option')
				.filter({ hasText: `${team}-${i}` })
				.click();
		}
		await roster.getByRole('combobox', { name: 'Search players', exact: true }).press('Escape');
		const response = page.waitForResponse((response) => response.request().method() === 'POST');
		await roster.getByRole('button', { name: 'Save roster', exact: true }).click();
		expect((await response).ok()).toBe(true);
		await expect(roster.getByRole('status')).toHaveText('Saved.');
	}
	return path;
}

export async function createMatch(page: Page, tournament: string, label: string, bestOf: number) {
	await page.goto(`${tournament}?tab=matches`);
	await page
		.getByRole('combobox', { name: 'Team A', exact: true })
		.selectOption({ label: 'Alpha' });
	await page
		.getByRole('combobox', { name: 'Team B', exact: true })
		.selectOption({ label: 'Bravo' });
	await page.getByLabel('Label', { exact: true }).fill(label);
	await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption(String(bestOf));
	await page.getByRole('button', { name: 'Create match', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/matches\/[^/?]+$/);
	return new URL(page.url()).pathname;
}

export async function createGame(page: Page, match: string) {
	await page.goto(`${match}?tab=games`);
	await page.getByRole('button', { name: 'Create game', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/games\/[^/?]+$/);
	return new URL(page.url()).pathname;
}

export async function scores(page: Page, a: string, b: string, command = 'Finalize result') {
	await page.getByRole('tab', { name: 'Info', exact: true }).click();
	await page.getByLabel('Alpha score (Team A)', { exact: true }).fill(a);
	await page.getByLabel('Bravo score (Team B)', { exact: true }).fill(b);
	await save(page, command);
}

export async function vetoPick(page: Page, index: number, map: number, game: number) {
	await page.getByRole('button', { name: 'Add veto action', exact: true }).click();
	await page
		.getByRole('combobox', { name: `Action ${index} map`, exact: true })
		.selectOption(`map-${map}`);
	await page
		.getByRole('combobox', { name: `Action ${index} acting team`, exact: true })
		.selectOption({ label: 'Alpha' });
	await page
		.getByRole('combobox', { name: `Action ${index} game`, exact: true })
		.selectOption({ label: `Game ${game}` });
}
