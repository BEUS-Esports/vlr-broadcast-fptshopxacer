// Fit regressions under the roadshow theme (Predator font): text and icons must stay inside their boxes.
import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../templates/predator-roadshow-val/theme.css';
import InGameHud from './InGameHud.svelte';
import PlayerCard from './PlayerCard.svelte';
import InGame from '../templates/test/InGame.svelte';
import { preparedSnapshot } from '../templates/test-snapshot';
import { liveGameFixture, livePlayerFixture } from '#lib/live/fixtures.ts';
import type { LiveResources } from '#lib/live/selectors.ts';

const icon =
	'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/%3E';

async function themed(width = 1920) {
	await page.viewport(1920, 1080);
	const host = document.createElement('div');
	host.setAttribute('data-template', 'predator-roadshow-val');
	host.style.cssText = `position:relative;width:${width}px;height:1080px`;
	document.body.append(host);
	await Promise.all(
		['400 20px Predator', '700 20px Predator', '900 20px Predator'].map((f) =>
			document.fonts.load(f)
		)
	);
	return host;
}

const fits = (el: Element) =>
	expect(el.scrollWidth, el.className).toBeLessThanOrEqual(el.clientWidth);

it('keeps a fully equipped card footer inside the card', async () => {
	const host = await themed(313);
	const resources: LiveResources = {
		agents: [
			{
				id: 'jett',
				key: 'jett',
				displayName: 'Jett',
				roleName: null,
				displayIconPath: icon,
				fullPortraitPath: null,
				bustPortraitPath: null,
				roleIconPath: null,
				abilities: (['grenade', 'ability1', 'ability2', 'ultimate'] as const).map((slot) => ({
					slot,
					displayName: slot,
					displayIconPath: icon
				}))
			}
		],
		weapons: [{ key: 'vandal', displayName: 'Vandal', displayIconPath: icon }]
	};
	render(PlayerCard, {
		target: host,
		props: {
			saved: undefined,
			resources,
			live: livePlayerFixture({
				observedName: 'Player',
				agent: 'Jett',
				weapon: 'Vandal',
				alive: true,
				health: 100,
				credits: 4500,
				ultimate: { ready: false, current: 5, required: 8 },
				abilities: {
					grenade: { current: 1, capacity: 2 },
					ability1: { current: 2, capacity: 2 },
					ability2: { current: 1, capacity: 1 }
				}
			})
		}
	});
	await new Promise((r) => setTimeout(r, 50));
	fits(host.querySelector('footer')!);
	const ult = host.querySelector('.ultimate')!.getBoundingClientRect();
	const column = host.querySelector('.agent')!.getBoundingClientRect();
	expect(ult.left).toBeGreaterThanOrEqual(column.left - 1);
	expect(ult.right).toBeLessThanOrEqual(column.right + 1);
	fits(host.querySelector('.ultimate')!);
	host.remove();
});

it('fits the longest map name in the roadshow fallback map box', async () => {
	const host = await themed();
	const snapshot = preparedSnapshot();
	snapshot.game!.map!.displayName = 'Fracture';
	render(InGame, { target: host, props: { snapshot } });
	fits(host.querySelector('.match-body p')!);
	host.remove();
});

it('fits a four-letter tag beside a logo in the provider top bar', async () => {
	const host = await themed();
	const snapshot = preparedSnapshot();
	snapshot.teams.forEach((team) => {
		team.tag = 'BEUS';
		team.logoPath = icon;
	});
	render(InGameHud, {
		target: host,
		props: { snapshot, live: liveGameFixture(), status: null, resources: null, identity: 'local' }
	});
	for (const name of host.querySelectorAll('.team-rail strong')) fits(name);
	host.remove();
});

it('keeps round and spike state inside the timer width', async () => {
	const host = await themed();
	const live = liveGameFixture({
		roundNumber: 24,
		spike: { state: 'detonated', carrierPlayerId: null, carrierRaw: null, raw: null }
	});
	render(InGameHud, {
		target: host,
		props: { snapshot: preparedSnapshot(), live, status: null, resources: null, identity: 'local' }
	});
	const box = host.querySelector('.round-context')!.getBoundingClientRect();
	expect(host.querySelector('.round-context')!.textContent).toContain('DETONATED');
	expect(box.left).toBeGreaterThanOrEqual(890);
	expect(box.right).toBeLessThanOrEqual(1030);
	host.remove();
});

it('keeps long overtime history clear of the minimap and kill feed', async () => {
	const host = await themed();
	const rounds = Array.from({ length: 45 }, (_, i) => ({
		round: i + 1,
		winnerProviderSide: i % 2 ? ('left' as const) : ('right' as const),
		reason: 'time' as const
	}));
	const live = liveGameFixture({ phase: 'buy', rounds });
	live.teams[0].observedName = 'Extremely long provider team name';
	live.teams[1].observedName = 'Another extremely long provider name';
	render(InGameHud, {
		target: host,
		props: {
			snapshot: preparedSnapshot(),
			live,
			status: null,
			resources: null,
			identity: 'provider'
		}
	});
	const history = host.querySelector('[aria-label="Round history"]')!;
	const box = history.getBoundingClientRect();
	expect(box.left).toBeGreaterThanOrEqual(420);
	expect(box.right).toBeLessThanOrEqual(1440);
	fits(history);
	host.remove();
});

it('hides shield text with no armor and on dead cards', async () => {
	const view = render(PlayerCard, {
		saved: undefined,
		resources: null,
		live: livePlayerFixture({
			alive: true,
			shield: { raw: null, kind: 'none', current: 0, extra: null }
		})
	});
	expect(view.container.querySelector('.shield')).toBeNull();
	await view.rerender({
		saved: undefined,
		resources: null,
		live: livePlayerFixture({
			alive: false,
			extraHealth: 10,
			shield: { raw: null, kind: 'heavy', current: 50, extra: 5 }
		})
	});
	expect(view.container.querySelector('.shield')).toBeNull();
	expect(view.container.querySelector('.enhanced')).toBeNull();
});
