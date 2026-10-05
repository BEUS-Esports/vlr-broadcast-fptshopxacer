import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import CenterMatchBanner from './CenterMatchBanner.svelte';
import { defaultPlayerStats, defaultVisibility, graphicIds } from '../controls';
import { CEREMONY_VISIBLE_MS, ceremonyLabels, ceremonyTypes } from '../in-game-controls';
import type { BroadcastPreparedSnapshot, BroadcastPublications, BroadcastSnapshot } from '../types';
function preparedFixture(): BroadcastPreparedSnapshot {
	const scope = {
		statistics: { scope: 'game' as const, gamesTotal: 0, gamesContributing: 0, players: [] },
		candidates: [],
		mvpPlayerId: null
	};
	return {
		version: 3,
		controlRevision: 1,
		dataRevision: 1,
		liveControls: {
			swapped: false,
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
		controls: { visibility: defaultVisibility, playerStats: defaultPlayerStats, mvpScope: 'game' },
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
		publications: Object.fromEntries(graphicIds.map((id) => [id, null])) as BroadcastPublications
	};
}
afterEach(() => vi.useRealTimers());

it.each(['a', 'b'])(
	'uses local identity and current gameplay side for tactical %s even after a presentation swap',
	async (entryId) => {
		const snapshot = fixture();
		snapshot.liveControls.pause = { type: 'tactical', entryId, pendingTechnical: true };
		const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
	const view = render(CenterMatchBanner, { snapshot });
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
