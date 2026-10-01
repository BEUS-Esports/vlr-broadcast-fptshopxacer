import { expect, it, vi } from 'vitest';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it('deduplicates persisted state, force-publishes volatile updates and rebuilds after failure', async () => {
	await withManagementFixture(async () => {
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const base = await buildBroadcastSnapshot();
		const { createBroadcastPublisher } = await import('./publisher');
		let dataRevision = 1;
		let fail = false;
		const order: string[] = [];
		const publisher = createBroadcastPublisher({
			epoch: 'test-epoch',
			build: async () => {
				order.push(`start:${dataRevision}`);
				await Promise.resolve();
				order.push(`end:${dataRevision}`);
				if (fail) throw new Error('read failed');
				return { ...base, dataRevision };
			}
		});
		const values: Array<{ dataRevision: number; sequence: number }> = [];
		let closed = 0;
		const unsubscribe = await publisher.subscribe({
			send: (snapshot, stream) =>
				values.push({ dataRevision: snapshot.dataRevision, sequence: stream.sequence }),
			close: () => {
				closed++;
			}
		});
		dataRevision = 2;
		await Promise.all([publisher.publish(), publisher.publish()]);
		expect(values).toEqual([
			{ dataRevision: 1, sequence: 1 },
			{ dataRevision: 2, sequence: 2 }
		]);
		expect(order.slice(2)).toEqual(['start:2', 'end:2', 'start:2', 'end:2']);
		await publisher.publish({ force: true });
		expect(values.at(-1)).toEqual({ dataRevision: 2, sequence: 3 });
		fail = true;
		await expect(publisher.publish()).rejects.toThrow('read failed');
		expect(closed).toBe(1);
		fail = false;
		dataRevision = 3;
		const reconnect: Array<{ dataRevision: number; sequence: number }> = [];
		const stop = await publisher.subscribe({
			send: (snapshot, stream) =>
				reconnect.push({ dataRevision: snapshot.dataRevision, sequence: stream.sequence }),
			close() {}
		});
		expect(reconnect).toEqual([{ dataRevision: 3, sequence: 4 }]);
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
		dataRevision = 4;
		await publisher.publish();
		expect(reconnect).toEqual([{ dataRevision: 3, sequence: 4 }]);
	});
});

it('streams versioned envelopes, heartbeats, and cancels/aborts cleanly', async () => {
	await withManagementFixture(async () => {
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const snapshot = await buildBroadcastSnapshot();
		const { createBroadcastPublisher, createBroadcastResponse } = await import('./publisher');
		const publisher = createBroadcastPublisher({
			epoch: 'response-test',
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
			expect(first).toContain('id: response-test:1');
			expect(first).toContain('"stream":{"epoch":"response-test","sequence":1}');
			expect(first).toContain('"controlRevision":1');
			await vi.advanceTimersByTimeAsync(15000);
			expect(new TextDecoder().decode((await reader.read()).value)).toBe(': heartbeat\n\n');
			abort.abort();
			expect((await reader.read()).done).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
			const reconnect = createBroadcastResponse(publisher, new AbortController().signal);
			const reReader = reconnect.body!.getReader();
			const next = new TextDecoder().decode((await reReader.read()).value);
			expect(next).toContain('id: response-test:1');
			expect(next).toContain('"controlRevision":1');
			await reReader.cancel();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
