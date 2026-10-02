import { expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

const lineup = () =>
	['a', 'b'].map((team) => ({
		entryId: `entry-${team}`,
		slots: Array.from({ length: 5 }, (_, index) => ({
			slot: index + 1,
			playerId: `${team}${index + 1}`
		}))
	}));

function row(overrides: Record<string, unknown> = {}) {
	return {
		playerId: 'a1',
		entryId: 'entry-a',
		kills: null,
		deaths: null,
		assists: null,
		performanceScore: null,
		trades: null,
		firstBloods: null,
		plants: null,
		defuses: null,
		...overrides
	};
}

it('saves partial values, keeps zero distinct, ignores crafted agents, and removes explicit blank rows', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { saveGameStatistics } = await import('./statistics');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await db.insert(s.agents).values({ id: 'jett', key: 'jett', displayName: 'Jett' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		await db.update(s.gameLineups).set({ agentId: 'jett' }).where(eq(s.gameLineups.playerId, 'a1'));
		const saved = await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 2,
			players: [row({ kills: '0', deaths: '2', agentId: 'crafted-missing-agent' })]
		});
		expect(saved.gameRevision).toBe(3);
		expect(saved.scoreboard[0]).toMatchObject({
			playerId: 'a1',
			kills: 0,
			deaths: 2,
			assists: null,
			agentId: 'jett'
		});
		const first = (await db.select().from(s.gamePlayerStatistics))[0];
		expect(first.manuallyEditedAt).toBeInstanceOf(Date);
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 3,
			players: [row({ kills: 0, deaths: 2, agentId: 'jett' })]
		});
		expect((await db.select().from(s.gamePlayerStatistics))[0].manuallyEditedAt).toEqual(
			first.manuallyEditedAt
		);
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 4,
			players: [row({ agentId: 'jett' })]
		});
		expect(await db.select().from(s.gamePlayerStatistics)).toHaveLength(0);
		expect(
			(await db.select().from(s.gameLineups).where(eq(s.gameLineups.playerId, 'a1')))[0].agentId
		).toBe('jett');
	});
});

it('ignores crafted agent-only fields without changing statistics timestamps or provenance', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { saveGameStatistics } = await import('./statistics');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await db.insert(s.agents).values({ id: 'jett', key: 'jett', displayName: 'Jett' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		const importedAt = new Date('2026-09-01T00:00:00Z');
		await db
			.insert(s.gameStatisticsMeta)
			.values({ gameId: 'g', importSource: 'fixture', importedAt });
		await db
			.insert(s.gamePlayerStatistics)
			.values({ gameId: 'g', playerId: 'a1', entryId: 'entry-a', kills: 1 });
		const beforeStats = await db.select().from(s.gamePlayerStatistics);
		const beforeMeta = await db.select().from(s.gameStatisticsMeta);
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 2,
			players: [row({ kills: 1, agentId: 'jett' })]
		});
		expect(
			(await db.select().from(s.gameLineups).where(eq(s.gameLineups.playerId, 'a1')))[0].agentId
		).toBeNull();
		expect(await db.select().from(s.gamePlayerStatistics)).toEqual(beforeStats);
		expect(await db.select().from(s.gameStatisticsMeta)).toEqual(beforeMeta);
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 3,
			players: [row({ kills: 1, agentId: { crafted: true } })]
		});
		expect(await db.select().from(s.gameStatisticsMeta)).toEqual(beforeMeta);
	});
});

it('rejects wrong identity, invalid counts, and stale saves without partial writes', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { saveGameStatistics: save } = await import('./statistics');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		for (const players of [
			[row(), row()],
			[row({ entryId: 'entry-b' })],
			[row({ playerId: 'a6' })],
			[row({ playerId: 'missing' })],
			[row({ kills: -1 })],
			[row({ deaths: 1.5 })],
			[row({ kills: Number.MAX_SAFE_INTEGER + 1 })],
			[row({ kills: 'NaN' })]
		])
			await expect(save({ gameId: 'g', expectedGameRevision: 2, players })).rejects.toMatchObject({
				code: 'invalid'
			});
		expect((await db.select().from(s.games))[0].revision).toBe(2);
		expect(await db.select().from(s.gamePlayerStatistics)).toHaveLength(0);
		await save({ gameId: 'g', expectedGameRevision: 2, players: [row({ kills: 1 })] });
		await expect(
			save({ gameId: 'g', expectedGameRevision: 2, players: [row({ kills: 9 })] })
		).rejects.toMatchObject({ code: 'stale' });
		expect((await db.select().from(s.gamePlayerStatistics))[0].kills).toBe(1);
	});
});

