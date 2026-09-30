import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import VetoEditor from './VetoEditor.svelte';

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
