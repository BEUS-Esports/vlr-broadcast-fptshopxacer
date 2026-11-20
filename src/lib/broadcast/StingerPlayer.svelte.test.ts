import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import webmUrl from './fixtures/stinger.webm?url';
import webpUrl from './fixtures/stinger.webp?url';
import StingerPlayer from './StingerPlayer.svelte';
import { STINGER_END_MARGIN_MS, STINGER_START_TIMEOUT_MS, type BroadcastStinger } from './stinger';

const video = (overrides: Partial<BroadcastStinger> = {}): BroadcastStinger => ({
	path: webmUrl,
	kind: 'video',
	durationMs: 1000,
	cutPointMs: 500,
	...overrides
});
const image = (overrides: Partial<BroadcastStinger> = {}): BroadcastStinger => ({
	path: webpUrl,
	kind: 'image',
	durationMs: 800,
	cutPointMs: 400,
	...overrides
});

function mount(stinger: BroadcastStinger | null) {
	const view = render(StingerPlayer, { stinger, z: 10 });
	const root = view.container.querySelector<HTMLElement>('[data-stinger]')!;
	const playingAt: number[] = [];
	root.addEventListener('playing', () => playingAt.push(performance.now()), true);
	return { view, root, playingAt };
}

it('is hidden while idle', () => {
	const { root } = mount(video());
	expect(getComputedStyle(root).visibility).toBe('hidden');
	expect(root.querySelector('video')).not.toBeNull();
});

it('cuts once ~cutPointMs after playback starts and resolves after the video ends', async () => {
	const { view, root, playingAt } = mount(video());
	const cuts: number[] = [];
	const onCut = vi.fn(async () => void cuts.push(performance.now()));
	const running = view.component.run(onCut);
	await expect.poll(() => getComputedStyle(root).visibility).toBe('visible');
	await expect(running).resolves.toBe(true);
	expect(onCut).toHaveBeenCalledTimes(1);
	expect(Math.abs(cuts[0] - playingAt[0] - 500)).toBeLessThan(100);
	expect(getComputedStyle(root).visibility).toBe('hidden');
});

it.each([0, 1000])(
	'cuts exactly once with cutPointMs %i and still resolves',
	async (cutPointMs) => {
		const { view } = mount(video({ cutPointMs }));
		const onCut = vi.fn(async () => {});
		await expect(view.component.run(onCut)).resolves.toBe(true);
		expect(onCut).toHaveBeenCalledTimes(1);
	}
);

it('resolves false without cutting when the file is missing', async () => {
	const { view } = mount(video({ path: '/assets/does-not-exist.webm' }));
	const onCut = vi.fn(async () => {});
	const started = performance.now();
	await expect(view.component.run(onCut)).resolves.toBe(false);
	expect(performance.now() - started).toBeLessThan(STINGER_START_TIMEOUT_MS + 200);
	expect(onCut).not.toHaveBeenCalled();
});

it('resolves false immediately without a stinger', async () => {
	const { view } = mount(null);
	const onCut = vi.fn(async () => {});
	await expect(view.component.run(onCut)).resolves.toBe(false);
	expect(onCut).not.toHaveBeenCalled();
	expect(view.container.querySelector('video, img')).toBeNull();
});

it('refuses a second run while one is playing', async () => {
	const { view } = mount(video());
	const first = view.component.run(async () => {});
	const onCut = vi.fn(async () => {});
	await expect(view.component.run(onCut)).resolves.toBe(false);
	expect(onCut).not.toHaveBeenCalled();
	await expect(first).resolves.toBe(true);
});

it('still resolves when onCut throws', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const { view } = mount(video());
		await expect(
			view.component.run(async () => {
				throw new Error('boom');
			})
		).resolves.toBe(true);
		expect(warn).toHaveBeenCalled();
	} finally {
		warn.mockRestore();
	}
});

it('restarts an image stinger on every run', async () => {
	const { view, root } = mount(image());
	for (let run = 0; run < 2; run++) {
		const onCut = vi.fn(async () => {});
		const running = view.component.run(onCut);
		await expect.poll(() => root.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/);
		await expect(running).resolves.toBe(true);
		expect(onCut).toHaveBeenCalledTimes(1);
		expect(root.querySelector('img')).toBeNull();
	}
});

it('resolves false for an image that cannot be fetched', async () => {
	const { view } = mount(image({ path: '/assets/does-not-exist.webp' }));
	const onCut = vi.fn(async () => {});
	await expect(view.component.run(onCut)).resolves.toBe(false);
	expect(onCut).not.toHaveBeenCalled();
});

it('resolves once the end cap passes even if onCut hangs', async () => {
	const { view } = mount(video());
	const started = performance.now();
	const onCut = vi.fn(() => new Promise<void>(() => {}));
	await expect(view.component.run(onCut)).resolves.toBe(true);
	const elapsed = performance.now() - started;
	expect(onCut).toHaveBeenCalledTimes(1);
	expect(elapsed).toBeGreaterThanOrEqual(1000 + STINGER_END_MARGIN_MS - 100);
	expect(elapsed).toBeLessThan(1000 + STINGER_END_MARGIN_MS + STINGER_START_TIMEOUT_MS);
});
