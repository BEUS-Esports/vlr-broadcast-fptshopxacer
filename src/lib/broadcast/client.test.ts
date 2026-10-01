import { expect, it } from 'vitest';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

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

it('retains newest complete state through malformed data, reconnect and disconnect', async () => {
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
		const send = (data: unknown) =>
			events.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify(data) }));
		send(snapshot);
		send({ ...snapshot, revision: 3 });
		send({ ...snapshot, revision: 2 });
		send({ ...snapshot, revision: 4, lineups: [null] });
		send({ ...snapshot, revision: 4, scopes: { ...snapshot.scopes, game: null } });
		expect(client.getState().snapshot?.revision).toBe(3);
		events.dispatchEvent(new Event('error'));
		expect(client.getState().connection).toBe('reconnecting');
		events.dispatchEvent(new Event('open'));
		send({ ...snapshot, revision: 5 });
		expect(client.getState().snapshot?.revision).toBe(5);
		client.disconnect();
		send({ ...snapshot, revision: 6 });
		expect(client.getState().snapshot?.revision).toBe(5);
		expect(opens).toBe(1);
		expect(closed).toBe(1);
		expect(states).toContain('reconnecting');
		unsubscribe();
	});
});
