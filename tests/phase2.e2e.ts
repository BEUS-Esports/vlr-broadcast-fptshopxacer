import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('operator can save and reopen team, player, and resource profiles', async ({
	page,
	request
}) => {
	await page.goto('http://localhost:4173/admin/teams');
	await page.getByRole('link', { name: 'Add team', exact: true }).click();
	await page.getByRole('textbox', { name: 'Team name', exact: true }).fill('   ');
	await page.getByRole('textbox', { name: 'Team tag' }).fill('NS');
	await page.getByRole('button', { name: 'Create team' }).click();
	await expect(page.getByRole('alert')).toContainText('Team name');
	await expect(page.getByRole('region', { name: 'Team editor', exact: true })).toBeVisible();
	await page.getByRole('textbox', { name: 'Team name' }).fill('North Stars');
	await page.getByRole('textbox', { name: 'Team tag' }).fill('NS');
	await page.locator('input[name="logo"]').setInputFiles({
		name: 'team.png',
		mimeType: 'image/png',
		buffer: await readFile('src/lib/assets/favicon.png')
	});
	await page.getByRole('button', { name: 'Create team' }).click();
	await expect(page).toHaveURL(/\/admin\/teams\?edit=/);
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Team name' })).toHaveValue('North Stars');
	const logo = page.getByRole('img', { name: 'Current normal logo' });
	await expect(logo).toBeVisible();
	expect(
		(await request.get(new URL((await logo.getAttribute('src'))!, page.url()).toString())).status()
	).toBe(200);
	await page.getByRole('textbox', { name: 'Team name', exact: true }).fill('North Stars Updated');
	await page.getByRole('button', { name: 'Save team' }).click();
	await expect(page.getByRole('textbox', { name: 'Team name', exact: true })).toHaveValue(
		'North Stars Updated'
	);
	await page.getByRole('link', { name: 'Close', exact: true }).click();
	await page.getByRole('searchbox', { name: 'Search teams' }).fill('no-such-team');
	await expect(page.getByRole('table')).toContainText('No teams match your search');
	await page.getByRole('button', { name: 'Clear search' }).click();
	await expect(page.getByRole('table')).toContainText('North Stars Updated');

	await page.goto('http://localhost:4173/admin/players');
	await page.getByRole('link', { name: 'Add player', exact: true }).click();
	await page.getByRole('textbox', { name: 'In-game / display name' }).fill('Nova');
	await page.getByRole('textbox', { name: 'Full name' }).fill('N. Player');
	await page.getByRole('button', { name: 'Save player' }).click();
	await expect(page).toHaveURL(/\/admin\/players\?edit=/);
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'In-game / display name' })).toHaveValue('Nova');

	await page.goto('http://localhost:4173/admin/resources');
	await page.getByRole('link', { name: 'Add map', exact: true }).click();
	await page
		.getByRole('region', { name: 'Maps' })
		.getByRole('textbox', { name: 'Name' })
		.fill('Training Map');
	await page
		.getByRole('region', { name: 'Maps' })
		.getByRole('textbox', { name: 'Stable key' })
		.fill('training-map');
	await page.getByRole('button', { name: 'Save map' }).click();
	await expect(page).toHaveURL(/\/admin\/resources\?map=/);
	await page.reload();
	await expect(
		page.getByRole('region', { name: 'Maps' }).getByRole('textbox', { name: 'Name' })
	).toHaveValue('Training Map');
	await page
		.getByRole('region', { name: 'Maps' })
		.getByRole('textbox', { name: 'Name' })
		.fill('Training Ground');
	await page.getByRole('button', { name: 'Save map' }).click();
	await expect(
		page.getByRole('region', { name: 'Maps' }).getByRole('textbox', { name: 'Name' })
	).toHaveValue('Training Ground');
	await page.getByRole('link', { name: 'Add agent', exact: true }).click();
	await page
		.getByRole('region', { name: 'Agents' })
		.getByRole('textbox', { name: 'Name' })
		.fill('Practice Agent');
	await page
		.getByRole('region', { name: 'Agents' })
		.getByRole('textbox', { name: 'Stable key' })
		.fill('practice-agent');
	await page.getByRole('button', { name: 'Save agent' }).click();
	await expect(page).toHaveURL(/\/admin\/resources\?agent=/);
	await page.reload();
	await expect(
		page.getByRole('region', { name: 'Agents' }).getByRole('textbox', { name: 'Name' })
	).toHaveValue('Practice Agent');
});
