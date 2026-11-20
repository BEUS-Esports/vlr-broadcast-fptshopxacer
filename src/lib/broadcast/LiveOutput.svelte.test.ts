import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { graphicIds, type GraphicId } from './controls';
import type { BroadcastPublications, BroadcastSnapshot } from './types';
import { emptyComposite, preparedSnapshot } from './templates/test-snapshot';
import LiveOutput from './LiveOutput.svelte';

it('owns two streams and one resource poller for three transparent ordered layers, and cleans up', async () => {
	const sources: Array<{ url: string; closed: boolean }> = [];
	class Source extends EventTarget {
		readyState = 1;
		closed = false;
		constructor(public url: string) {
			super();
			sources.push(this);
		}
		close() {
			this.closed = true;
		}
	}
	const fetchResources = vi.fn(
		async () => new Response(JSON.stringify({ agents: [], weapons: [] }))
	);
	vi.stubGlobal('EventSource', Source);
	vi.stubGlobal('fetch', fetchResources);
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
	try {
		const view = render(LiveOutput, { graphics: graphicIds, output: 'standalone' });
		await tick();
		expect(sources.map((source) => new URL(source.url, location.origin).pathname).sort()).toEqual([
			'/api/broadcast/events',
			'/api/live-game/events'
		]);
		expect(fetchResources).toHaveBeenCalledTimes(1);
		const output = view.container.querySelector('[data-live-output]')!;
		expect(getComputedStyle(output).width).toBe('1920px');
		expect(getComputedStyle(output).height).toBe('1080px');
		expect(getComputedStyle(output).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(
			[...output.querySelectorAll('[data-live-layer]')].map((layer) =>
				layer.getAttribute('data-live-layer')
			)
		).toEqual(['0', '1', '2']);
		for (const layer of output.querySelectorAll('[data-live-layer]'))
			expect(getComputedStyle(layer).position).toBe('absolute');
		await view.rerender({ graphics: ['mvp'], output: 'standalone' });
		expect(view.container.querySelectorAll('[data-live-layer]')).toHaveLength(1);
		expect(sources).toHaveLength(2);
		await view.unmount();
		expect(sources.every((source) => source.closed)).toBe(true);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetchResources).toHaveBeenCalledTimes(1);
	} finally {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	}
});

function compositeSnapshot(on: GraphicId, controlRevision = 1): BroadcastSnapshot {
	const base = preparedSnapshot();
	const prepared = {
		...base,
		controlRevision,
		tournament: { id: 't', name: 'T', slug: 'test' },
		match: {
			id: 'm',
			label: 'M',
			bestOf: 1,
			scoreA: 0,
			scoreB: 0,
			resultType: null,
			winnerEntryId: null
		}
	};
	const capture: Partial<BroadcastSnapshot> = { ...prepared };
	delete capture.publications;
	delete capture.composite;
	delete capture.sponsor;
	delete capture.stinger;
	return {
		...prepared,
		composite: {
			visibility: { ...emptyComposite.visibility, [on]: true },
			publications: { ...emptyComposite.publications, [on]: capture } as BroadcastPublications
		}
	};
}

async function mountComposite() {
	const sources = new Map<string, EventTarget>();
	class Source extends EventTarget {
		readyState = 1;
		constructor(url: string) {
			super();
			sources.set(url, this);
		}
		close() {}
	}
	vi.stubGlobal('EventSource', Source);
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({ agents: [], weapons: [] })))
	);
	const view = render(LiveOutput, { graphics: graphicIds, output: 'composite' });
	let sequence = 0;
	const send = async (snapshot: BroadcastSnapshot) => {
		sources.get('/api/broadcast/events')!.dispatchEvent(
			new MessageEvent('snapshot', {
				data: JSON.stringify({
					version: 1,
					stream: { epoch: 'e', sequence: ++sequence },
					snapshot
				})
			})
		);
		await tick();
	};
	return { view, send };
}

const graphicLayer = (container: Element, graphic: string) =>
	container.querySelector<HTMLElement>(`[data-graphic="${graphic}"]`);

it('mounts on-air layers on first snapshot', async () => {
	const { view, send } = await mountComposite();
	try {
		await send(compositeSnapshot('mvp'));
		await expect.poll(() => graphicLayer(view.container, 'mvp')).not.toBeNull();
		expect(view.container.querySelectorAll('[data-graphic="mvp"] > div')).toHaveLength(1);
		const wrapper = view.container.querySelector('[data-graphic="mvp"] > div')!;
		await expect.poll(() => getComputedStyle(wrapper).opacity).toBe('1');
	} finally {
		await view.unmount();
		vi.unstubAllGlobals();
	}
});

it('keeps the outgoing graphic until its stop resolves', async () => {
	const { view, send } = await mountComposite();
	try {
		await send(compositeSnapshot('post-game'));
		await expect.poll(() => graphicLayer(view.container, 'post-game')).not.toBeNull();
		await expect
			.poll(
				() =>
					getComputedStyle(view.container.querySelector('[data-graphic="post-game"] > div')!)
						.opacity
			)
			.toBe('1');
		await send(compositeSnapshot('mvp', 2));
		// The content wrapper (not the outer data-graphic div) must stay, frozen and still visible, during stop.
		const outgoing = view.container.querySelector<HTMLElement>('[data-graphic="post-game"] > div');
		expect(outgoing).not.toBeNull();
		expect(Number(getComputedStyle(outgoing!).opacity)).toBeGreaterThan(0);
		expect(graphicLayer(view.container, 'mvp')).toBeNull();
		await expect.poll(() => graphicLayer(view.container, 'mvp')).not.toBeNull();
		expect(graphicLayer(view.container, 'post-game')).toBeNull();
		const incoming = view.container.querySelector<HTMLElement>('[data-graphic="mvp"] > div');
		expect(incoming).not.toBeNull();
		await expect.poll(() => getComputedStyle(incoming!).opacity).toBe('1');
	} finally {
		await view.unmount();
		vi.unstubAllGlobals();
	}
});
