import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it('publishes preparation once and controls without a second revision, and leaves failure/GET alone', async () => {
	await withManagementFixture(async ({ db }) => {
		const { handle } = await import('../../../hooks.server');
		const { getBroadcastState, updateBroadcastState } = await import('../services/broadcast');
		const { broadcastPublisher } = await import('./publisher');
		const revisions: number[] = [];
		const stop = await broadcastPublisher.subscribe({
			send: (snapshot) => revisions.push(snapshot.revision),
			close() {}
		});
		const run = async (route: string, method = 'POST', type = 'success') =>
			handle({
				event: {
					route: { id: route },
					request: new Request(`http://localhost${route}`, { method })
				},
				resolve: async () =>
					new Response(JSON.stringify({ type }), {
						headers: { 'content-type': 'application/json' }
					})
			} as unknown as Parameters<typeof handle>[0]);
		await db.update(s.teams).set({ name: 'Changed branding' }).where(eq(s.teams.id, 'team-a'));
		await run('/admin/teams');
		expect((await getBroadcastState()).revision).toBe(2);
		await updateBroadcastState({ expectedRevision: 2, visibility: { mvp: true } });
		await run('/admin/graphics');
		expect((await getBroadcastState()).revision).toBe(3);
		await run('/admin/teams', 'POST', 'failure');
		await run('/admin/games/[gameId]', 'GET');
		expect((await getBroadcastState()).revision).toBe(3);
		expect(revisions).toEqual([1, 2, 3]);
		stop();
	});
});
