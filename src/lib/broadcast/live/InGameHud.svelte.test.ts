import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import InGameHud from './InGameHud.svelte';
import { preparedSnapshot } from '../templates/test-snapshot';
import { liveGameFixture } from '#lib/live/fixtures.ts';
import type { LiveGameState } from '#lib/live/types.ts';

function snapshotWithVeto() {
	const snapshot = preparedSnapshot();
	const map = (displayName: string) => ({ ...snapshot.game!.map!, id: displayName, displayName });
	snapshot.veto = [
		{
			sequence: 1,
			action: 'pick',
			map: map('Bind'),
			actingEntryId: 'a',
			gameNumber: 1,
			sideChooserEntryId: null,
			sideChoice: null
		},
		{
			sequence: 2,
			action: 'pick',
			map: map('Haven'),
			actingEntryId: 'b',
			gameNumber: 2,
			sideChooserEntryId: null,
			sideChoice: null
		}
	];
	return snapshot;
}

function live(overrides: Partial<LiveGameState> = {}) {
	return liveGameFixture({
		rounds: [{ round: 1, winnerProviderSide: 'right', reason: 'elimination' }],
		...overrides
	});
}

const props = (state: LiveGameState, snapshot = snapshotWithVeto()) => ({
	snapshot,
	live: state,
	status: null,
	resources: null,
	identity: 'local' as const
});

it('shows round history only in buy phase', async () => {
	const view = render(InGameHud, props(live({ phase: 'combat' })));
	expect(view.container.querySelector('[aria-label="Round history"]')).toBeNull();
	await view.rerender(props(live({ phase: 'buy' })));
	expect(view.container.querySelector('[aria-label="Round history"]')).not.toBeNull();
	// Buy rounds only, even for providers that never report a phase (GStack).
	await view.rerender(props(live({ phase: 'unknown' })));
	expect(view.container.querySelector('[aria-label="Round history"]')).toBeNull();
});

it('fits overtime round history inside the strip', async () => {
	await page.viewport(1920, 1080);
	const rounds = Array.from({ length: 30 }, (_, index) => ({
		round: index + 1,
		winnerProviderSide: index % 2 ? ('left' as const) : ('right' as const),
		reason: 'elimination' as const
	}));
	const view = render(InGameHud, props(live({ phase: 'buy', rounds })));
	const history = view.container.querySelector<HTMLElement>('[aria-label="Round history"]')!;
	expect(history.getBoundingClientRect().width).toBeLessThanOrEqual(1100);
	expect(history.scrollWidth).toBeLessThanOrEqual(history.clientWidth);
});

it('labels current and next maps in the provider HUD', () => {
	const view = render(InGameHud, props(live()));
	const strip = view.container.querySelector('[data-map-strip]')!;
	expect(strip.textContent).toMatch(/CURRENT:\s*BIND/i);
	expect(strip.textContent).toMatch(/NEXT:\s*HAVEN/i);
	const empty = render(InGameHud, props(live(), { ...snapshotWithVeto(), game: null }));
	expect(empty.container.querySelector('[data-map-strip]')).toBeNull();
});

it('keeps the provider top bar clear of the game timer', async () => {
	await page.viewport(1920, 1080);
	const snapshot = snapshotWithVeto();
	const longName = 'Long saved identity '.repeat(20);
	snapshot.teams.forEach((team) => {
		team.name = longName;
		team.tag = longName;
	});
	const view = render(InGameHud, props(live({ roundNumber: 14 }), snapshot));
	const timer = { left: 890, top: 0, right: 1030, bottom: 72 };
	for (const element of view.container.querySelectorAll(
		'.team-rail, .score, [data-map-strip], .round-context'
	)) {
		const box = element.getBoundingClientRect();
		if (!box.width || !box.height) continue;
		const clear =
			box.right <= timer.left ||
			box.left >= timer.right ||
			box.bottom <= timer.top ||
			box.top >= timer.bottom;
		if (element.classList.contains('round-context')) expect(box.bottom).toBeLessThanOrEqual(24);
		else expect(clear, element.className).toBe(true);
	}
});

it('draws round history reasons as icons', () => {
	const reasons = ['elimination', 'defuse', 'detonation', 'time'] as const;
	const rounds = reasons.map((reason, i) => ({
		round: i + 1,
		winnerProviderSide: 'left' as const,
		reason
	}));
	const view = render(InGameHud, props(live({ phase: 'buy', rounds })));
	const marks = [...view.container.querySelectorAll('[data-winner-position]')];
	expect(marks.map((mark) => mark.getAttribute('data-reason'))).toEqual([...reasons]);
	for (const mark of marks) {
		expect(mark.querySelector('img')?.getAttribute('src')).toBeTruthy();
		expect(mark.textContent?.trim()).toBe('');
	}
});

it('frames the game timer exactly with timer-height halves and a bare round label', async () => {
	await page.viewport(1920, 1080);
	const view = render(InGameHud, props(live({ roundNumber: 14 })));
	const box = (selector: string) => view.container.querySelector(selector)!.getBoundingClientRect();
	const [leftScore, rightScore] = [
		box('.score[data-position="left"]'),
		box('.score[data-position="right"]')
	];
	expect(rightScore.left - leftScore.right).toBe(140);
	expect((leftScore.right + rightScore.left) / 2).toBe(960);
	for (const selector of [
		'.team-rail[data-position="left"]',
		'.team-rail[data-position="right"]',
		'.score[data-position="left"]',
		'.score[data-position="right"]'
	])
		expect(box(selector).height, selector).toBe(72);
	expect(
		box('.team-rail[data-position="left"]').left + box('.team-rail[data-position="right"]').right
	).toBe(1920);
	const label = view.container.querySelector('.round-context')!;
	expect(getComputedStyle(label).backgroundColor).toBe('rgba(0, 0, 0, 0)');
});

it('shows a large buy-phase round history below the series pips', async () => {
	await page.viewport(1920, 1080);
	const snapshot = snapshotWithVeto();
	snapshot.match = {
		id: 'm',
		label: 'Final',
		bestOf: 3,
		scoreA: 1,
		scoreB: 0,
		resultType: null,
		winnerEntryId: null
	};
	const rounds = Array.from({ length: 13 }, (_, i) => ({
		round: i + 1,
		winnerProviderSide: i % 2 ? ('left' as const) : ('right' as const),
		reason: 'elimination' as const
	}));
	const view = render(InGameHud, props(live({ phase: 'buy', rounds }), snapshot));
	const history = view.container
		.querySelector('[aria-label="Round history"]')!
		.getBoundingClientRect();
	const pips = Math.max(
		...[...view.container.querySelectorAll('[data-win-dots]')].map(
			(el) => el.getBoundingClientRect().bottom
		)
	);
	expect(history.top).toBeGreaterThanOrEqual(pips + 8);
	expect(
		view.container.querySelector('.history-round')!.getBoundingClientRect().width
	).toBeGreaterThanOrEqual(26);
	expect(
		view.container.querySelector('.history-round img')!.getBoundingClientRect().width
	).toBeGreaterThanOrEqual(18);
});
