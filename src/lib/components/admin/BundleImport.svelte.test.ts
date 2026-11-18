import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import BundleImport from './BundleImport.svelte';
import type { ImportPreview } from '#lib/import/types.ts';

vi.mock('$app/forms', () => ({ enhance: () => ({}) }));

const preview = (errors: boolean): ImportPreview => ({
	hash: 'abc',
	imageCount: 1,
	teams: [
		{
			row: 2,
			name: 'Alpha',
			tag: 'Alp',
			logos: { normal: 'team_logos/normal/Alp.png', white: null, black: null }
		}
	],
	players: [],
	problems: errors
		? [
				{
					level: 'error',
					file: 'teams.csv',
					row: 2,
					field: 'team_tag',
					message: 'Team tag "Alp" is already used by team "Alpha".'
				}
			]
		: []
});
const confirm = () => page.getByRole('button', { name: 'Confirm import', exact: true });

it('blocks confirm and shows the located error when the preview has errors', async () => {
	render(BundleImport, { result: { importPreview: preview(true) } });
	await expect.element(confirm()).toBeDisabled();
	await expect
		.element(page.getByText('1 teams, 0 players, 1 images, 1 errors, 0 warnings'))
		.toBeVisible();
	await expect
		.element(page.getByRole('row', { name: /Alpha.*already used by team "Alpha"/ }))
		.toBeVisible();
	await expect
		.element(page.getByRole('link', { name: /already used by team "Alpha"/ }))
		.toHaveAttribute('href', '#import-teams.csv-2');
});

it('lists errors before warnings', async () => {
	const base = preview(true);
	const warning = {
		level: 'warning' as const,
		file: 'player_images/x.png',
		row: null,
		field: null,
		message: 'Matched no player.'
	};
	const view = render(BundleImport, {
		result: { importPreview: { ...base, problems: [warning, ...base.problems] } }
	});
	const items = Array.from(view.container.querySelectorAll('ul li'), (li) => li.textContent);
	expect(items[0]).toContain('already used by team');
	expect(items[1]).toContain('Matched no player.');
});

it('enables confirm for a clean preview until the file changes', async () => {
	render(BundleImport, { result: { importPreview: preview(false) } });
	await expect.element(confirm()).toBeEnabled();
	await userEvent.upload(page.getByLabelText('Bundle (.zip)'), [
		new File(['x'], 'other.zip', { type: 'application/zip' })
	]);
	await expect.element(confirm()).toBeDisabled();
});

it('shows the import error and the success status', async () => {
	const view = render(BundleImport, { result: { importError: 'Choose a zip bundle.' } });
	await expect.element(page.getByRole('alert')).toHaveTextContent('Choose a zip bundle.');
	await view.rerender({ result: { imported: { teams: 2, players: 5 } } });
	await expect
		.element(page.getByRole('status'))
		.toHaveTextContent('Imported 2 teams and 5 players.');
});
