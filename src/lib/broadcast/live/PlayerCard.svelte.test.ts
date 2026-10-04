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
		live: livePlayerFixture({
			health: 0,
			abilities: {
				grenade: { current: 0, capacity: 2 },
				ability1: { current: null, capacity: null },
				ability2: { current: 2, capacity: null }
			}
		})
	});
	expect(view.container.querySelector('[data-health]')?.textContent).toContain('0');
	expect(view.container.querySelectorAll('[data-ability-charges]')).toHaveLength(2);
});

it('renders available and spent dots only when ability capacity is known', async () => {
	const view = render(PlayerCard, {
		saved,
		resources,
		live: livePlayerFixture({
			abilities: {
				grenade: { current: 1, capacity: 2 },
				ability1: { current: 0, capacity: 1 },
				ability2: { current: 2, capacity: null }
			}
		})
	});
	const cloudburst = view.container.querySelector('[aria-label="Cloudburst: 1 of 2 charges"]')!;
	expect(cloudburst).not.toBeNull();
	expect(cloudburst.querySelectorAll('[data-ability-dot]')).toHaveLength(2);
	expect(cloudburst.querySelectorAll('[data-ability-dot].available')).toHaveLength(1);
	const spent = view.container.querySelector('[aria-label="Ability 2: 0 of 1 charges"]')!;
	expect(spent.querySelectorAll('[data-ability-dot]')).toHaveLength(1);
	expect(spent.querySelectorAll('[data-ability-dot].available')).toHaveLength(0);
	const unknown = view.container.querySelector(
		'[aria-label="Ability 3: 2 charges, capacity unavailable"]'
	)!;
	expect(unknown.querySelectorAll('[data-ability-dot]')).toHaveLength(0);
	expect(unknown.textContent).toContain('2');
	await view.rerender({
		saved,
		resources,
		live: livePlayerFixture({
			abilities: {
				grenade: { current: 1, capacity: 100_000 },
				ability1: { current: null, capacity: null },
				ability2: { current: null, capacity: null }
			}
		})
	});
	expect(view.container.querySelectorAll('[data-ability-dot]')).toHaveLength(0);
	expect(view.container.querySelector('[data-ability-charges]')?.textContent).toBe('1/100000');
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
