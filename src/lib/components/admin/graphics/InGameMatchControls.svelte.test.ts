import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
import { defaultPlayerStats, defaultVisibility, graphicIds } from '#lib/broadcast/controls.ts';
import InGameMatchControls from './InGameMatchControls.svelte';

afterEach(() => vi.useRealTimers());

it('disables the ceremony trigger until server time is available', () => {
	const view = render(InGameMatchControls, { live: snapshot(), clock: null });
	const trigger = view.container.querySelector<HTMLButtonElement>('.preset-filled-primary-500')!;
	expect(trigger.disabled).toBe(true);
});

function snapshot(): BroadcastSnapshot {
	const scope = {
		statistics: { scope: 'game' as const, gamesTotal: 0, gamesContributing: 0, players: [] },
		candidates: [],
		mvpPlayerId: null
	};
	return {
		version: 3,
		controlRevision: 12,
		dataRevision: 1,
		liveControls: {
			swapped: true,
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
			name: 'Game',
			number: 1,
			map: null,
			scoreA: null,
			scoreB: null,
			resultType: null,
			winnerEntryId: null
		},
		competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
		presentation: { leftEntryId: 'b', rightEntryId: 'a' },
		sides: {
			preparedAttackersEntryId: null,
			preparedDefendersEntryId: null,
			attackersEntryId: null,
			defendersEntryId: null,
			source: 'unknown'
		},
		teams: ['Alpha', 'Bravo'].map((name, index) => ({
			entryId: index ? 'b' : 'a',
			teamId: name,
			name,
			tag: name.slice(0, 3),
			logoPath: null,
			logoWhitePath: null,
			logoBlackPath: null
		})),
		lineups: [],
		veto: [],
		scopes: {
			game: scope,
			match: { ...scope, statistics: { ...scope.statistics, scope: 'match' } },
			tournament: { ...scope, statistics: { ...scope.statistics, scope: 'tournament' } }
		},
		controls: { visibility: defaultVisibility, playerStats: defaultPlayerStats, mvpScope: 'game' },
		readiness: { selected: true, map: false, lineups: false, agents: false, result: false },
		publications: Object.fromEntries(
			graphicIds.map((id) => [id, null])
		) as BroadcastSnapshot['publications']
	};
}

it('uses local competition entries and current revisions for immediate pause commands', async () => {
	const live = snapshot();
	const view = render(InGameMatchControls, { live, clock: { now: Date.now } });
	const tactical = page.getByRole('button', { name: 'Tactical Timeout · Alpha', exact: true });
	await expect.element(tactical).toBeEnabled();
	const payload = () =>
		JSON.parse(
			tactical.element().closest('form')!.querySelector<HTMLInputElement>('input[name="payload"]')!
				.value
		);
	expect(payload()).toMatchObject({
		expectedRevision: 12,
		intent: 'in-game',
		command: 'start-tactical',
		entryId: 'a'
	});
	await view.rerender({ live: { ...live, controlRevision: 13 } });
	expect(payload().expectedRevision).toBe(13);
});

it('shows pending Technical explicitly and offers only valid pause corrections', async () => {
	const live = snapshot();
	live.liveControls.pause = { type: 'tactical', entryId: 'b', pendingTechnical: true };
	const view = render(InGameMatchControls, { live, clock: { now: Date.now } });
	await expect
		.element(page.getByRole('button', { name: 'Tactical Timeout · Alpha', exact: true }))
		.toBeDisabled();
	await expect
		.element(page.getByRole('button', { name: 'Cancel Pending Technical Pause', exact: true }))
		.toBeEnabled();
	await expect
		.element(page.getByRole('button', { name: 'Finish Timeout', exact: true }))
		.toBeEnabled();
	expect(view.container.textContent).toContain('Technical Pause pending');
	expect(view.container.textContent).toContain('Bravo');
	await view.rerender({
		live: { ...live, liveControls: { ...live.liveControls, pause: { type: 'technical' } } }
	});
	await expect
		.element(page.getByRole('button', { name: 'Resume Match', exact: true }))
		.toBeEnabled();
	await expect
		.element(page.getByRole('button', { name: 'Technical Pause', exact: true }))
		.not.toBeInTheDocument();
});

it('gates ceremonies by active pause/event and keeps ceremony picks on the latest revision', async () => {
	const live = snapshot();
	const view = render(InGameMatchControls, { live, clock: { now: Date.now } });
	await page.getByRole('combobox', { name: 'Ceremony team', exact: true }).selectOptions('b');
	await page.getByRole('combobox', { name: 'Ceremony', exact: true }).selectOptions('clutch');
	await view.rerender({ live: { ...live, controlRevision: 14 } });
	const trigger = page.getByRole('button', { name: 'Trigger Ceremony', exact: true });
	const payload = JSON.parse(
		trigger.element().closest('form')!.querySelector<HTMLInputElement>('input[name="payload"]')!
			.value
	);
	expect(payload).toMatchObject({
		expectedRevision: 14,
		command: 'trigger-ceremony',
		entryId: 'b',
		ceremony: 'clutch'
	});
	await view.rerender({
		live: {
			...live,
			liveControls: {
				...live.liveControls,
				pause: { type: 'technical' },
				ceremony: { sequence: 14, type: 'clutch', entryId: 'b', triggeredAt: Date.now() }
			}
		}
	});
	await expect.element(trigger).toBeDisabled();
	await expect
		.element(page.getByRole('button', { name: 'Dismiss Ceremony', exact: true }))
		.toBeEnabled();
	expect(view.container.textContent).toContain('will display after the current ceremony');
});

it('disables team controls when no local game is selected', async () => {
	const live = snapshot();
	live.selection = null;
	render(InGameMatchControls, { live, clock: { now: Date.now } });
	await expect
		.element(page.getByRole('button', { name: 'Tactical Timeout · Alpha', exact: true }))
		.toBeDisabled();
	await expect
		.element(page.getByRole('button', { name: 'Trigger Ceremony', exact: true }))
		.toBeDisabled();
});

it('allows another ceremony at the original expiry without a new snapshot', async () => {
	const live = snapshot();
	live.liveControls.ceremony = {
		sequence: 12,
		type: 'round-win',
		entryId: 'a',
		triggeredAt: Date.now() - 5000
	};
	render(InGameMatchControls, { live, clock: { now: Date.now } });
	const trigger = page.getByRole('button', { name: 'Trigger Ceremony', exact: true });
	await expect.element(trigger).toBeDisabled();
	await expect.element(trigger).toBeEnabled();
});

it.each([7000, -5000])('gates ceremony controls on server time with %sms skew', async (offset) => {
	vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(10000 + offset);
	const receivedAt = performance.now();
	const clock = { now: () => 10000 + performance.now() - receivedAt };
	const live = snapshot();
	live.liveControls.ceremony = {
		sequence: 12,
		type: 'round-win',
		entryId: 'a',
		triggeredAt: 8000
	};
	const view = render(InGameMatchControls, { live, clock });
	const trigger = view.container.querySelector<HTMLButtonElement>('.preset-filled-primary-500')!;
	expect(trigger.disabled).toBe(true);
	await vi.advanceTimersByTimeAsync(3999);
	await tick();
	expect(trigger.disabled).toBe(true);
	await vi.advanceTimersByTimeAsync(1);
	await tick();
	expect(trigger.disabled).toBe(false);
	expect(view.container.textContent).not.toContain('Playing;');
});
