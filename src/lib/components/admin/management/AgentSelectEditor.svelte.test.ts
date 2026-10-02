import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AgentSelectEditor from './AgentSelectEditor.svelte';

it('keeps dirty saved identity, historical options and original revision after lineup removal', async () => {
	const props = {
		revision: 2,
		entries: [
			{ id: 'entry-a', name: 'Alpha' },
			{ id: 'entry-b', name: 'Bravo' }
		],
		lineup: [
			{ entryId: 'entry-a', playerId: 'a1', slot: 1, agentId: 'old' },
			{ entryId: 'entry-b', playerId: 'b1', slot: 1, agentId: null }
		],
		players: [
			{ id: 'a1', displayName: 'Player a1' },
			{ id: 'b1', displayName: 'Player b1' }
		],
		agents: [
			{ id: 'old', displayName: 'Old Agent', isActive: false },
			{ id: 'jett', displayName: 'Jett', isActive: true }
		]
	};
	const view = render(AgentSelectEditor, props);
	const select = page.getByRole('combobox', { name: 'Player a1 Agent', exact: true });
	await select.selectOptions('jett');
	await view.rerender({
		...props,
		revision: 3,
		lineup: [props.lineup[1]],
		agents: [props.agents[1]]
	});
	await expect.element(select).toHaveValue('jett');
	expect(view.container.textContent).toContain('Slot 1 · Player a1');
	expect(
		Array.from((select.element() as HTMLSelectElement).options, (option) => option.textContent)
	).toContain('Old Agent · Historical');
	const payload = () =>
		JSON.parse(view.container.querySelector<HTMLInputElement>('input[name="payload"]')!.value);
	expect(payload()).toMatchObject({
		expectedGameRevision: 2,
		players: [
			{ playerId: 'a1', entryId: 'entry-a', agentId: 'jett' },
			{ playerId: 'b1', entryId: 'entry-b', agentId: '' }
		]
	});
	await view.rerender({ ...props, revision: 4, lineup: [], agents: [props.agents[1]] });
	await expect.element(select).toHaveValue('jett');
	expect(payload().expectedGameRevision).toBe(2);
	expect(payload().players).toHaveLength(2);
	await view.rerender({
		...props,
		revision: 5,
		lineup: [],
		agents: [{ ...props.agents[1], isActive: false }]
	});
	await expect.element(select).toHaveValue('jett');
	expect(
		Array.from((select.element() as HTMLSelectElement).options, (option) => option.textContent)
	).toContain('Jett · Unavailable');
});
