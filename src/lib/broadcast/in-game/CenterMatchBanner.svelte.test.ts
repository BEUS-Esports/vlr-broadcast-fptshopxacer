import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import CenterMatchBanner from './CenterMatchBanner.svelte';
import { defaultPlayerStats, defaultVisibility, graphicIds } from '../controls';
import { CEREMONY_VISIBLE_MS, ceremonyLabels, ceremonyTypes } from '../in-game-controls';
import type { BroadcastPreparedSnapshot, BroadcastPublications, BroadcastSnapshot } from '../types';
import { emptySponsor } from '../sponsor';
function preparedFixture(): BroadcastPreparedSnapshot {
	const scope = {
		statistics: { scope: 'game' as const, gamesTotal: 0, gamesContributing: 0, players: [] },
		candidates: [],
		mvpPlayerId: null
	};
	return {
		version: 5,
		controlRevision: 1,
		dataRevision: 1,
		liveControls: {
			swapped: false,
			boothsSwapped: false,
			lineupTeams: 'both',
			currentAttackersEntryId: null,
			pause: { type: 'none' },
			ceremony: null
		},
		selection: { tournamentId: 't', matchId: 'm', gameId: 'g' },
		tournament: { id: 't', name: 'Test', slug: 'test' },
		match: {
			id: 'm',
			label: 'Match',
			bestOf: 1,
			scoreA: 0,
			scoreB: 0,
			resultType: null,
			winnerEntryId: null
		},
		game: {
			id: 'g',
			name: 'Saved',
			number: 1,
			map: null,
			scoreA: null,
			scoreB: null,
			resultType: null,
			winnerEntryId: null
		},
		competition: { teamAEntryId: null, teamBEntryId: null },
		presentation: { leftEntryId: null, rightEntryId: null },
		booths: { booth1EntryId: null, booth2EntryId: null },
		sides: {
			preparedAttackersEntryId: null,
			preparedDefendersEntryId: null,
			attackersEntryId: null,
			defendersEntryId: null,
			source: 'unknown'
		},
		teams: [],
		lineups: [],
		veto: [],
		scopes: {
			game: scope,
			match: { ...scope, statistics: { ...scope.statistics, scope: 'match' } },
			tournament: { ...scope, statistics: { ...scope.statistics, scope: 'tournament' } }
		},
		controls: {
			visibility: defaultVisibility,
			playerStats: defaultPlayerStats,
			mvpScope: 'game',
			mvpFields: [...defaultPlayerStats.fields]
		},
		readiness: { selected: true, map: false, lineups: false, agents: false, result: false }
	};
}

function fixture(): BroadcastSnapshot {
	const prepared = preparedFixture();
	return {
		...prepared,
		competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
		presentation: { leftEntryId: 'a', rightEntryId: 'b' },
		sides: { ...prepared.sides, attackersEntryId: 'a', defendersEntryId: 'b', source: 'manual' },
		teams: ['a', 'b'].map((entryId) => ({
			entryId,
			teamId: entryId,
			name: entryId === 'a' ? 'Local Alpha' : 'Local Bravo',
			tag: entryId.toUpperCase(),
			logoPath: null,
			logoWhitePath: null,
			logoBlackPath: null
		})),
		sponsor: emptySponsor,
		publications: Object.fromEntries(graphicIds.map((id) => [id, null])) as BroadcastPublications
	};
}
afterEach(() => vi.useRealTimers());

it.each([7000, -5000])('expires on server time with %sms browser clock skew', async (offset) => {
	vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(10000 + offset);
	const receivedAt = performance.now();
	const clock = { now: () => 10000 + performance.now() - receivedAt };
	const snapshot = fixture();
	snapshot.liveControls.ceremony = {
		type: 'round-win',
		entryId: 'a',
		triggeredAt: 8000,
		sequence: 4
	};
	const view = render(CenterMatchBanner, { snapshot, clock });
	expect(view.container.textContent).toContain('ROUND WIN');
	await vi.advanceTimersByTimeAsync(2000);
	// A new sample for the same event must reschedule only its remaining time.
	const resampledAt = performance.now();
	const refreshedClock = { now: () => 12000 + performance.now() - resampledAt };
	await view.rerender({ snapshot, clock: refreshedClock });
	await vi.advanceTimersByTimeAsync(1999);
	await tick();
	expect(view.container.querySelector('[data-match-banner]')).not.toBeNull();
	await vi.advanceTimersByTimeAsync(1);
	await tick();
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
	// Receiving the same expired event again must not restart its window.
	await view.rerender({ snapshot: { ...snapshot }, clock });
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
});

