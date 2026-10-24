import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import type { LiveResources } from './selectors';
import { liveResources } from './resources.svelte';

const cleanups: (() => void)[] = [];
function observe() {
	const values: (LiveResources | null)[] = [];
	const stop = $effect.root(() => {
		$effect(() => {
			values[values.length] = liveResources.current;
		});
	});
	flushSync();
	cleanups.push(stop);
	return { values, stop };
}
const resources = (path: string) => ({
	agents: [],
	weapons: [{ key: 'classic', displayName: 'Classic', displayIconPath: path }]
});
function json(body: unknown) {
	const response = Response.json(body);
	vi.spyOn(response, 'json').mockResolvedValue(body);
	return response;
}
beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(async () => {
	for (const stop of cleanups.splice(0)) stop();
	await tick();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('shares one refresh loop and stops after the last reactive reader leaves', async () => {
	let current = resources('/assets/old.png');
	const fetcher = vi
		.fn(async () => json(current))
		.mockResolvedValueOnce(new Response(null, { status: 503 }));
	vi.stubGlobal('fetch', fetcher);
	expect(liveResources.current).toBeNull();
	expect(fetcher).not.toHaveBeenCalled();
	const first = observe(),
		second = observe();
	await vi.advanceTimersByTimeAsync(0);
	expect(first.values.at(-1)).toBeNull();
	await vi.advanceTimersByTimeAsync(5000);
	expect(first.values.at(-1)).toEqual(current);
	expect(second.values.at(-1)).toEqual(current);
	expect(fetcher).toHaveBeenCalledTimes(2);
	expect(fetcher).toHaveBeenCalledWith('/api/live-game/resources', {
		cache: 'no-store',
		signal: expect.any(AbortSignal)
	});
	first.stop();
	current = resources('/assets/new.png');
	await vi.advanceTimersByTimeAsync(30_000);
	expect(second.values.at(-1)).toEqual(current);
	expect(first.values.at(-1)).not.toEqual(current);
	expect(fetcher).toHaveBeenCalledTimes(3);
	second.stop();
	await tick();
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each(['http', 'json', 'shape', 'network'])(
	'retries an initial %s failure and retains good artwork during a later failure',
	async (failure) => {
		let failing = true;
		const current = resources('/assets/recovered.png');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				if (!failing) return json(current);
				if (failure === 'http') return new Response(null, { status: 503 });
				if (failure === 'json') {
					const response = new Response('{');
					vi.spyOn(response, 'json').mockRejectedValue(new SyntaxError('Invalid JSON'));
					return response;
				}
				if (failure === 'shape') return json({ agents: [] });
				throw new Error('Offline');
			})
		);
		const cached = liveResources.current;
		const { values } = observe();
		await vi.advanceTimersByTimeAsync(0);
		expect(values.at(-1)).toEqual(cached);
		failing = false;
		await vi.advanceTimersByTimeAsync(5000);
		expect(values.at(-1)).toEqual(current);
		failing = true;
		await vi.advanceTimersByTimeAsync(30_000);
		expect(values.at(-1)).toEqual(current);
		expect(values).toHaveLength(2);
	}
);

it('times out a stalled fetch before retrying without overlapping requests', async () => {
	let signal: AbortSignal | undefined;
	const fetcher = vi
		.fn<typeof fetch>()
		.mockImplementationOnce(
			async (_url, init) =>
				new Promise((_resolve, reject) => {
					signal = init?.signal as AbortSignal;
					signal.addEventListener('abort', () => reject(signal?.reason), { once: true });
				})
		)
		.mockImplementation(async () => json(resources('/assets/retry.png')));
	vi.stubGlobal('fetch', fetcher);
	const { values } = observe();
	await vi.advanceTimersByTimeAsync(5000);
	expect(signal?.aborted).toBe(true);
	expect(fetcher).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(5000);
	expect(fetcher).toHaveBeenCalledTimes(2);
	expect(values.at(-1)).toEqual(resources('/assets/retry.png'));
});

it('cancels when readers leave and ignores a late response after a new reader arrives', async () => {
	const pending = Promise.withResolvers<Response>();
	let signal: AbortSignal | undefined;
	vi.stubGlobal(
		'fetch',
		vi
			.fn<typeof fetch>()
			.mockImplementationOnce(async (_url, init) => {
				signal = init?.signal as AbortSignal;
				return pending.promise;
			})
			.mockImplementation(async () => json(resources('/assets/new.png')))
	);
	const cached = liveResources.current;
	const old = observe();
	old.stop();
	await tick();
	expect(signal?.aborted).toBe(true);
	expect(vi.getTimerCount()).toBe(0);
	const { values } = observe();
	await vi.advanceTimersByTimeAsync(0);
	pending.resolve(json(resources('/assets/old.png')));
	await vi.advanceTimersByTimeAsync(0);
	expect(old.values).toEqual([cached]);
	expect(values.at(-1)).toEqual(resources('/assets/new.png'));
	expect(values).toHaveLength(2);
	expect(vi.getTimerCount()).toBe(1);
});
