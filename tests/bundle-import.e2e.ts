import { expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { test } from './fixtures';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
	'base64'
);
const zip = (name: string, files: Record<string, string | Uint8Array>) => ({
	name,
	mimeType: 'application/zip',
	buffer: Buffer.from(
		zipSync(
			Object.fromEntries(
				Object.entries(files).map(([path, data]) => [
					path,
					typeof data === 'string' ? strToU8(data) : data
				])
			)
		)
	)
});

const clash = zip('clash.zip', { 'teams.csv': 'team_name,team_tag\nClash Team,alp\n' });
const fixed = zip('fixed.zip', {
	'teams.csv': 'team_name,team_tag\nImport Test Esports,ITE\n',
	'players.csv': 'display_name,full_name,riot_id\nImportPlayer,,ImportPlayer#TEST\n',
	'team_logos/normal/ITE.png': png
});

test('a clashing bundle is previewed with its error and cannot be confirmed', async ({ page }) => {
	await page.goto('/admin/teams');
	await page.getByText('Import bundle', { exact: true }).click();
	await page.getByLabel('Bundle (.zip)').setInputFiles(clash);
	await page.getByRole('button', { name: 'Preview import' }).click();
	await expect(
		page.getByRole('cell', { name: 'Team tag "alp" is already used by team "Alpha".' })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
});

test('a fixed bundle imports, then the same bundle is refused as duplicates', async ({ page }) => {
	await page.goto('/admin/teams');
	await page.getByText('Import bundle', { exact: true }).click();
	await page.getByLabel('Bundle (.zip)').setInputFiles(fixed);
	await page.getByRole('button', { name: 'Preview import' }).click();
	await expect(page.getByText('1 teams, 1 players, 1 images, 0 errors, 0 warnings')).toBeVisible();
	await page.getByRole('button', { name: 'Confirm import' }).click();
	await expect(page.getByRole('status')).toHaveText('Imported 1 teams and 1 players.');
	await page.getByRole('searchbox', { name: 'Search teams' }).fill('Import Test');
	const row = page.getByRole('row', { name: /Import Test Esports/ });
	await expect(row.getByRole('img', { name: 'Normal logo of Import Test Esports' })).toBeVisible();

	await page.goto('/admin/players');
	await page.getByRole('searchbox', { name: 'Search players' }).fill('ImportPlayer');
	await expect(page.getByRole('row', { name: /ImportPlayer.*ImportPlayer#TEST/ })).toBeVisible();

	await page.getByText('Import bundle', { exact: true }).click();
	await page.getByLabel('Bundle (.zip)').setInputFiles(fixed);
	await page.getByRole('button', { name: 'Preview import' }).click();
	await expect(page.getByText(/[1-9]\d* errors/)).toBeVisible();
	await expect(page.getByText(/already used by/).first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
});