it('waits for a server clock sample before displaying a ceremony', async () => {
	const snapshot = fixture();
	snapshot.liveControls.ceremony = {
		type: 'round-win',
		entryId: 'a',
		triggeredAt: 8000,
		sequence: 4
	};
	const view = render(CenterMatchBanner, { snapshot, clock: null });
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
	await view.rerender({ snapshot, clock: { now: () => 10000 } });
	expect(view.container.textContent).toContain('ROUND WIN');
});

it.each(['a', 'b'])(
	'uses local identity and current gameplay side for tactical %s even after a presentation swap',
	async (entryId) => {
		const snapshot = fixture();
		snapshot.liveControls.pause = { type: 'tactical', entryId, pendingTechnical: true };
		const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
		const banner = () => view.container.querySelector('[data-match-banner]')!;
		expect(banner().textContent).toContain('TACTICAL TIMEOUT');
		expect(banner().textContent).toContain(entryId === 'a' ? 'Local Alpha' : 'Local Bravo');
		expect(banner().getAttribute('data-side')).toBe(entryId === 'a' ? 'attack' : 'defense');
		expect(getComputedStyle(banner()).getPropertyValue('--accent').trim()).toBe(
			entryId === 'a' ? '#248bff' : '#ff4655'
		);
		expect(banner().textContent).toContain(entryId === 'a' ? 'ATK' : 'DEF');
		expect(banner().textContent).not.toContain('pending');
		expect(view.container.querySelector('img')).toBeNull();
		await view.rerender({
			snapshot: {
				...snapshot,
				presentation: { leftEntryId: 'b', rightEntryId: 'a' },
				liveControls: { ...snapshot.liveControls, swapped: true }
			}
		});
		expect(banner().getAttribute('data-entry-id')).toBe(entryId);
	}
);

it('shows neutral technical state without a team or fake countdown', () => {
	const snapshot = fixture();
	snapshot.liveControls.pause = { type: 'technical' };
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	expect(view.container.textContent?.trim()).toBe('TECHNICAL PAUSE');
	expect(view.container.querySelector('[data-match-banner]')?.getAttribute('data-side')).toBe(
		'neutral'
	);
	expect(view.container.querySelector('[data-entry-id]')?.getAttribute('data-entry-id')).toBe('');
});

it('uses neutral treatment for an unknown side and displays an available team logo', () => {
	const snapshot = fixture();
	snapshot.sides.attackersEntryId = null;
	snapshot.sides.defendersEntryId = null;
	snapshot.teams[0].logoWhitePath = '/alpha.svg';
	snapshot.liveControls.pause = { type: 'tactical', entryId: 'a', pendingTechnical: false };
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	expect(view.container.querySelector('[data-match-banner]')?.getAttribute('data-side')).toBe(
		'neutral'
	);
	expect(view.container.textContent).not.toContain('ATK');
	expect(view.container.querySelector('img')?.getAttribute('src')).toBe('/alpha.svg');
});

it.each(ceremonyTypes)('shows %s and expires at the original deadline', async (type) => {
	vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(10000);
	const snapshot = fixture();
	snapshot.liveControls.ceremony = { type, entryId: 'b', triggeredAt: 8000, sequence: 4 };
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	expect(view.container.textContent).toContain(ceremonyLabels[type]);
	await vi.advanceTimersByTimeAsync(CEREMONY_VISIBLE_MS - 2001);
	await tick();
	expect(view.container.querySelectorAll('[data-match-banner]')).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1);
	await tick();
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
});

