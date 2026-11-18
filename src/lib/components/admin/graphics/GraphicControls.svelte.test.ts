import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
import { preparedSnapshot } from '#lib/broadcast/templates/test-snapshot.ts';
import GraphicControls from './GraphicControls.svelte';

function onComposite(capture: BroadcastSnapshot | null): BroadcastSnapshot {
	const live = preparedSnapshot();
	return {
		...live,
		dataRevision: 2,
		composite: {
			visibility: { ...live.composite.visibility, 'post-game': true },
			publications: { ...live.composite.publications, 'post-game': capture }
		}
	};
}

it('warns on the composite when saved data is newer than its capture', () => {
	const live = onComposite(null);
	const view = render(GraphicControls, {
		graphic: 'post-game',
		live: onComposite({ ...live, dataRevision: 1 })
	});
	expect(view.container.textContent).toContain(
		'Preview contains newer saved data or controls. Update Live to publish.'
	);
});

it('says composite content is unavailable when it has no capture', () => {
	const view = render(GraphicControls, { graphic: 'post-game', live: onComposite(null) });
	expect(view.container.textContent).toContain('Published content is unavailable. Use Update Live');
});

it('shows neither composite notice while the capture is current', () => {
	const live = onComposite(null);
	const view = render(GraphicControls, {
		graphic: 'post-game',
		live: onComposite({ ...live, dataRevision: 2 })
	});
	expect(view.container.textContent).not.toContain('Update Live to publish');
	expect(view.container.textContent).not.toContain('Published content is unavailable');
});
