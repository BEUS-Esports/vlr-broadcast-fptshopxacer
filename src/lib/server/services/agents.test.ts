import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

const teams = () =>
	['a', 'b'].map((team) => ({
		entryId: `entry-${team}`,
		slots: Array.from({ length: 5 }, (_, index) => ({
			slot: index + 1,
			playerId: `${team}${index + 1}`
		}))
	}));
const assignments = () =>
	teams().flatMap((team) =>
		team.slots.map((slot) => ({
			playerId: slot.playerId,
			entryId: team.entryId,
			agentId: null as string | null
		}))
	);

it('saves agents and nulls with separate import provenance and unchanged lineup identity and metrics', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups, saveGameAgents } = await import('./lineups');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await db.insert(s.agents).values({ id: 'jett', key: 'jett', displayName: 'Jett' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: teams() });
		const before = await db.select().from(s.gameLineups);
		const players = assignments();
		players[0].agentId = 'jett';
		expect(await saveGameAgents({ gameId: 'g', expectedGameRevision: 2, players })).toMatchObject({
			gameRevision: 3
		});
		expect(await db.select().from(s.gameLineups)).toEqual(
			before.map((row) => ({ ...row, agentId: row.playerId === 'a1' ? 'jett' : null }))
		);
		expect(await db.select().from(s.gamePlayerStatistics)).toEqual([]);
		expect(await db.select().from(s.gameStatisticsMeta)).toEqual([]);
		const importedAt = new Date('2026-09-01T00:00:00Z');
		await db.insert(s.gameStatisticsMeta).values({
			gameId: 'g',
			importSource: 'fixture',
			externalMatchId: 'external-1',
			importedAt,
			lastManualEditAt: importedAt
		});
		await db.insert(s.gamePlayerStatistics).values({
			gameId: 'g',
			playerId: 'a1',
			entryId: 'entry-a',
			kills: 0,
			manuallyEditedAt: importedAt
		});
		const stats = await db.select().from(s.gamePlayerStatistics);
		const meta = await db.select().from(s.gameStatisticsMeta);
		await saveGameAgents({ gameId: 'g', expectedGameRevision: 3, players: assignments() });
		expect(await db.select().from(s.gameLineups)).toEqual(before);
		const [corrected] = await db.select().from(s.gamePlayerStatistics);
		expect(corrected).toMatchObject({
			...stats[0],
			agentManualOverride: true,
			agentManuallyEditedAt: expect.any(Date),
			updatedAt: expect.any(Date)
		});
		expect(corrected.agentManuallyEditedAt!.getTime()).toBeGreaterThan(importedAt.getTime());
		expect(await db.select().from(s.gameStatisticsMeta)).toEqual(meta);
		await saveGameAgents({ gameId: 'g', expectedGameRevision: 4, players: assignments() });
		expect(await db.select().from(s.gamePlayerStatistics)).toEqual([corrected]);
	});
});

it('rejects invalid or incomplete identities, inactive new agents and stale writes atomically', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups, saveGameAgents: save } = await import('./lineups');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await db.insert(s.agents).values([
			{ id: 'old', key: 'old', displayName: 'Old', isActive: false },
			{ id: 'jett', key: 'jett', displayName: 'Jett' }
		]);
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: teams() });
		const before = await db.select().from(s.gameLineups);
		for (const mutate of [
			(rows: ReturnType<typeof assignments>) => rows.pop(),
			(rows: ReturnType<typeof assignments>) => rows.push(rows[0]),
			(rows: ReturnType<typeof assignments>) => {
				rows[0].entryId = 'entry-b';
			},
			(rows: ReturnType<typeof assignments>) => {
				rows[0].playerId = 'a6';
			},
			(rows: ReturnType<typeof assignments>) => {
				rows[0].agentId = 'missing';
			},
			(rows: ReturnType<typeof assignments>) => {
				rows[0].agentId = 'old';
			},
			(rows: ReturnType<typeof assignments>) => {
				rows[0].agentId = 'jett';
				rows[9].agentId = 'missing';
			}
		]) {
			const players = assignments();
			mutate(players);
			await expect(save({ gameId: 'g', expectedGameRevision: 2, players })).rejects.toMatchObject({
				code: 'invalid'
			});
		}
		expect((await db.select().from(s.games))[0].revision).toBe(2);
		expect(await db.select().from(s.gameLineups)).toEqual(before);
		await save({ gameId: 'g', expectedGameRevision: 2, players: assignments() });
		await expect(
			save({ gameId: 'g', expectedGameRevision: 2, players: assignments() })
		).rejects.toMatchObject({ code: 'stale' });
	});
});

it('rejects an original agent draft as stale after its saved lineup player is removed', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups, saveGameAgents } = await import('./lineups');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: teams() });
		const original = assignments();
		const changed = teams();
		changed[0].slots[0].playerId = 'a6';
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 2, teams: changed });
		const saved = await db.select().from(s.gameLineups);
		await expect(
			saveGameAgents({ gameId: 'g', expectedGameRevision: 2, players: original })
		).rejects.toMatchObject({ code: 'stale' });
		expect(await db.select().from(s.gameLineups)).toEqual(saved);
		expect((await db.select().from(s.games))[0].revision).toBe(3);
	});
});

it('retains historical agents only for their saved player and blocks archived edits', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups, saveGameAgents: save } = await import('./lineups');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await db
			.insert(s.agents)
			.values({ id: 'old', key: 'old', displayName: 'Old', isActive: false });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: teams() });
		await db.update(s.gameLineups).set({ agentId: 'old' }).where(eq(s.gameLineups.playerId, 'a1'));
		const players = assignments();
		players[0].agentId = 'old';
		await save({ gameId: 'g', expectedGameRevision: 2, players });
		players[1].agentId = 'old';
		await expect(save({ gameId: 'g', expectedGameRevision: 3, players })).rejects.toMatchObject({
			code: 'invalid'
		});
		players[1].agentId = null;
		await db.update(s.tournaments).set({ archivedAt: new Date() }).where(eq(s.tournaments.id, 't'));
		await expect(save({ gameId: 'g', expectedGameRevision: 3, players })).rejects.toMatchObject({
			code: 'blocked'
		});
		expect((await db.select().from(s.games))[0].revision).toBe(3);
	});
});
