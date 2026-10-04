import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PlayerCard from './PlayerCard.svelte';
import ProviderAttribution from './ProviderAttribution.svelte';
import { livePlayerFixture, liveSessionFixture } from '#lib/live/fixtures.ts';
import type { BroadcastSnapshot } from '../types';
import type { LiveResources } from '#lib/live/selectors.ts';

const saved = {
	entryId: 'a',
	slot: 1,
	player: { playerId: 'local', displayName: 'Approved name' },
	agent: null
} as BroadcastSnapshot['lineups'][number];
const resources: LiveResources = {
	agents: [
		{
			id: 'jett',
			key: 'jett',
			displayName: 'Jett',
			roleName: null,
			displayIconPath: null,
			fullPortraitPath: null,
			bustPortraitPath: null,
			roleIconPath: null,
			abilities: [{ slot: 'grenade', displayName: 'Cloudburst', displayIconPath: null }]
		}
	],
	weapons: []
};

it('keeps local identity, omits unavailable measurements and retains known ability icons', async () => {
	const view = render(PlayerCard, {
		saved,
		resources,
		live: livePlayerFixture({ observedName: 'Unapproved upstream name', health: null })
	});
	expect(view.container.textContent).toContain('Approved name');
	expect(view.container.textContent).not.toContain('Unapproved upstream name');
	expect(view.container.querySelector('[data-health]')).toBeNull();
	expect(view.container.querySelector('[data-ability-charges]')).toBeNull();
	expect(
		view.container.querySelector('[aria-label="Cloudburst: image unavailable"]')
	).not.toBeNull();
	await view.rerender({
		saved,
		resources,
		live: livePlayerFixture({ health: 0, abilities: { grenade: 0, ability1: null, ability2: 2 } })
	});
	expect(view.container.querySelector('[data-health]')?.textContent).toContain('0');
	expect(view.container.querySelectorAll('[data-ability-charges]')).toHaveLength(2);
});

it('shows conservative provider attribution unless Spectra supporter status is confirmed', async () => {
	const view = render(ProviderAttribution, {
		status: liveSessionFixture({ provider: 'spectra', attribution: 'unknown' })
	});
	expect(view.container.textContent).toContain('Powered by ValoSpectra');
	await view.rerender({
		status: liveSessionFixture({ provider: 'spectra', attribution: 'supporter' })
	});
	expect(view.container.textContent).not.toContain('Powered by');
	await view.rerender({
		status: liveSessionFixture({ provider: 'gstack', attribution: 'unknown' })
	});
	expect(view.container.textContent).toContain('Powered by GStack');
});
