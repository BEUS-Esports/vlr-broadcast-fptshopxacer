import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import * as s from '#lib/server/db/schema/index.ts';

const teams = (count = 5) =>
	['a', 'b'].map((key) => ({
		entryId: `entry-${key}`,
		slots: Array.from({ length: 5 }, (_, i) => ({
			slot: i + 1,
			playerId: i < count ? `${key}${i + 1}` : null
		}))
	}));

it('excludes archived players from new selections while retaining their historical lineup', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups: save } = await import('./lineups');
		await db.insert(s.games).values([
			{ id: 'g', matchId: 'match', number: 1, name: 'One' },
			{ id: 'g2', matchId: 'match', number: 2, name: 'Two' }
		]);
		await save({ gameId: 'g', expectedGameRevision: 1, teams: teams() });
		await db.update(s.players).set({ archivedAt: new Date() }).where(eq(s.players.id, 'a1'));
		await expect(
			save({ gameId: 'g2', expectedGameRevision: 1, teams: teams() })
		).rejects.toMatchObject({ code: 'invalid' });
		expect(await save({ gameId: 'g', expectedGameRevision: 2, teams: teams() })).toMatchObject({
			readyA: true
		});
	});
});

it('saves empty, partial and ready lineups, isolates substitutions, and rejects stale saves', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups: save } = await import('./lineups');
		await db.insert(s.games).values([
			{ id: 'g', matchId: 'match', number: 1, name: 'One' },
			{ id: 'g2', matchId: 'match', number: 2, name: 'Two' }
		]);
		for (const [revision, count] of [0, 3, 5].entries())
			expect(
				await save({ gameId: 'g', expectedGameRevision: revision + 1, teams: teams(count) })
			).toMatchObject({ readyA: count === 5, readyB: count === 5 });
		const second = teams();
		second[0].slots[0].playerId = 'a6';
		await save({ gameId: 'g2', expectedGameRevision: 1, teams: second });
		expect(
			(await db.select().from(s.gameLineups).where(eq(s.gameLineups.gameId, 'g'))).find(
				(row) => row.entryId === 'entry-a' && row.slot === 1
			)?.playerId
		).toBe('a1');
		await expect(
			save({ gameId: 'g', expectedGameRevision: 1, teams: teams() })
		).rejects.toMatchObject({ code: 'stale' });
	});
});

it('validates unknown collection shapes, ownership, eligibility and game-wide uniqueness atomically', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups: save } = await import('./lineups');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		const invalid: unknown[] = [null, {}, [], teams().slice(0, 1)];
		for (const mutate of [
			(v: ReturnType<typeof teams>) => {
				v[0].entryId = 'entry-c';
			},
			(v: ReturnType<typeof teams>) => {
				v[0].slots[0].slot = 2;
			},
			(v: ReturnType<typeof teams>) => {
				v[0].slots[0].playerId = 'a2';
			},
			(v: ReturnType<typeof teams>) => {
				v[0].slots[0].playerId = 'b1';
			},
			(v: ReturnType<typeof teams>) => {
				v[0].slots[0].playerId = 'missing';
			}
		]) {
			const value = teams();
			mutate(value);
			invalid.push(value);
		}
		for (const value of invalid)
			await expect(
				save({ gameId: 'g', expectedGameRevision: 1, teams: value })
			).rejects.toMatchObject({ code: 'invalid' });
		expect((await db.select().from(s.games))[0].revision).toBe(1);
		expect(await db.select().from(s.gameLineups)).toHaveLength(0);
	});
});

it('retains historical players and agents only in the same saved game/team, including reordering', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups: save } = await import('./lineups');
		await db.insert(s.games).values([
			{ id: 'g', matchId: 'match', number: 1, name: 'One' },
			{ id: 'g2', matchId: 'match', number: 2, name: 'Two' }
		]);
		await db.insert(s.agents).values({ id: 'agent', key: 'agent', displayName: 'Agent' });
		await save({ gameId: 'g', expectedGameRevision: 1, teams: teams() });
		await db
			.update(s.gameLineups)
			.set({ agentId: 'agent' })
			.where(eq(s.gameLineups.playerId, 'a1'));
		await db.delete(s.tournamentEntryPlayers).where(eq(s.tournamentEntryPlayers.playerId, 'a1'));
		const reordered = teams();
		reordered[0].slots[0].playerId = 'a2';
		reordered[0].slots[1].playerId = 'a1';
		await save({ gameId: 'g', expectedGameRevision: 2, teams: reordered });
		expect(
			(await db.select().from(s.gameLineups).where(eq(s.gameLineups.playerId, 'a1')))[0]
		).toMatchObject({ slot: 2, agentId: 'agent' });
		await expect(
			save({ gameId: 'g2', expectedGameRevision: 1, teams: teams() })
		).rejects.toMatchObject({ code: 'invalid' });
		const moved = teams(0);
		moved[1].slots[0].playerId = 'a1';
		await expect(
			save({ gameId: 'g', expectedGameRevision: 3, teams: moved })
		).rejects.toMatchObject({ code: 'invalid' });
		await save({ gameId: 'g', expectedGameRevision: 3, teams: teams(0) });
		await expect(
			save({ gameId: 'g', expectedGameRevision: 4, teams: teams() })
		).rejects.toMatchObject({ code: 'invalid' });
	});
});

it('blocks terminal, exceptional and archived edits and rolls back a failed replacement insertion', async () => {
	await withManagementFixture(async ({ db, client }) => {
		const { replaceGameLineups: save } = await import('./lineups');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await save({ gameId: 'g', expectedGameRevision: 1, teams: teams() });
		await client.execute(
			"CREATE TRIGGER reject_lineup BEFORE INSERT ON game_lineups BEGIN SELECT RAISE(ABORT, 'test failure'); END"
		);
		await expect(save({ gameId: 'g', expectedGameRevision: 2, teams: teams(0) })).rejects.toThrow();
		expect(await db.select().from(s.gameLineups)).toHaveLength(10);
		expect((await db.select().from(s.games))[0].revision).toBe(2);
		await client.execute('DROP TRIGGER reject_lineup');
		await db.update(s.games).set({ resultType: 'cancelled' });
		await expect(
			save({ gameId: 'g', expectedGameRevision: 2, teams: teams() })
		).rejects.toMatchObject({ code: 'blocked' });
		await db.update(s.games).set({ resultType: null });
		await db.update(s.matches).set({ resultType: 'cancelled' });
		await expect(
			save({ gameId: 'g', expectedGameRevision: 2, teams: teams() })
		).rejects.toMatchObject({ code: 'blocked' });
		await db.update(s.matches).set({ resultType: null });
		await db.update(s.tournaments).set({ archivedAt: new Date() });
		await expect(
			save({ gameId: 'g', expectedGameRevision: 2, teams: teams() })
		).rejects.toMatchObject({ code: 'blocked' });
	});
});
