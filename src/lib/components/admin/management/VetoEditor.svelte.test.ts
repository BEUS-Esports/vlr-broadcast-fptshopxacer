import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import VetoEditor from './VetoEditor.svelte';

const sevenMaps = Array.from({ length: 7 }, (_, index) => ({
	id: `m${index + 1}`,
	displayName: `Map ${index + 1}`
}));
const teams = [
	{ id: 'a', name: 'Alpha' },
	{ id: 'b', name: 'Bravo' }
];

for (const [format, button, actions, actors, games] of [
	[
		1,
		'Fill Map Veto',
		['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'],
		['a', 'b', 'a', 'b', 'a', 'b', null],
		[null, null, null, null, null, null, 1]
	],
	[
		3,
		'Fill Map Veto',
		['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'],
		['a', 'b', 'a', 'b', 'a', 'b', null],
		[null, null, 1, 2, null, null, 3]
	],
	[
		5,
		'Fill Map Veto',
		['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'],
		['a', 'b', 'a', 'b', 'a', 'b', null],
		[null, null, 1, 2, 3, 4, 5]
	],
	[
		5,
		'Fill Grand Final (Upper Bracket Team A)',
		['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'],
		['a', 'a', 'a', 'b', 'a', 'b', null],
		[null, null, 1, 2, 3, 4, 5]
	],
	[
		5,
		'Fill Grand Final (Upper Bracket Team B)',
		['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'],
		['b', 'b', 'a', 'b', 'a', 'b', null],
		[null, null, 1, 2, 3, 4, 5]
	]
] as const) {
	it(`fills ${button} for BO${format} without inventing maps or side choices`, async () => {
		const view = render(VetoEditor, {
			matchId: 'match',
			revision: 1,
			bestOf: format,
			teamAEntryId: 'a',
			entries: teams,
			maps: sevenMaps,
			actions: []
		});
		await page.getByRole('button', { name: button, exact: true }).click();
		const draft = JSON.parse(
			view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value
		);
		expect(draft.actions.map((row: { action: string }) => row.action)).toEqual(actions);
		expect(draft.actions.map((row: { actingEntryId: string | null }) => row.actingEntryId)).toEqual(
			actors
		);
		expect(draft.actions.map((row: { gameNumber: number | null }) => row.gameNumber)).toEqual(
			games
		);
		expect(
			draft.actions.every(
				(row: { mapId: string; sideChooserEntryId: string | null; sideChoice: string | null }) =>
					row.mapId === '' && row.sideChooserEntryId === null && row.sideChoice === null
			)
		).toBe(true);
	});
}

it('leaves BO2 manual and only replaces an existing draft after confirmation', async () => {
	const view = render(VetoEditor, {
		matchId: 'match',
		revision: 1,
		bestOf: 2,
		teamAEntryId: 'a',
		entries: teams,
		maps: sevenMaps,
		actions: []
	});
	expect(view.container.textContent).toContain('No map veto preset for BO2');
	await view.rerender({
		matchId: 'match',
		revision: 1,
		bestOf: 3,
		teamAEntryId: 'a',
		entries: teams,
		maps: sevenMaps,
		actions: [
			{
				action: 'ban',
				mapId: 'm1',
				actingEntryId: 'a',
				gameNumber: null,
				sideChooserEntryId: null,
				sideChoice: null
			}
		]
	});
	const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
	await page.getByRole('button', { name: 'Fill Map Veto' }).click();
	const payload = () =>
		JSON.parse(view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value);
	expect(payload().actions).toHaveLength(1);
	confirmation.mockReturnValue(true);
	await page.getByRole('button', { name: 'Fill Map Veto' }).click();
	expect(payload().actions).toHaveLength(7);
	confirmation.mockRestore();
});

it('explains the standard Team A opening and defaults manual actions to Team A', async () => {
	const view = render(VetoEditor, {
		matchId: 'match',
		revision: 1,
		bestOf: 3,
		teamAEntryId: 'a',
		entries: [
			{ id: 'b', name: 'Bravo' },
			{ id: 'a', name: 'Alpha' }
		],
		maps: [{ id: 'm1', displayName: 'Map 1' }],
		actions: []
	});
	expect(view.container.textContent).toContain('Standard map vetoes start with Team A');
	await page.getByRole('button', { name: 'Add veto action' }).click();
	await expect
		.element(page.getByRole('combobox', { name: 'Action 1 acting team' }))
		.toHaveValue('a');
});

it('keeps a filled order editable', async () => {
	const view = render(VetoEditor, {
		matchId: 'match',
		revision: 1,
		bestOf: 3,
		teamAEntryId: 'a',
		entries: teams,
		maps: sevenMaps,
		actions: []
	});
	await page.getByRole('button', { name: 'Fill Map Veto' }).click();
	await page.getByRole('combobox', { name: 'Action 1 acting team' }).selectOptions('b');
	await page.getByRole('button', { name: 'Move action 2 up' }).click();
	const actions = JSON.parse(
		view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value
	).actions;
	expect(actions[1]).toMatchObject({ action: 'ban', actingEntryId: 'b' });
});

it('excludes earlier maps and keeps choices valid when actions change, move or are removed', async () => {
	const view = render(VetoEditor, {
		matchId: 'match',
		revision: 1,
		bestOf: 3,
		teamAEntryId: 'a',
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
		teamAEntryId: 'a',
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
