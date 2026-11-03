import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { graphicIds } from './controls';
import LiveOutput from './LiveOutput.svelte';

it('owns two streams and one resource poller for seven transparent ordered layers, and cleans up', async () => {
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
		const view = render(LiveOutput, { graphics: graphicIds });
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
			[...output.querySelectorAll('[data-live-graphic]')].map((layer) =>
				layer.getAttribute('data-live-graphic')
			)
		).toEqual([
			'in-game',
			'map-veto',
			'player-lineup',
			'agent-select',
			'post-game',
			'player-stats',
			'mvp'
		]);
		for (const layer of output.querySelectorAll('[data-live-graphic]'))
			expect(getComputedStyle(layer).position).toBe('absolute');
		await view.rerender({ graphics: ['mvp'] });
		expect(view.container.querySelectorAll('[data-live-graphic]')).toHaveLength(1);
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
