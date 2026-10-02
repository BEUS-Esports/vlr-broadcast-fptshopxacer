import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it('invalidates prepared data in its original transaction and recovers a missed publication on reconnect', async () => {
	await withManagementFixture(async ({ db }) => {
		const { getBroadcastState } = await import('../services/broadcast');
		await getBroadcastState();
		await expect(
			db.transaction(async (tx) => {
				await tx.update(s.teams).set({ name: 'Uncommitted' }).where(eq(s.teams.id, 'team-a'));
				expect((await tx.select().from(s.broadcastState))[0].dataRevision).toBe(2);
				throw new Error('rollback');
			})
		).rejects.toThrow('rollback');
		expect((await getBroadcastState()).dataRevision).toBe(1);
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const { createBroadcastPublisher } = await import('./publisher');
		const { createBroadcastClient } = await import('../../broadcast/client');
		const events = new EventTarget();
		const client = createBroadcastClient({
			eventSource: () => Object.assign(events, { readyState: 0, close() {} })
		});
		client.connect();
		let fail = false;
		const publisher = createBroadcastPublisher({
			build: async () => {
				if (fail) throw new Error('publication failed');
				return buildBroadcastSnapshot();
			}
		});
		const revisions: number[] = [];
		const receive = (
			snapshot: Awaited<ReturnType<typeof buildBroadcastSnapshot>>,
			stream: { epoch: string; sequence: number }
		) => {
			revisions.push(snapshot.dataRevision);
			events.dispatchEvent(
				new MessageEvent('snapshot', {
					data: JSON.stringify({ version: 1, stream, snapshot })
				})
			);
		};
		await publisher.subscribe({ send: receive, close() {} });
		await db.update(s.teams).set({ name: 'Committed' }).where(eq(s.teams.id, 'team-a'));
		expect((await getBroadcastState()).dataRevision).toBe(2);
		fail = true;
		await expect(publisher.publish()).rejects.toThrow('publication failed');
		fail = false;
		const stop = await publisher.subscribe({ send: receive, close() {} });
		expect(revisions).toEqual([1, 2]);
		expect(client.getState().snapshot?.dataRevision).toBe(2);
		expect(client.getState().snapshot?.controlRevision).toBe(1);
		client.disconnect();
		stop();
	});
});
