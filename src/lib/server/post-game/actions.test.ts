import { afterEach, expect, it, vi } from 'vitest';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import * as s from '#lib/server/db/schema/index.ts';
import { completedMatch, recentMatches } from './providers/fixtures';
import { normalizePostGameConfig } from './config';

afterEach(() => vi.doUnmock('#lib/server/post-game/config.ts'));

const config = normalizePostGameConfig({ HENRIKDEV_API_KEY: 'fake-action-key' });

async function route() {
	vi.doMock('#lib/server/post-game/config.ts', () => ({ loadPostGameConfig: async () => config }));
	return import('../../../routes/admin/games/[gameId]/+page.server');
}

it('uses the saved lineup anchor, encoded provider request and safe public load projection', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await db
			.insert(s.gameLineups)
			.values({ gameId: 'g', entryId: 'entry-a', slot: 1, playerId: 'a1' });
		await db.update(s.players).set({ riotId: 'Saved Player#EVENT' });
		const { actions, load } = await route();
		const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(recentMatches)));
		const controller = new AbortController();
		const form = new FormData();
		form.set(
			'payload',
			JSON.stringify({
				operation: 'discover',
				expectedGameRevision: 1,
				anchorPlayerId: 'a1',
				riotId: 'Untrusted#CLIENT'
			})
		);
		const result = await actions.postGame({
			params: { gameId: 'g' },
			request: new Request('http://localhost/?/postGame', {
				method: 'POST',
				body: form,
				signal: controller.signal
			}),
			fetch: fetcher
		} as never);
		expect(result).toMatchObject({
			candidates: [{ externalMatchId: 'event-match' }, { externalMatchId: 'older-match' }]
		});
		expect(fetcher.mock.calls[0][0]).toContain('/Saved%20Player/EVENT');
		expect(fetcher.mock.calls[0][1]).toMatchObject({
			headers: { Authorization: 'fake-action-key' },
			signal: expect.any(AbortSignal)
		});
		const loaded = await load({ params: { gameId: 'g' } } as never);
		expect(loaded?.postGame.anchors).toEqual([
			{ id: 'a1', displayName: 'Player a1', riotId: 'Saved Player#EVENT' }
		]);
		expect(JSON.stringify(loaded)).not.toContain('fake-action-key');
		vi.doUnmock('#lib/server/post-game/config.ts');
	});
});

it('rejects arbitrary anchors and stale revisions before any outbound request', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		const { actions } = await route();
		const fetcher = vi.fn();
		for (const input of [
			{ anchorPlayerId: 'a1', expectedGameRevision: 1 },
			{ anchorPlayerId: 'a1', expectedGameRevision: 9 }
		]) {
			const form = new FormData();
			form.set('payload', JSON.stringify({ operation: 'discover', ...input }));
			const result = await actions.postGame({
				params: { gameId: 'g' },
				request: new Request('http://localhost/?/postGame', { method: 'POST', body: form }),
				fetch: fetcher
			} as never);
			expect(result).toHaveProperty('status', input.expectedGameRevision > 1 ? 409 : 400);
		}
		expect(fetcher).not.toHaveBeenCalled();
		vi.doUnmock('#lib/server/post-game/config.ts');
	});
});

it('refetches exact detail server-side and returns safe rate-limit/transport failures', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		const { actions } = await route();
		for (const fetcher of [
			vi.fn<typeof fetch>(async () => new Response('{}', { status: 429 })),
			vi.fn<typeof fetch>(async () => {
				throw new Error('private-key-in-transport');
			}),
			vi.fn<typeof fetch>(async () => new Response(JSON.stringify(completedMatch)))
		]) {
			const form = new FormData();
			form.set(
				'payload',
				JSON.stringify({
					operation: 'henrik',
					expectedGameRevision: 1,
					externalMatchId: 'event-match',
					report: { untrusted: true }
				})
			);
			const result = await actions.postGame({
				params: { gameId: 'g' },
				request: new Request('http://localhost/?/postGame', { method: 'POST', body: form }),
				fetch: fetcher
			} as never);
			expect(fetcher.mock.calls[0][0]).toContain('/match/ap/event-match');
			expect(JSON.stringify(result)).not.toMatch(/private-key|fake-action-key|untrusted/);
			if (result && 'review' in result)
				expect(result.review).toMatchObject({
					provider: 'henrikdev',
					externalMatchId: 'event-match',
					canConfirm: false
				});
			else expect(result).toHaveProperty('status', 400);
		}
		vi.doUnmock('#lib/server/post-game/config.ts');
	});
});