it('protects a stats-bearing lineup player and rolls back failed statistics writes', async () => {
	await withManagementFixture(async ({ db, client }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { saveGameStatistics: save } = await import('./statistics');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await db.insert(s.agents).values({ id: 'jett', key: 'jett', displayName: 'Jett' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		await save({ gameId: 'g', expectedGameRevision: 2, players: [row({ kills: 1 })] });
		const changed = lineup();
		changed[0].slots[0].playerId = 'a6';
		await expect(
			replaceGameLineups({ gameId: 'g', expectedGameRevision: 3, teams: changed })
		).rejects.toMatchObject({ code: 'blocked' });
		await client.execute(
			"CREATE TRIGGER reject_stats BEFORE UPDATE ON game_player_statistics BEGIN SELECT RAISE(ABORT, 'test failure'); END"
		);
		await expect(
			save({ gameId: 'g', expectedGameRevision: 3, players: [row({ kills: 2, agentId: 'jett' })] })
		).rejects.toThrow();
		expect((await db.select().from(s.games))[0].revision).toBe(3);
		expect(
			(
				await db
					.select()
					.from(s.gameLineups)
					.where(and(eq(s.gameLineups.gameId, 'g'), eq(s.gameLineups.playerId, 'a1')))
			)[0].agentId
		).toBeNull();
		expect((await db.select().from(s.gamePlayerStatistics))[0].kills).toBe(1);
	});
});

it('blocks moving a stats-bearing player to the other team', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { saveGameStatistics } = await import('./statistics');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await db.insert(s.tournamentEntryPlayers).values({ entryId: 'entry-b', playerId: 'a1' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 2,
			players: [row({ kills: 1 })]
		});
		const moved = lineup();
		moved[0].slots[0].playerId = 'a6';
		moved[1].slots[0].playerId = 'a1';
		await expect(
			replaceGameLineups({ gameId: 'g', expectedGameRevision: 3, teams: moved })
		).rejects.toMatchObject({ code: 'blocked' });
		expect((await db.select().from(s.games))[0].revision).toBe(3);
		expect(
			(await db.select().from(s.gameLineups).where(eq(s.gameLineups.playerId, 'a1')))[0].entryId
		).toBe('entry-a');
	});
});

it('keeps imported provenance and marks only corrected player rows', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { getGameStatistics, saveGameStatistics } = await import('./statistics');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		const importedAt = new Date('2026-09-01T00:00:00Z');
		await db
			.insert(s.gameStatisticsMeta)
			.values({ gameId: 'g', importSource: 'fixture', externalMatchId: 'external-1', importedAt });
		await db.insert(s.gamePlayerStatistics).values([
			{ gameId: 'g', playerId: 'a1', entryId: 'entry-a', kills: 1 },
			{ gameId: 'g', playerId: 'a2', entryId: 'entry-a', kills: 2 }
		]);
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 2,
			players: [row({ kills: 1 }), row({ playerId: 'a2', kills: 3 })]
		});
		const { provenance } = await getGameStatistics('g');
		expect(provenance).toMatchObject({
			importSource: 'fixture',
			externalMatchId: 'external-1',
			importedAt
		});
		expect(provenance.lastManualEditAt).toBeInstanceOf(Date);
		expect(provenance.manuallyChangedPlayerIds).toEqual(['a2']);
		expect(
			(
				await db
					.select()
					.from(s.gamePlayerStatistics)
					.where(eq(s.gamePlayerStatistics.playerId, 'a1'))
			)[0].manuallyEditedAt
		).toBeNull();
	});
});

it('retains a manual-clear marker for an imported row without refreshing it on a no-op', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { getGameStatistics, saveGameStatistics } = await import('./statistics');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		await db.insert(s.gameStatisticsMeta).values({
			gameId: 'g',
			importSource: 'fixture',
			importedAt: new Date('2026-09-01T00:00:00Z')
		});
		await db
			.insert(s.gamePlayerStatistics)
			.values({ gameId: 'g', playerId: 'a1', entryId: 'entry-a', kills: 5 });
		await saveGameStatistics({ gameId: 'g', expectedGameRevision: 2, players: [row()] });
		const [cleared] = await db.select().from(s.gamePlayerStatistics);
		const [metaAfterClear] = await db.select().from(s.gameStatisticsMeta);
		expect(cleared).toMatchObject({ playerId: 'a1', kills: null });
		expect(cleared.manuallyEditedAt).toBeInstanceOf(Date);
		expect((await getGameStatistics('g')).provenance.manuallyChangedPlayerIds).toEqual(['a1']);
		await saveGameStatistics({ gameId: 'g', expectedGameRevision: 3, players: [row()] });
		expect((await db.select().from(s.gamePlayerStatistics))[0].manuallyEditedAt).toEqual(
			cleared.manuallyEditedAt
		);
		expect((await db.select().from(s.gameStatisticsMeta))[0].lastManualEditAt).toEqual(
			metaAfterClear.lastManualEditAt
		);
	});
});
