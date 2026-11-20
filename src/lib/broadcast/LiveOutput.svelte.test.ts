import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { graphicIds, type GraphicId } from './controls';
import type { BroadcastPublications, BroadcastSnapshot } from './types';
import { emptyComposite, preparedSnapshot } from './templates/test-snapshot';
import LiveOutput from './LiveOutput.svelte';
import * as templates from './templates';
import StubTemplate, { hooks } from './GraphicRenderer.stub.svelte';
import webmUrl from './fixtures/stinger.webm?url';
import type { BroadcastStinger } from './stinger';

vi.mock('./templates', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./templates')>();
	return { ...actual, resolveGraphicTemplate: vi.fn(actual.resolveGraphicTemplate) };
});

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

function compositeSnapshot(
	on: GraphicId | GraphicId[],
	controlRevision = 1,
	stinger: BroadcastStinger | null = null
): BroadcastSnapshot {
	const onAir = [on].flat();
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
		stinger,
		composite: {
			visibility: {
				...emptyComposite.visibility,
				...Object.fromEntries(onAir.map((graphic) => [graphic, true]))
			},
			publications: {
				...emptyComposite.publications,
				...Object.fromEntries(onAir.map((graphic) => [graphic, capture]))
			} as BroadcastPublications
		}
	};
}

async function mountComposite(output: 'composite' | 'standalone' = 'composite') {
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
	const view = render(LiveOutput, { graphics: graphicIds, output });
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

const stinger: BroadcastStinger = {
	path: webmUrl,
	kind: 'video',
	durationMs: 1000,
	cutPointMs: 500
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const slow = { timeout: 5000 };

// Renders graphics with the recording stub template and tracks when the stinger video starts playing.
async function withStubbedGraphics(
	run: (ctx: Awaited<ReturnType<typeof mountComposite>>) => Promise<void>,
	output: 'composite' | 'standalone' = 'composite'
) {
	const resolve = vi.mocked(templates.resolveGraphicTemplate);
	const original = resolve.getMockImplementation()!;
	resolve.mockImplementation((slug) => ({ ...original(slug), component: StubTemplate as never }));
	hooks.events.length = 0;
	const ctx = await mountComposite(output);
	ctx.view.container.addEventListener('playing', () => hooks.events.push('stinger'), true);
	try {
		await run(ctx);
	} finally {
		await ctx.view.unmount();
		vi.unstubAllGlobals();
		resolve.mockImplementation(original);
	}
}

it('plays the stinger between stop and mount when layer 1 swaps', async () => {
	await withStubbedGraphics(async ({ send }) => {
		await send(compositeSnapshot('post-game', 1, stinger));
		await expect.poll(() => hooks.events, slow).toContain('play:post-game');
		hooks.events.length = 0;
		await send(compositeSnapshot('mvp', 2, stinger));
		await expect.poll(() => hooks.events, slow).toContain('play:mvp');
		expect(hooks.events).toEqual(['stop:post-game', 'stinger', 'mount:mvp', 'play:mvp']);
	});
});

it('mounts without a stinger on the first snapshot the page sees', async () => {
	await withStubbedGraphics(async ({ view, send }) => {
		await send(compositeSnapshot('mvp', 1, stinger));
		await expect.poll(() => hooks.events, slow).toContain('play:mvp');
		await wait(300);
		expect(hooks.events).toEqual(['mount:mvp', 'play:mvp']);
		const root = view.container.querySelector<HTMLElement>('[data-stinger]')!;
		expect(getComputedStyle(root).visibility).toBe('hidden');
	});
});

// The same on-air graphic, expressed through the standalone (controls + publications) path.
function standaloneSnapshot(on: GraphicId, controlRevision: number): BroadcastSnapshot {
	const composite = compositeSnapshot(on, controlRevision, stinger);
	return {
		...composite,
		controls: {
			...composite.controls,
			visibility: { ...composite.controls.visibility, [on]: true }
		},
		publications: { ...composite.publications, [on]: composite.composite.publications[on] }
	};
}

it('does not render or use a stinger on a standalone output', async () => {
	await withStubbedGraphics(async ({ view, send }) => {
		await send(standaloneSnapshot('post-game', 1));
		await expect.poll(() => hooks.events, slow).toContain('play:post-game');
		await send(standaloneSnapshot('mvp', 2));
		await expect.poll(() => hooks.events, slow).toContain('play:mvp');
		expect(view.container.querySelector('[data-stinger]')).toBeNull();
		expect(hooks.events).not.toContain('stinger');
	}, 'standalone');
});

it('does not play a stinger for layer 0 or layer 2 changes', async () => {
	await withStubbedGraphics(async ({ send }) => {
		await send(compositeSnapshot('mvp', 1, stinger));
		await expect.poll(() => hooks.events, slow).toContain('play:mvp');
		await send(compositeSnapshot(['mvp', 'in-game'], 2, stinger));
		await expect.poll(() => hooks.events, slow).toContain('play:in-game');
		await send(compositeSnapshot(['mvp', 'agent-select'], 3, stinger));
		await expect.poll(() => hooks.events, slow).toContain('play:agent-select');
		await wait(300);
		expect(hooks.events).not.toContain('stinger');
		expect(hooks.events).toContain('stop:in-game');
		expect(hooks.events.filter((event) => event === 'mount:mvp')).toHaveLength(1);
	});
});

it('falls back to a plain exit and enter once the snapshot has no stinger', async () => {
	await withStubbedGraphics(async ({ send }) => {
		await send(compositeSnapshot('post-game', 1, stinger));
		await expect.poll(() => hooks.events, slow).toContain('play:post-game');
		hooks.events.length = 0;
		await send(compositeSnapshot('mvp', 2, null));
		await expect.poll(() => hooks.events, slow).toContain('play:mvp');
		expect(hooks.events).toEqual(['stop:post-game', 'mount:mvp', 'play:mvp']);
	});
});

it('falls back to a plain swap when the stinger file cannot play', async () => {
	await withStubbedGraphics(async ({ send }) => {
		const broken = { ...stinger, path: '/assets/does-not-exist.webm' };
		await send(compositeSnapshot('post-game', 1, broken));
		await expect.poll(() => hooks.events, slow).toContain('play:post-game');
		hooks.events.length = 0;
		await send(compositeSnapshot('mvp', 2, broken));
		await expect.poll(() => hooks.events, slow).toContain('play:mvp');
		expect(hooks.events).toEqual(['stop:post-game', 'mount:mvp', 'play:mvp']);
	});
});
