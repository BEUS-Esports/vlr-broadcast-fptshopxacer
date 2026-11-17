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
