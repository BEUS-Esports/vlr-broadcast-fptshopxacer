import { expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it('publishes committed maps after a later catalogue failure and leaves a rolled-back refresh unchanged', async () => {
	await withManagementFixture(async ({ db, client }) => {
		const uuid = '11111111-1111-4111-8111-111111111111';
		await db
			.update(s.maps)
			.set({ valorantApiUuid: uuid, displayIconPath: '/assets/cached.png' })
			.where(eq(s.maps.id, 'map-1'));
		await db
			.insert(s.games)
			.values({ id: 'selected', matchId: 'match', number: 1, name: 'Selected', mapId: 'map-1' });
		const { getBroadcastState, updateBroadcastState } = await import('../services/broadcast');
		await updateBroadcastState({ expectedRevision: 1, selectedGameId: 'selected' });
		const { broadcastPublisher } = await import('./publisher');
		const snapshots: Array<{ revision: number; name: string | undefined }> = [];
		const stop = await broadcastPublisher.subscribe({
			send: (snapshot) =>
				snapshots.push({ revision: snapshot.revision, name: snapshot.game?.map?.displayName }),
			close() {}
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url.includes('/maps?'))
					return new Response(
						JSON.stringify({
							data: [
								{
									uuid,
									displayName: 'Updated map',
									displayIcon: 'https://example.com/icon.png',
									mapUrl: '/Game/Maps/Example'
								}
							]
						}),
						{ headers: { 'content-type': 'application/json' } }
					);
				return new Response('Agent catalogue unavailable', { status: 503 });
			})
		);
		try {
			const { actions } = await import('../../../routes/admin/resources/+page.server');
			const refresh = actions.refresh;
			const event = {} as Parameters<typeof refresh>[0];
			expect(await refresh(event)).toMatchObject({
				status: 502,
				data: { error: 'Catalogue refresh failed. Saved resources were kept; try again later.' }
			});
			expect(snapshots).toEqual([
				{ revision: 2, name: 'map-1' },
				{ revision: 3, name: 'Updated map' }
			]);
			await client.execute(
				"CREATE TRIGGER reject_refresh BEFORE UPDATE ON maps BEGIN SELECT RAISE(ABORT, 'map rollback'); END"
			);
			expect(await refresh(event)).toMatchObject({ status: 502 });
			expect((await getBroadcastState()).revision).toBe(3);
			expect(snapshots).toHaveLength(2);
			const publish = vi
				.spyOn(broadcastPublisher, 'publish')
				.mockRejectedValueOnce(new Error('publication unavailable'));
			const log = vi.spyOn(console, 'error').mockImplementation(() => {});
			try {
				expect(await refresh(event)).toMatchObject({
					status: 502,
					data: { error: 'Catalogue refresh failed. Saved resources were kept; try again later.' }
				});
				expect(log).toHaveBeenCalledOnce();
			} finally {
				publish.mockRestore();
				log.mockRestore();
			}
		} finally {
			stop();
			vi.unstubAllGlobals();
		}
	});
});
