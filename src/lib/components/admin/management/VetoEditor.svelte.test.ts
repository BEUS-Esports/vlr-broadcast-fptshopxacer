import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import VetoEditor from './VetoEditor.svelte';

it('excludes earlier maps and keeps choices valid when actions change, move or are removed', async () => {
	const view = render(VetoEditor, {
		matchId: 'match',
		revision: 1,
		bestOf: 3,
		entries: [{ id: 'a', name: 'A' }],
		maps: [1, 2, 3].map((n) => ({ id: `m${n}`, displayName: `Map ${n}` })),
		actions: (['ban', 'pick', 'decider'] as const).map((action, index) => ({
			action,
			mapId: `m${index + 1}`,
			actingEntryId: 'a',
			gameNumber: null,
			sideChooserEntryId: null,
			sideChoice: null
		}))
	});
	const mapSelect = (n: number) =>
		page.getByRole('combobox', { name: `Action ${n} map`, exact: true });
	const options = (n: number) =>
		Array.from((mapSelect(n).element() as HTMLSelectElement).options, (option) => option.value);

	expect(options(1)).toEqual(['', 'm1', 'm2', 'm3']);
	expect(options(2)).toEqual(['', 'm2', 'm3']);
	expect(options(3)).toEqual(['', 'm3']);
	await page.getByRole('button', { name: 'Add veto action' }).click();
	expect(options(4)).toEqual(['']);

	await mapSelect(1).selectOptions('m2');
	await expect.element(mapSelect(2)).toHaveValue('');
	await expect.element(mapSelect(3)).toHaveValue('m3');
	expect(options(2)).toEqual(['', 'm1', 'm3']);
	const payload = JSON.parse(
		view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value
	);
	expect(payload.actions.map((row: { mapId: string }) => row.mapId)).toEqual(['m2', '', 'm3', '']);
	expect((mapSelect(2).element() as HTMLSelectElement).validity.valueMissing).toBe(true);

	await mapSelect(2).selectOptions('m1');
	await page.getByRole('button', { name: 'Move action 3 up' }).click();
	await expect.element(mapSelect(2)).toHaveValue('m3');
	await expect.element(mapSelect(3)).toHaveValue('m1');
	expect(options(3)).toEqual(['', 'm1']);
	await page.getByRole('button', { name: 'Remove action 1', exact: true }).click();
	expect(options(2)).toEqual(['', 'm1', 'm2']);
	expect(options(3)).toEqual(['', 'm2']);
});

it('reorders whole veto rows with keyboard buttons and retains the full dirty draft on refreshed props', async () => {
	const actions = [1, 2].map((n) => ({
		id: `v${n}`,
		action: 'pick' as const,
		mapId: `m${n}`,
		gameNumber: n,
		actingEntryId: 'a',
		sideChooserEntryId: null,
		sideChoice: null
	}));
	const props = {
		matchId: 'match',
		revision: 1,
		bestOf: 5,
		actions,
		entries: [
			{ id: 'a', name: 'A' },
			{ id: 'b', name: 'B' }
		],
		maps: [
			{ id: 'm1', displayName: 'First' },
			{ id: 'm2', displayName: 'Second' }
		]
	};
	const view = render(VetoEditor, props);
	await page.getByRole('button', { name: 'Move action 2 up' }).click();
	await view.rerender({ ...props, revision: 2, actions: [] });
	const payload = JSON.parse(
		view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value
	);
	expect(payload.expectedMatchRevision).toBe(1);
	expect(payload.actions.map((row: { id: string }) => row.id)).toEqual(['v2', 'v1']);
	expect(payload.actions[0]).toMatchObject({ mapId: 'm2', gameNumber: 2, actingEntryId: 'a' });
});
