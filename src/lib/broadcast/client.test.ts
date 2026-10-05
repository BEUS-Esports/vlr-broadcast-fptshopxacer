import { expect, it, vi } from 'vitest';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it.each([7000, -5000])('tracks server time despite a %sms local clock offset', async (offset) => {
	const { createBroadcastClient } = await import('./client');
	const events = Object.assign(new EventTarget(), { readyState: 0, close() {} });
	const client = createBroadcastClient({ eventSource: () => events });
	const wallClock = vi.spyOn(Date, 'now').mockReturnValue(10000 + offset);
	const monotonicClock = vi.spyOn(performance, 'now').mockReturnValue(100);
	try {
		client.connect();
		expect(client.getState().clock).toBeNull();
		events.dispatchEvent(new MessageEvent('clock', { data: '10000' }));
		expect(client.getState().clock?.now()).toBe(10000);
		monotonicClock.mockReturnValue(2100);
		wallClock.mockReturnValue(999999);
		expect(client.getState().clock?.now()).toBe(12000);
		for (const data of ['null', '"10000"', '-1', '1.5', '{}', 'not json']) {
			events.dispatchEvent(new MessageEvent('clock', { data }));
			expect(client.getState().clock?.now()).toBe(12000);
		}
		// Heartbeats/reconnects refresh time even when the snapshot cursor is unchanged.
		events.dispatchEvent(new MessageEvent('clock', { data: '13000' }));
		expect(client.getState().clock?.now()).toBe(13000);
		client.disconnect();
		events.dispatchEvent(new MessageEvent('clock', { data: '20000' }));
		expect(client.getState().clock?.now()).toBe(13000);
	} finally {
		client.disconnect();
		wallClock.mockRestore();
		monotonicClock.mockRestore();
	}
});

it('allows explicit reconnect after EventSource permanently closes', async () => {
	const { createBroadcastClient } = await import('./client');
	const events = Object.assign(new EventTarget(), { readyState: 0, close() {} });
	let opens = 0;
	const client = createBroadcastClient({
		eventSource: () => {
			opens++;
			return events;
		}
	});
	client.connect();
	client.connect();
	expect(opens).toBe(1);
	events.readyState = 2;
	events.dispatchEvent(new Event('error'));
	expect(client.getState().connection).toBe('disconnected');
	events.readyState = 0;
	client.connect();
	expect(opens).toBe(2);
	client.disconnect();
});

it('orders complete snapshots by stream cursor rather than persisted revisions', async () => {
	await withManagementFixture(async () => {
		const { buildBroadcastSnapshot } = await import('../server/broadcast/snapshot');
		const snapshot = await buildBroadcastSnapshot();
		const { createBroadcastClient } = await import('./client');
		const events = new EventTarget();
		let closed = 0;
		let opens = 0;
		const client = createBroadcastClient({
			eventSource: () => {
				opens++;
				return Object.assign(events, {
					close() {
						closed++;
					},
					readyState: 0
				});
			}
		});
		const states: string[] = [];
		const unsubscribe = client.subscribe((state) => states.push(state.connection));
		client.connect();
		client.connect();
		events.dispatchEvent(new Event('open'));
		const send = (stream: { epoch: string; sequence: number }, next = snapshot) =>
			events.dispatchEvent(
				new MessageEvent('snapshot', {
					data: JSON.stringify({ version: 1, stream, snapshot: next })
				})
			);
		send({ epoch: 'one', sequence: 1 });
		// Same persisted revisions are valid for volatile provider updates when stream ordering advances.
		send({ epoch: 'one', sequence: 3 });
		send({ epoch: 'one', sequence: 2 }, { ...snapshot, controlRevision: 99 });
		send({ epoch: 'one', sequence: 4 }, {
			...snapshot,
			lineups: [null]
		} as unknown as typeof snapshot);
		expect(client.getState().cursor).toEqual({ epoch: 'one', sequence: 3 });
		expect(client.getState().snapshot?.controlRevision).toBe(snapshot.controlRevision);
		events.dispatchEvent(new Event('error'));
		expect(client.getState().connection).toBe('reconnecting');
		events.dispatchEvent(new Event('open'));
		// Process restart: a new epoch can restart the numeric sequence.
		send({ epoch: 'two', sequence: 1 }, { ...snapshot, controlRevision: 2 });
		expect(client.getState().cursor).toEqual({ epoch: 'two', sequence: 1 });
		expect(client.getState().snapshot?.controlRevision).toBe(2);
		client.disconnect();
		send({ epoch: 'two', sequence: 2 }, { ...snapshot, controlRevision: 3 });
		expect(client.getState().snapshot?.controlRevision).toBe(2);
		expect(opens).toBe(1);
		expect(closed).toBe(1);
		expect(states).toContain('reconnecting');
		unsubscribe();
	});
});
