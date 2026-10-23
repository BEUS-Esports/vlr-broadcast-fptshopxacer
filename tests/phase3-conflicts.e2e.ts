import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import {
	createGame,
	createMatch,
	prepareTournament,
	save,
	scores,
	vetoPick
} from './management-helpers';

async function payload(page: Page, action: string) {
	return JSON.parse(
		await page.locator(`form[action="?/${action}"] input[name="payload"]`).inputValue()
	);
}

async function staleSave(page: Page, button: string, action: string) {
	const draft = await payload(page, action);
	const response = page.waitForResponse((response) => response.request().method() === 'POST');
	await page.getByRole('button', { name: button, exact: true }).click();
	expect((await response).status()).toBe(409);
	await expect(page.getByRole('alert')).toContainText(/changed|operator/);
	expect(await payload(page, action)).toEqual(draft);
}

test('named actions reject malformed JSON types before changing stored records', async ({
	request
}) => {
	for (const [action, draft] of [
		['save', { expectedRevision: true, name: 'Invalid rename', slug: 'invalid-rename' }],
		['archive', { expectedRevision: 1, archived: 'false' }],
		['mapPool', { expectedRevision: 1, mapIds: [false] }],
		['save', { expectedRevision: 1, name: {}, slug: [] }]
	] as const) {
		const response = await request.post(`/admin/tournaments/tabs-event?/${action}`, {
			headers: { origin: 'http://localhost:4173', 'x-sveltekit-action': 'true' },
			form: { payload: JSON.stringify(draft) }
		});
		expect(response.status()).toBe(400);
	}
});

test('saving a sibling section keeps a dirty section and its original revision', async ({
	page
}) => {
	await page.goto('/admin/tournaments?new=1');
	await page
		.getByRole('textbox', { name: 'Tournament name', exact: true })
		.fill('Draft retention event');
	await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/tournaments\/[^/?]+$/);
	await page.getByRole('textbox', { name: 'Tournament name', exact: true }).fill('Unsaved details');
	const original = await payload(page, 'save');
	await page.getByRole('tab', { name: 'Map Pool', exact: true }).click();
	await page.getByRole('checkbox', { name: 'Map 1', exact: true }).check();
	await save(page, 'Save map pool');
	await page.getByRole('tab', { name: 'Overview', exact: true }).click();
	expect(await payload(page, 'save')).toEqual(original);
	await staleSave(page, 'Save details', 'save');
	const url = page.url();
	page.once('dialog', (dialog) => dialog.dismiss());
	await page.getByRole('link', { name: '← Tournaments', exact: true }).click();
	await expect(page).toHaveURL(url);
	await expect(page.getByRole('textbox', { name: 'Tournament name', exact: true })).toHaveValue(
		'Unsaved details'
	);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Reload this section', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Tournament name', exact: true })).toHaveValue(
		'Draft retention event'
	);
});

test('two operators retain losing map, lineup, ordered veto and result drafts until explicit reload', async ({
	page,
	browser
}) => {
	test.setTimeout(180_000);
	page.on('dialog', (dialog) => dialog.accept());
	const event = await prepareTournament(page, 'Conflict event', [1, 2, 3, 4, 5, 6, 7]);
	const context = await browser.newContext();
	const other = await context.newPage();
	other.on('dialog', (dialog) => dialog.accept());
	try {
		await page.goto(`${event}?tab=maps`);
		await other.goto(`${page.url()}`);
		await other.getByRole('checkbox', { name: 'Map 7', exact: true }).uncheck();
		await page.getByRole('checkbox', { name: 'Map 6', exact: true }).uncheck();
		await save(page, 'Save map pool');
		await staleSave(other, 'Save map pool', 'mapPool');
		await expect(other.getByRole('checkbox', { name: 'Map 6', exact: true })).toBeChecked();
		await expect(other.getByRole('checkbox', { name: 'Map 7', exact: true })).not.toBeChecked();
		await other.getByRole('button', { name: 'Reload this section', exact: true }).click();
		await expect(other.getByRole('checkbox', { name: 'Map 6', exact: true })).not.toBeChecked();
		await expect(other.getByRole('checkbox', { name: 'Map 7', exact: true })).toBeChecked();

		const match = await createMatch(page, event, 'Conflict match', 3);
		const game = await createGame(page, match);
		await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('map-1');
		await save(page, 'Save game info');
		await page.getByRole('tab', { name: 'Lineup', exact: true }).click();
		await other.goto(page.url());
		await other
			.getByRole('combobox', { name: 'Alpha slot 1', exact: true })
			.selectOption('Alpha-2');
		await other
			.getByRole('combobox', { name: 'Alpha slot 2', exact: true })
			.selectOption('Alpha-1');
		await page.getByRole('combobox', { name: 'Alpha slot 1', exact: true }).selectOption('Alpha-1');
		await save(page, 'Save lineup');
		await staleSave(other, 'Save lineup', 'lineup');
		await other.getByRole('tab', { name: 'Info', exact: true }).click();
		await other.getByRole('tab', { name: 'Lineup', exact: true }).click();
		await expect(other.getByRole('combobox', { name: 'Alpha slot 1', exact: true })).toHaveValue(
			'Alpha-2'
		);
		await expect(other.getByRole('combobox', { name: 'Alpha slot 2', exact: true })).toHaveValue(
			'Alpha-1'
		);
		await other.getByRole('button', { name: 'Reload this section', exact: true }).click();
		await expect(other.getByRole('combobox', { name: 'Alpha slot 1', exact: true })).toHaveValue(
			'Alpha-1'
		);

		await page.goto(`${game}?tab=veto`);
		await other.goto(page.url());
		await vetoPick(other, 1, 2, 2);
		await vetoPick(other, 2, 3, 3);
		await other.getByRole('button', { name: 'Move action 2 up', exact: true }).click();
		await vetoPick(page, 1, 1, 1);
		await save(page, 'Save match veto');
		await staleSave(other, 'Save match veto', 'veto');
		await expect(other.getByRole('combobox', { name: 'Action 1 map', exact: true })).toHaveValue(
			'map-3'
		);
		await expect(other.getByRole('combobox', { name: 'Action 2 map', exact: true })).toHaveValue(
			'map-2'
		);

		await page.goto(game);
		await other.goto(page.url());
		await other.getByLabel('Alpha score (Team A)', { exact: true }).fill('4');
		await other.getByLabel('Bravo score (Team B)', { exact: true }).fill('13');
		await scores(page, '13', '4');
		await staleSave(other, 'Finalize result', 'finalize');
		await expect(other.getByLabel('Alpha score (Team A)', { exact: true })).toHaveValue('4');
		await expect(other.getByLabel('Bravo score (Team B)', { exact: true })).toHaveValue('13');
		await other.getByRole('button', { name: 'Reload this section', exact: true }).click();
		await expect(other.getByLabel('Alpha score (Team A)', { exact: true })).toHaveValue('13');
		await expect(other.getByLabel('Bravo score (Team B)', { exact: true })).toHaveValue('4');
	} finally {
		await context.close();
	}
});
