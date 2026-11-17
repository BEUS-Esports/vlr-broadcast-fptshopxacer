import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SponsorLoop from './SponsorLoop.svelte';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('svelte/motion', async (importOriginal) => ({
	...(await importOriginal<typeof import('svelte/motion')>()),
	prefersReducedMotion: {
		get current() {
			return motion.reduced;
		}
	}
}));

// Real, loadable images: a failing URL would be retired by Asset's error handling mid-test.
const svg = (fill: string) =>
	`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${fill}"/></svg>`)}`;
const [a, b, c] = [svg('red'), svg('green'), svg('blue')];
const logos = [a, b, c];

// Only the interval is faked so the crossfade still runs on real time.
beforeEach(() => {
	motion.reduced = false;
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => vi.useRealTimers());

// Real time: only the interval is faked, so the 300 ms fade completes on the wall clock.
const fadeOut = () => new Promise((resolve) => setTimeout(resolve, 450));
const loop = (view: { container: HTMLElement }) =>
	view.container.querySelector<HTMLElement>('[data-sponsor-loop]');
const index = (view: { container: HTMLElement }) => loop(view)?.getAttribute('data-index');
const sources = (view: { container: HTMLElement }) =>
	[...view.container.querySelectorAll('img')].map((img) => img.getAttribute('src'));

it('cycles on the interval', async () => {
	const view = render(SponsorLoop, { logos, intervalMs: 5000 });
	expect(index(view)).toBe('0');
	expect(sources(view)).toEqual([a]);
	await vi.advanceTimersByTimeAsync(5000);
	expect(index(view)).toBe('1');
	await vi.advanceTimersByTimeAsync(5000);
	expect(index(view)).toBe('2');
	await vi.advanceTimersByTimeAsync(5000);
	expect(index(view)).toBe('0');
});

it('single logo is static', async () => {
	const view = render(SponsorLoop, { logos: [logos[0]], intervalMs: 5000 });
	await vi.advanceTimersByTimeAsync(20000);
	expect(index(view)).toBe('0');
	expect(sources(view)).toEqual([a]);
});

it('empty renders nothing', () => {
	const view = render(SponsorLoop, { logos: [], intervalMs: 5000 });
	expect(loop(view)).toBeNull();
});

it('same list on a new snapshot keeps position', async () => {
	const view = render(SponsorLoop, { logos, intervalMs: 5000 });
	await vi.advanceTimersByTimeAsync(10000);
	expect(index(view)).toBe('2');
	await view.rerender({ logos: [...logos], intervalMs: 5000 });
	expect(index(view)).toBe('2');
	// The running timer is kept: it still fires 5000 ms after the last switch.
	await vi.advanceTimersByTimeAsync(5000);
	expect(index(view)).toBe('0');
});

it('shrunk list wraps to a valid logo', async () => {
	const view = render(SponsorLoop, { logos, intervalMs: 5000 });
	await vi.advanceTimersByTimeAsync(10000);
	expect(index(view)).toBe('2');
	await view.rerender({ logos: logos.slice(0, 2), intervalMs: 5000 });
	expect(['0', '1']).toContain(index(view));
	await fadeOut();
	expect(sources(view)).toHaveLength(1);
	expect(logos.slice(0, 2)).toContain(sources(view)[0]);
});

it('interval change applies', async () => {
	const view = render(SponsorLoop, { logos, intervalMs: 5000 });
	await view.rerender({ logos, intervalMs: 2000 });
	await vi.advanceTimersByTimeAsync(1999);
	expect(index(view)).toBe('0');
	await vi.advanceTimersByTimeAsync(1);
	expect(index(view)).toBe('1');
});

it('crossfades between logos', async () => {
	const view = render(SponsorLoop, { logos, intervalMs: 5000 });
	await vi.advanceTimersByTimeAsync(5000);
	// The outgoing logo stays mounted while it fades out.
	expect([...sources(view)].sort()).toEqual([a, b].sort());
	await fadeOut();
	expect(sources(view)).toEqual([b]);
});

it('reduced motion swaps logos without a crossfade', async () => {
	motion.reduced = true;
	const view = render(SponsorLoop, { logos, intervalMs: 5000 });
	await vi.advanceTimersByTimeAsync(5000);
	expect(sources(view)).toEqual([b]);
});

it('a failed logo leaves no placeholder on air', async () => {
	const view = render(SponsorLoop, { logos: ['/missing-sponsor-logo.png'], intervalMs: 5000 });
	await vi.waitFor(() => expect(view.container.querySelector('img')).toBeNull());
	expect(view.container.querySelector('[role="img"]')).toBeNull();
	expect(loop(view)).not.toBeNull();
});
