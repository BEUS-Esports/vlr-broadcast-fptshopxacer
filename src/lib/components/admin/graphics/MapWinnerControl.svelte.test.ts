import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
import { preparedSnapshot } from '#lib/broadcast/templates/test-snapshot.ts';
import MapWinnerControl from './MapWinnerControl.svelte';

function withGame(game: Partial<NonNullable<BroadcastSnapshot['game']>>): BroadcastSnapshot {
	const base = preparedSnapshot();
	return { ...base, game: { ...base.game!, ...game } };
}
const button = (view: ReturnType<typeof render>) =>
	view.container.querySelector<HTMLButtonElement>('button')!;

it('disables Map winner until the game has a saved winner', () => {
	const view = render(MapWinnerControl, { live: withGame({ winnerEntryId: null }) });
	expect(button(view).textContent).toContain('Map winner');
	expect(button(view).disabled).toBe(true);
	expect(view.container.textContent).toContain('No result saved for this game yet');
});

it('shows the saved winner and score beside the button', () => {
	const live = withGame({
		number: 2,
		map: { ...preparedSnapshot().game!.map!, displayName: 'Ascent' },
		scoreA: 13,
		scoreB: 9,
		resultType: 'normal',
		winnerEntryId: 'a'
	});
	const view = render(MapWinnerControl, { live });
	expect(view.container.textContent).toContain('Game 2 · Ascent');
	expect(view.container.textContent).toContain('Team a won 13–9');
	expect(button(view).disabled).toBe(false);
});

it('shows 13–0 for the advancing team and never names forfeits or walkovers', () => {
	const view = render(MapWinnerControl, {
		live: withGame({ scoreA: null, scoreB: null, resultType: 'forfeit', winnerEntryId: 'b' })
	});
	expect(view.container.textContent).toContain('Team b won 13–0');
	expect(view.container.textContent).not.toMatch(/forfeit|walkover/i);
});

it('marks Map winner pressed while winner mode is live', () => {
	const base = withGame({ scoreA: 13, scoreB: 9, resultType: 'normal', winnerEntryId: 'a' });
	const view = render(MapWinnerControl, {
		live: { ...base, liveControls: { ...base.liveControls, lineupTeams: 'winner' } }
	});
	expect(button(view).getAttribute('aria-pressed')).toBe('true');
});

it('blocks Map winner while Lineup is on air with a result that is not published yet', () => {
	const live = withGame({ scoreA: 13, scoreB: 9, resultType: 'normal', winnerEntryId: 'a' });
	const published = { ...live, game: { ...live.game!, winnerEntryId: null } };
	const view = render(MapWinnerControl, {
		live: {
			...live,
			controls: {
				...live.controls,
				visibility: { ...live.controls.visibility, 'player-lineup': true }
			},
			publications: { ...live.publications, 'player-lineup': published }
		}
	});
	expect(button(view).disabled).toBe(true);
	expect(view.container.textContent?.replace(/\s+/g, ' ')).toContain(
		'Use Update or Update Live on Player Lineup to publish the result first'
	);
});

it('blocks Map winner while Lineup is live on the composite with a stale capture', () => {
	const live = withGame({ scoreA: 13, scoreB: 9, resultType: 'normal', winnerEntryId: 'a' });
	const published = { ...live, game: { ...live.game!, winnerEntryId: null } };
	const view = render(MapWinnerControl, {
		live: {
			...live,
			composite: {
				visibility: { ...live.composite.visibility, 'player-lineup': true },
				publications: { ...live.composite.publications, 'player-lineup': published }
			}
		}
	});
	expect(button(view).disabled).toBe(true);
	expect(view.container.textContent).toContain('Update Live on Player Lineup');
});
