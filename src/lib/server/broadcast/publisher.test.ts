import { expect, it, vi } from 'vitest';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it('serializes mutations, closes failed subscribers and rebuilds after a failed publication', async () => {
	await withManagementFixture(async () => {
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const base = await buildBroadcastSnapshot();
		const { createBroadcastPublisher } = await import('./publisher');
		let revision = 1;
		let fail = false;
		const order: string[] = [];
		const publisher = createBroadcastPublisher({
			build: async () => {
				order.push(`start:${revision}`);
				await Promise.resolve();
				order.push(`end:${revision}`);
				if (fail) throw new Error('read failed');
				return { ...base, revision };
			}
		});
		const values: number[] = [];
		let closed = 0;
		const unsubscribe = await publisher.subscribe({
			send: (snapshot) => values.push(snapshot.revision),
			close: () => {
				closed++;
			}
		});
		revision = 2;
		await Promise.all([publisher.publish(), publisher.publish()]);
		expect(values).toEqual([1, 2]);
		expect(order.slice(2)).toEqual(['start:2', 'end:2', 'start:2', 'end:2']);
		revision = 3;
		fail = true;
		await expect(publisher.publish()).rejects.toThrow('read failed');
		expect(closed).toBe(1);
		fail = false;
		const reconnect: number[] = [];
		const stop = await publisher.subscribe({
			send: (snapshot) => reconnect.push(snapshot.revision),
			close() {}
		});
		expect(reconnect).toEqual([3]);
		let brokenClosed = 0;
		await publisher.subscribe({
			send() {
				throw new Error('broken socket');
			},
			close() {
				brokenClosed++;
			}
		});
		expect(brokenClosed).toBe(1);
		unsubscribe();
		stop();
		revision = 4;
		await publisher.publish();
		expect(reconnect).toEqual([3]);
	});
});

it('streams immediate and full reconnect snapshots, heartbeats, and cancels/aborts cleanly', async () => {
	await withManagementFixture(async () => {
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const snapshot = await buildBroadcastSnapshot();
		const { createBroadcastPublisher, createBroadcastResponse } = await import('./publisher');
		const publisher = createBroadcastPublisher({
			build: async () => snapshot
		});
		vi.useFakeTimers();
		try {
			const abort = new AbortController();
			const response = createBroadcastResponse(publisher, abort.signal);
			expect(response.headers.get('content-type')).toBe('text/event-stream');
			expect(response.headers.get('content-encoding')).toBe('identity');
			const reader = response.body!.getReader();
			const first = new TextDecoder().decode((await reader.read()).value);
			expect(first).toContain('event: snapshot');
			expect(first).toContain('id: 1');
			expect(first).toContain('"revision":1');
			await vi.advanceTimersByTimeAsync(15000);
			expect(new TextDecoder().decode((await reader.read()).value)).toBe(': heartbeat\n\n');
			abort.abort();
			expect((await reader.read()).done).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
			const reconnect = createBroadcastResponse(publisher, new AbortController().signal);
			const reReader = reconnect.body!.getReader();
			expect(new TextDecoder().decode((await reReader.read()).value)).toContain('"revision":1');
			await reReader.cancel();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
