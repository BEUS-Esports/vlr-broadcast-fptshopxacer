import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import Asset from './Asset.svelte';

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
afterEach(() => vi.useRealTimers());

it('recovers a transient error without reload and preserves its native URL', async () => {
	vi.useFakeTimers();
	const view = render(Asset, { path: pixel, label: 'Portrait' });
	view.container.querySelector('img')!.dispatchEvent(new Event('error'));
	await tick();
	expect(view.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
		'Portrait: image unavailable'
	);
	await vi.advanceTimersByTimeAsync(999);
	await tick();
	expect(view.container.querySelector('img')).toBeNull();
	await vi.advanceTimersByTimeAsync(1);
	await tick();
	expect(view.container.querySelector('img')?.getAttribute('src')).toBe(pixel);
	view.container.querySelector('img')!.dispatchEvent(new Event('load'));
	await vi.advanceTimersByTimeAsync(30000);
	await tick();
	expect(view.container.querySelector('img')).not.toBeNull();
});

it('stops after three retries while preserving the placeholder or blankMissing behavior', async () => {
	vi.useFakeTimers();
	const view = render(Asset, { path: pixel, label: 'Portrait', blankMissing: true });
	for (const delay of [1000, 5000, 15000]) {
		view.container.querySelector('img')!.dispatchEvent(new Event('error'));
		await tick();
		expect(view.container.querySelector('[role="img"]')).toBeNull();
		await vi.advanceTimersByTimeAsync(delay);
		await tick();
		expect(view.container.querySelector('img')).not.toBeNull();
	}
	view.container.querySelector('img')!.dispatchEvent(new Event('error'));
	await tick();
	await vi.advanceTimersByTimeAsync(60000);
	await tick();
	expect(view.container.querySelector('img')).toBeNull();
});

it('resets the retry budget on URL change and cancels stale retries on change or unmount', async () => {
	vi.useFakeTimers();
	const view = render(Asset, { path: pixel, label: 'Old' });
	view.container.querySelector('img')!.dispatchEvent(new Event('error'));
	await tick();
	const changed = pixel + '#new';
	await view.rerender({ path: changed, label: 'New' });
	const replacement = view.container.querySelector('img');
	await vi.advanceTimersByTimeAsync(1000);
	await tick();
	expect(view.container.querySelector('img')).toBe(replacement);
	view.container.querySelector('img')!.dispatchEvent(new Event('error'));
	await tick();
	await vi.advanceTimersByTimeAsync(1000);
	await tick();
	expect(view.container.querySelector('img')?.getAttribute('src')).toBe(changed);
	const scheduled = vi.spyOn(globalThis, 'setTimeout');
	const cleared = vi.spyOn(globalThis, 'clearTimeout');
	view.container.querySelector('img')!.dispatchEvent(new Event('error'));
	await tick();
	const retryIndex = scheduled.mock.calls.findIndex((call) => call[1] === 5000);
	expect(retryIndex).toBeGreaterThanOrEqual(0);
	const retryTimer = scheduled.mock.results[retryIndex].value;
	await view.unmount();
	expect(cleared).toHaveBeenCalledWith(retryTimer);
	scheduled.mockRestore();
	cleared.mockRestore();
});