it('reveals a queued pause at ceremony expiry with exactly one slot throughout', async () => {
	vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(10000);
	const snapshot = fixture();
	snapshot.liveControls.ceremony = {
		type: 'clutch',
		entryId: 'b',
		triggeredAt: 10000,
		sequence: 4
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	await view.rerender({
		snapshot: {
			...snapshot,
			liveControls: {
				...snapshot.liveControls,
				pause: { type: 'tactical', entryId: 'a', pendingTechnical: false }
			}
		}
	});
	expect(view.container.textContent).toContain('CLUTCH');
	expect(view.container.textContent).not.toContain('TACTICAL');
	await vi.advanceTimersByTimeAsync(CEREMONY_VISIBLE_MS);
	await tick();
	expect(view.container.textContent).toContain('TACTICAL TIMEOUT');
	expect(view.container.textContent).not.toContain('CLUTCH');
	expect(view.container.querySelectorAll('[data-match-banner]')).toHaveLength(1);
});

it('does not replay stale ceremonies on mount or reconnect and cancels dismissed timers', async () => {
	vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(20000);
	const snapshot = fixture();
	snapshot.liveControls.ceremony = {
		type: 'flawless',
		entryId: 'a',
		triggeredAt: 10000,
		sequence: 1
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
	await view.rerender({
		snapshot: {
			...snapshot,
			liveControls: {
				...snapshot.liveControls,
				ceremony: { type: 'clutch', entryId: 'b', triggeredAt: 20000, sequence: 2 }
			}
		}
	});
	expect(view.container.textContent).toContain('CLUTCH');
	await view.rerender({
		snapshot: { ...snapshot, liveControls: { ...snapshot.liveControls, ceremony: null } }
	});
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
	expect(vi.getTimerCount()).toBe(0);
});

it('cancels old deadlines on replacement and removes the final timer on unmount', async () => {
	vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(10000);
	const snapshot = fixture();
	snapshot.liveControls.ceremony = {
		type: 'round-win',
		entryId: 'a',
		triggeredAt: 10000,
		sequence: 1
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	await vi.advanceTimersByTimeAsync(1000);
	await view.rerender({
		snapshot: {
			...snapshot,
			liveControls: {
				...snapshot.liveControls,
				ceremony: { type: 'flawless', entryId: 'b', triggeredAt: 11000, sequence: 2 }
			}
		}
	});
	await vi.advanceTimersByTimeAsync(5000);
	await tick();
	expect(view.container.textContent).toContain('FLAWLESS');
	expect(view.container.querySelectorAll('[data-match-banner]')).toHaveLength(1);
	await view.unmount();
	expect(vi.getTimerCount()).toBe(0);
});

it('suppresses orphaned team ownership and team banners without a selected local game', async () => {
	const snapshot = fixture();
	snapshot.liveControls.pause = { type: 'tactical', entryId: 'wrong', pendingTechnical: false };
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
	await view.rerender({
		snapshot: {
			...snapshot,
			selection: null,
			liveControls: {
				...snapshot.liveControls,
				pause: { type: 'tactical', entryId: 'a', pendingTechnical: false }
			}
		}
	});
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
});

it('replaces tactical with technical atomically without an entering transparent frame', async () => {
	const snapshot = fixture();
	snapshot.liveControls.pause = { type: 'tactical', entryId: 'a', pendingTechnical: true };
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	await view.rerender({
		snapshot: {
			...snapshot,
			liveControls: { ...snapshot.liveControls, pause: { type: 'technical' } }
		}
	});
	const banners = view.container.querySelectorAll('[data-match-banner]');
	expect(banners).toHaveLength(1);
	expect(banners[0].textContent?.trim()).toBe('TECHNICAL PAUSE');
	expect(getComputedStyle(banners[0]).animationName).toBe('none');
	expect(getComputedStyle(banners[0]).opacity).toBe('1');
});

it('keeps reconnect reveal and exit tied to the original ceremony deadline', async () => {
	vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(10000);
	const snapshot = fixture();
	snapshot.liveControls.ceremony = {
		type: 'clutch',
		entryId: 'a',
		triggeredAt: 10000,
		sequence: 3
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	await vi.advanceTimersByTimeAsync(3000);
	await view.rerender({
		snapshot: {
			...snapshot,
			liveControls: { ...snapshot.liveControls, ceremony: { ...snapshot.liveControls.ceremony } }
		}
	});
	await vi.advanceTimersByTimeAsync(2859);
	await tick();
	expect(view.container.querySelector('[data-match-banner]')?.classList.contains('departing')).toBe(
		false
	);
	await vi.advanceTimersByTimeAsync(1);
	await tick();
	expect(view.container.querySelector('[data-match-banner]')?.classList.contains('departing')).toBe(
		true
	);
	await vi.advanceTimersByTimeAsync(140);
	await tick();
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
});

// Scoped-style hashes, empty `{#if}` anchors and the whitespace beside them are not markup the
// banner owns; elements and attributes are what must not change.
const markup = (view: { container: HTMLElement }) =>
	view.container
		.querySelector('[data-match-banner]')
		?.outerHTML.replace(/ ?svelte-[a-z0-9]+|<!---->/g, '')
		.replace(/>\s+</g, '><');

const art = (backgroundPath: string | null, logoPath: string | null) => ({
	backgroundPath,
	logoPath
});

it('no art means unchanged markup', () => {
	const snapshot = fixture();
	snapshot.teams[0].logoWhitePath = '/alpha.svg';
	snapshot.liveControls.pause = { type: 'tactical', entryId: 'a', pendingTechnical: false };
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	expect(markup(view)).toMatchInlineSnapshot(
		`"<section aria-label="Match banner" class="match-banner" data-match-banner="tactical" data-entry-id="a" data-side="attack" data-reduced-motion="false"><div class="banner-content"><span class="asset"><img class="" src="/alpha.svg" alt="Local Alpha"></span><div class="copy"><h2 class="">TACTICAL TIMEOUT</h2><div class="team"><strong class="">A</strong><span class="">Local Alpha</span><small class="">ATK</small></div></div></div></section>"`
	);
});

it('renders the art of the shown banner kind', () => {
	const snapshot = fixture();
	snapshot.liveControls.pause = { type: 'technical' };
	snapshot.sponsor = {
		...emptySponsor,
		banners: {
			...emptySponsor.banners,
			technical: art('/assets/a.png', '/assets/b.png'),
			tactical: art('/assets/other.png', '/assets/other-logo.png')
		}
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	const background = view.container.querySelector<HTMLElement>('[data-banner-sponsor-background]');
	const logo = view.container.querySelector('[data-banner-sponsor-logo]');
	expect(background?.style.backgroundImage).toBe('url("/assets/a.png")');
	expect(logo?.querySelector('img')?.getAttribute('src')).toBe('/assets/b.png');
	expect(view.container.querySelector('h2')?.textContent).toBe('TECHNICAL PAUSE');
});

it('renders each art element only when its path is set', () => {
	const snapshot = fixture();
	snapshot.liveControls.pause = { type: 'technical' };
	snapshot.sponsor = {
		...emptySponsor,
		banners: { ...emptySponsor.banners, technical: art(null, '/assets/b.png') }
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	expect(view.container.querySelector('[data-banner-sponsor-background]')).toBeNull();
	expect(view.container.querySelector('[data-banner-sponsor-logo]')).not.toBeNull();
});

it('ceremony uses its own slot', async () => {
	vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(10000);
	const snapshot = fixture();
	snapshot.sponsor = {
		...emptySponsor,
		banners: {
			...emptySponsor.banners,
			clutch: art('/assets/clutch.png', '/assets/clutch-logo.png')
		}
	};
	snapshot.liveControls.ceremony = {
		type: 'clutch',
		entryId: 'a',
		triggeredAt: 9000,
		sequence: 1
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	expect(
		view.container.querySelector<HTMLElement>('[data-banner-sponsor-background]')?.style
			.backgroundImage
	).toBe('url("/assets/clutch.png")');
	expect(view.container.querySelector('[data-banner-sponsor-logo]')).not.toBeNull();
	await view.rerender({
		snapshot: {
			...snapshot,
			liveControls: {
				...snapshot.liveControls,
				ceremony: { type: 'round-win', entryId: 'a', triggeredAt: 9500, sequence: 2 }
			}
		}
	});
	expect(view.container.textContent).toContain('ROUND WIN');
	expect(view.container.querySelector('[data-banner-sponsor-background]')).toBeNull();
	expect(view.container.querySelector('[data-banner-sponsor-logo]')).toBeNull();
});

it('keeps label, team logo and name', () => {
	const snapshot = fixture();
	snapshot.teams[0].logoWhitePath = '/alpha.svg';
	snapshot.liveControls.pause = { type: 'tactical', entryId: 'a', pendingTechnical: false };
	snapshot.sponsor = {
		...emptySponsor,
		banners: { ...emptySponsor.banners, tactical: art('/assets/a.png', '/assets/b.png') }
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	const banner = view.container.querySelector('[data-match-banner]')!;
	expect(banner.querySelector('h2')?.textContent).toBe('TACTICAL TIMEOUT');
	expect(banner.querySelector('strong')?.textContent).toBe('A');
	expect(banner.querySelector('.team span')?.textContent).toBe('Local Alpha');
	expect(banner.querySelector('.banner-content img')?.getAttribute('src')).toBe('/alpha.svg');
	const background = banner.querySelector('[data-banner-sponsor-background]')!;
	const content = banner.querySelector('.banner-content')!;
	expect(
		background.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(banner.firstElementChild).toBe(background);
});

it('art update does not restart the ceremony window', async () => {
	vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(10000);
	const snapshot = fixture();
	snapshot.sponsor = {
		...emptySponsor,
		banners: { ...emptySponsor.banners, clutch: art('/assets/one.png', null) }
	};
	snapshot.liveControls.ceremony = {
		type: 'clutch',
		entryId: 'a',
		triggeredAt: 8000,
		sequence: 4
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	const background = () =>
		view.container.querySelector<HTMLElement>('[data-banner-sponsor-background]');
	expect(background()?.style.backgroundImage).toBe('url("/assets/one.png")');
	await vi.advanceTimersByTimeAsync(1000);
	await view.rerender({
		snapshot: {
			...snapshot,
			sponsor: {
				...emptySponsor,
				banners: { ...emptySponsor.banners, clutch: art('/assets/two.png', null) }
			}
		}
	});
	expect(background()?.style.backgroundImage).toBe('url("/assets/two.png")');
	// Deadline stays 8000 + CEREMONY_VISIBLE_MS; the clock is at 11000, so 3000ms remain.
	await vi.advanceTimersByTimeAsync(CEREMONY_VISIBLE_MS - 2000 - 1000 - 1);
	await tick();
	expect(view.container.querySelector('[data-match-banner]')).not.toBeNull();
	await vi.advanceTimersByTimeAsync(1);
	await tick();
	expect(view.container.querySelector('[data-match-banner]')).toBeNull();
});

it('keeps text above the sponsor logo and reserves room for it', () => {
	const snapshot = fixture();
	snapshot.liveControls.pause = { type: 'technical' };
	snapshot.sponsor = {
		...emptySponsor,
		banners: { ...emptySponsor.banners, technical: art(null, '/assets/b.png') }
	};
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	const content = view.container.querySelector<HTMLElement>('.banner-content')!;
	const logo = view.container.querySelector<HTMLElement>('[data-banner-sponsor-logo]')!;
	expect(Number(getComputedStyle(logo).zIndex)).toBeLessThan(
		Number(getComputedStyle(content).zIndex)
	);
	// The logo box (right offset + width) plus a gap must be reserved beside the text.
	const banner = content.parentElement!.getBoundingClientRect();
	const logoBox = logo.getBoundingClientRect();
	const reserved = Number.parseFloat(getComputedStyle(content).paddingRight);
	expect(reserved).toBeGreaterThan(banner.right - logoBox.left);
});

it('adds no text padding when there is no logo', () => {
	const snapshot = fixture();
	snapshot.liveControls.pause = { type: 'technical' };
	const view = render(CenterMatchBanner, { snapshot, clock: { now: Date.now } });
	const content = view.container.querySelector<HTMLElement>('.banner-content')!;
	expect(getComputedStyle(content).paddingRight).toBe('38px');
});
