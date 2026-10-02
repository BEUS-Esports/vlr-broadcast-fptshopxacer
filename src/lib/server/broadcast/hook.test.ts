import { expect, it, vi } from 'vitest';
import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it('publishes preparation once and controls without a second revision, and leaves failure/GET alone', async () => {
	await withManagementFixture(async ({ db }) => {
		const { handle } = await import('../../../hooks.server');
		const { getBroadcastState, updateBroadcastState } = await import('../services/broadcast');
		const { broadcastPublisher } = await import('./publisher');
		const revisions: Array<[number, number]> = [];
		const stop = await broadcastPublisher.subscribe({
			send: (snapshot) => revisions.push([snapshot.controlRevision, snapshot.dataRevision]),
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
		expect(await getBroadcastState()).toMatchObject({ controlRevision: 1, dataRevision: 2 });
		await updateBroadcastState({ expectedRevision: 1, swapped: true });
		await run('/admin/graphics');
		expect(await getBroadcastState()).toMatchObject({ controlRevision: 2, dataRevision: 2 });
		await run('/admin/teams', 'POST', 'failure');
		await run('/admin/games/[gameId]', 'GET');
		expect(await getBroadcastState()).toMatchObject({ controlRevision: 2, dataRevision: 2 });
		expect(revisions).toEqual([
			[1, 1],
			[1, 2],
			[2, 2]
		]);
		stop();
	});
});

it('publishes a real committed MVP despite its following aggregate read failing', async () => {
	await withManagementFixture(async ({ db }) => {
		const { handle } = await import('../../../hooks.server');
		const { actions } = await import('../../../routes/admin/games/[gameId]/+page.server');
		const { replaceGameLineups } = await import('../services/lineups');
		const statistics = await import('../services/statistics-aggregation');
		const { getBroadcastState, updateBroadcastState } = await import('../services/broadcast');
		const { broadcastPublisher } = await import('./publisher');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await replaceGameLineups({
			gameId: 'g',
			expectedGameRevision: 1,
			teams: ['a', 'b'].map((team) => ({
				entryId: `entry-${team}`,
				slots: Array.from({ length: 5 }, (_, i) => ({ slot: i + 1, playerId: `${team}${i + 1}` }))
			}))
		});
		await updateBroadcastState({ expectedRevision: 1, selectedGameId: 'g' });
		const snapshots: BroadcastSnapshot[] = [];
		const stop = await broadcastPublisher.subscribe({
			send: (snapshot) => snapshots.push(snapshot),
			close() {}
		});
		const cause = new Error('post-commit aggregate unavailable');
		const read = vi.spyOn(statistics, 'getGameStatistics').mockRejectedValueOnce(cause);
		const run = (playerId: string, expectedRevision: number) => {
			const form = new FormData();
			form.set('payload', JSON.stringify({ playerId, expectedRevision }));
			const event = {
				route: { id: '/admin/games/[gameId]' },
				params: { gameId: 'g' },
				request: new Request('http://localhost/admin/games/g?/mvp', { method: 'POST', body: form })
			};
			return handle({
				event,
				resolve: async () => {
					const result = await actions.mvp(event as Parameters<typeof actions.mvp>[0]);
					return Response.json({ type: 'failure', ...result });
				}
			} as unknown as Parameters<typeof handle>[0]);
		};
		try {
			await expect(run('a1', 2)).rejects.toBe(cause);
			expect((await db.select().from(s.games))[0]).toMatchObject({
				mvpPlayerId: 'a1',
				revision: 3
			});
			const savedRevision = (await getBroadcastState()).dataRevision;
			expect(savedRevision).toBeGreaterThan(1);
			expect(snapshots.map((snapshot) => snapshot.dataRevision)).toEqual([1, savedRevision]);
			expect(snapshots[1].scopes.game.mvpPlayerId).toBe('a1');
			// Invalid participation rolls back the revision bump and never emits another snapshot.
			expect(await (await run('a6', 3)).json()).toMatchObject({
				type: 'failure',
				status: 400,
				data: { code: 'invalid' }
			});
			expect((await getBroadcastState()).dataRevision).toBe(savedRevision);
			expect(snapshots).toHaveLength(2);
		} finally {
			read.mockRestore();
			stop();
		}
	});
});

it('attempts publication on error responses and throws without replacing the original outcome', async () => {
	await withManagementFixture(async () => {
		const { handle } = await import('../../../hooks.server');
		const { broadcastPublisher } = await import('./publisher');
		const publish = vi
			.spyOn(broadcastPublisher, 'publish')
			.mockRejectedValue(new Error('publication unavailable'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const event = {
			route: { id: '/admin/games/[gameId]' },
			request: new Request('http://localhost/admin/games/g', { method: 'POST' })
		};
		const response = Response.json({ type: 'error' }, { status: 500 });
		const cause = new Error('original action error');
		try {
			expect(
				await handle({ event, resolve: async () => response } as unknown as Parameters<
					typeof handle
				>[0])
			).toBe(response);
			await expect(
				handle({
					event,
					resolve: async () => {
						throw cause;
					}
				} as unknown as Parameters<typeof handle>[0])
			).rejects.toBe(cause);
			expect(publish).toHaveBeenCalledTimes(2);
			expect(log).toHaveBeenCalledTimes(2);
			for (const [route, method] of [
				['/admin/games/[gameId]', 'GET'],
				['/unrelated', 'POST'],
				['/admin/resources/sync', 'POST']
			]) {
				await handle({
					event: {
						route: { id: route },
						request: new Request(`http://localhost${route}`, { method })
					},
					resolve: async () => response
				} as unknown as Parameters<typeof handle>[0]);
			}
			expect(publish).toHaveBeenCalledTimes(2);
		} finally {
			publish.mockRestore();
			log.mockRestore();
		}
	});
});
