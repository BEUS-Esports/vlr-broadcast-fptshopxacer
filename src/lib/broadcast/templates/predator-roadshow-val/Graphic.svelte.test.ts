import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { graphicIds } from '../../controls';
import { resolveGraphicTemplate } from '../../templates';
import { preparedSnapshot } from '../test-snapshot';
import Graphic from './Graphic.svelte';

it.each(graphicIds)('renders %s with and without a selection', (graphic) => {
	const view = render(Graphic, { snapshot: preparedSnapshot(), graphic });
	expect(view.container.innerHTML).not.toBe('');
	const empty = render(Graphic, { snapshot: { ...preparedSnapshot(), selection: null }, graphic });
	if (graphic !== 'in-game') expect(empty.container.textContent).toContain('WAITING FOR MATCH');
});

it('resolves stop slugs to this template', () => {
	expect(resolveGraphicTemplate('predator-roadshow-val-dong-nai').id).toBe('predator-roadshow-val');
});

function lineup(
	lineupTeams: 'both' | 'team-a' | 'team-b' | 'winner',
	winnerEntryId: string | null = null
) {
	const base = preparedSnapshot();
	return {
		...base,
		liveControls: { ...base.liveControls, lineupTeams },
		game: { ...base.game!, winnerEntryId }
	};
}

it('shows the five cards of one team with TAG NAME plates', () => {
	const view = render(Graphic, { snapshot: lineup('team-a'), graphic: 'player-lineup' });
	expect(view.container.querySelectorAll('[data-position]')).toHaveLength(1);
	expect(view.container.querySelectorAll('[data-slot]')).toHaveLength(5);
	expect(view.container.textContent).toContain('a First A');
	expect(view.container.querySelector('img[alt="Roadshow"]')).not.toBeNull();
});

it('shows the map winner under a WINNER title without the Roadshow lockup', () => {
	const view = render(Graphic, { snapshot: lineup('winner', 'b'), graphic: 'player-lineup' });
	expect(view.container.textContent).toContain('WINNER');
	expect(view.container.textContent).toContain('First B');
	expect(view.container.querySelector('[data-entry-id="a"]')).toBeNull();
	expect(view.container.querySelector('img[alt="Roadshow"]')).toBeNull();
	expect(view.container.querySelector('img[alt="Predator"]')).not.toBeNull();
});

it('shows both teams', () => {
	const view = render(Graphic, { snapshot: lineup('both'), graphic: 'player-lineup' });
	expect(view.container.querySelectorAll('[data-position]')).toHaveLength(2);
	expect(view.container.querySelectorAll('[data-slot]')).toHaveLength(10);
});
