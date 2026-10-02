import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '#lib/server/db/schema/index.ts';
import {
	withManagementFixture,
	type ManagementFixture
} from '#lib/server/testing/management-fixture.ts';

async function source(db: ManagementFixture['db']) {
	await db.insert(schema.agents).values({ id: 'agent', key: 'agent', displayName: 'Agent' });
	await db.insert(schema.games).values({
		id: 'source',
		matchId: 'match',
		number: 1,
		name: 'Reviewed source',
		mapId: 'map-1',
		startingAttackersEntryId: 'entry-a',
		startingDefendersEntryId: 'entry-b',
		scoreA: 13,
		scoreB: 8,
		resultType: 'normal',
		winnerEntryId: 'entry-a',
		mvpPlayerId: 'a1'
	});
	await db.insert(schema.gameLineups).values(
		['a', 'b'].flatMap((team) =>
			Array.from({ length: 5 }, (_, i) => ({
				gameId: 'source',
				entryId: `entry-${team}`,
				slot: i + 1,
				playerId: i === 4 ? null : `${team}${4 - i}`,
				agentId: i === 4 ? null : 'agent'
			}))
		)
	);
	await db
		.insert(schema.gamePlayerStatistics)
		.values({ gameId: 'source', playerId: 'a1', entryId: 'entry-a', kills: 25 });
	await db
		.insert(schema.gameStatisticsMeta)
		.values({ gameId: 'source', importSource: 'provider', externalMatchId: '123' });
	await db.insert(schema.matchVetoActions).values({
		matchId: 'match',
		sequence: 1,
		action: 'pick',
		actingEntryId: 'entry-b',
		mapId: 'map-2',
		gameNumber: 2,
		sideChooserEntryId: 'entry-a',
		sideChoice: 'defense'
	});
	await db.insert(schema.broadcastState).values({
		selectedGameId: 'source',
		visibility: {
			'player-lineup': true,
			'agent-select': false,
			'player-stats': false,
			'map-veto': false,
			'in-game': false,
			'post-game': false,
			mvp: false
		}
	});
}

const input = {
	matchId: 'match',
	expectedMatchRevision: 1,
	sourceGameId: 'source',
	expectedSourceGameRevision: 1,
	number: 2,
	name: 'Game 2'
};

async function snapshot(db: ManagementFixture['db']) {
	return {
		games: await db.select().from(schema.games),
		lineups: await db
			.select()
			.from(schema.gameLineups)
			.orderBy(asc(schema.gameLineups.entryId), asc(schema.gameLineups.slot)),
		statistics: await db.select().from(schema.gamePlayerStatistics),
		meta: await db.select().from(schema.gameStatisticsMeta),
		roster: await db.select().from(schema.tournamentEntryPlayers),
		broadcast: await db.select().from(schema.broadcastState),
		matches: await db.select().from(schema.matches)
	};
}

describe('safe game duplication', () => {
	it.each([false, true])(
		'copies reviewed ordered lineup with agents=%s, uses target veto and preserves source',
		async (copyAgents) => {
			await withManagementFixture(async ({ db }) => {
				await source(db);
				const before = await snapshot(db);
				const { duplicateGame } = await import('./games');
				const saved = await duplicateGame({ ...input, copyAgents });
				const after = await snapshot(db);
				const target = after.games.find((game) => game.id === saved.gameId)!;
				expect(target).toMatchObject({
					matchId: 'match',
					number: 2,
					name: 'Game 2',
					revision: 1,
					mapId: 'map-2',
					startingAttackersEntryId: 'entry-b',
					startingDefendersEntryId: 'entry-a',
					scoreA: null,
					scoreB: null,
					resultType: null,
					winnerEntryId: null,
					mvpPlayerId: null
				});
				expect(after.games.find((game) => game.id === 'source')).toEqual(before.games[0]);
				expect(after.lineups.filter((row) => row.gameId === 'source')).toEqual(before.lineups);
				expect(after.lineups.filter((row) => row.gameId === saved.gameId)).toEqual(
					before.lineups.map((row) => ({
						...row,
						gameId: saved.gameId,
						agentId: copyAgents ? row.agentId : null
					}))
				);
				for (const key of ['statistics', 'meta', 'roster'] as const)
					expect(after[key]).toEqual(before[key]);
				expect(after.broadcast[0]).toEqual({
					...before.broadcast[0],
					dataRevision: after.broadcast[0].dataRevision
				});
				expect(after.broadcast[0].dataRevision).toBeGreaterThan(before.broadcast[0].dataRevision);
				expect(saved.matchRevision).toBe(2);
				expect(saved.series.winsA).toBe(1);
				expect(after.roster).toHaveLength(12);
			});
		}
	);

	it('defaults Agent Select off and represents an unknown target map/sides', async () => {
		await withManagementFixture(async ({ db }) => {
			await source(db);
			const { duplicateGame } = await import('./games');
			const saved = await duplicateGame({ ...input, number: 3, name: 'Game 3' });
			const [game] = await db.select().from(schema.games).where(eq(schema.games.id, saved.gameId));
			expect(game).toMatchObject({
				mapId: null,
				startingAttackersEntryId: null,
				startingDefendersEntryId: null
			});
			expect(
				(
					await db
						.select()
						.from(schema.gameLineups)
						.where(eq(schema.gameLineups.gameId, saved.gameId))
				).every((row) => row.agentId === null)
			).toBe(true);
		});
	});

	it.each([
		[{ expectedMatchRevision: 2 }, 'stale'],
		[{ expectedSourceGameRevision: 2 }, 'stale'],
		[{ expectedSourceGameRevision: 0 }, 'invalid'],
		[{ sourceGameId: 'missing' }, 'not-found'],
		[{ number: 1 }, 'invalid'],
		[{ number: 4 }, 'invalid'],
		[{ number: 1.5 }, 'invalid'],
		[{ name: '' }, 'invalid'],
		[{ name: ' '.repeat(3) }, 'invalid'],
		[{ copyAgents: 'yes' }, 'invalid']
	] as const)('rolls back an invalid or stale request %j', async (patch, code) => {
		await withManagementFixture(async ({ db }) => {
			await source(db);
			const before = await snapshot(db);
			const { duplicateGame } = await import('./games');
			await expect(
				duplicateGame({ ...input, ...patch } as Parameters<typeof duplicateGame>[0])
			).rejects.toMatchObject({ code });
			expect(await snapshot(db)).toEqual(before);
		});
	});

	it('rejects a source from another match', async () => {
		await withManagementFixture(async ({ db }) => {
			await source(db);
			await db.insert(schema.matches).values({
				id: 'another',
				tournamentId: 't',
				label: 'Another',
				bestOf: 3,
				teamAEntryId: 'entry-a',
				teamBEntryId: 'entry-b'
			});
			const before = await snapshot(db);
			const { duplicateGame } = await import('./games');
			await expect(duplicateGame({ ...input, matchId: 'another' })).rejects.toMatchObject({
				code: 'invalid'
			});
			expect(await snapshot(db)).toEqual(before);
		});
	});

	it.each(['archive', 'remove', 'transfer'])(
		'rejects %s of a historical source player with a player-specific error and no partial writes',
		async (change) => {
			await withManagementFixture(async ({ db }) => {
				await source(db);
				if (change === 'archive')
					await db
						.update(schema.players)
						.set({ archivedAt: new Date() })
						.where(eq(schema.players.id, 'a1'));
				else {
					await db
						.delete(schema.tournamentEntryPlayers)
						.where(
							and(
								eq(schema.tournamentEntryPlayers.entryId, 'entry-a'),
								eq(schema.tournamentEntryPlayers.playerId, 'a1')
							)
						);
					if (change === 'transfer')
						await db
							.insert(schema.tournamentEntryPlayers)
							.values({ entryId: 'entry-c', playerId: 'a1' });
				}
				const before = await snapshot(db);
				const { duplicateGame } = await import('./games');
				await expect(duplicateGame(input)).rejects.toMatchObject({
					code: 'invalid',
					message: expect.stringContaining('Player a1')
				});
				expect(await snapshot(db)).toEqual(before);
			});
		}
	);

	it('rejects an archived tournament without writing', async () => {
		await withManagementFixture(async ({ db }) => {
			await source(db);
			await db
				.update(schema.tournaments)
				.set({ archivedAt: new Date() })
				.where(eq(schema.tournaments.id, 't'));
			const before = await snapshot(db);
			const { duplicateGame } = await import('./games');
			await expect(duplicateGame(input)).rejects.toMatchObject({ code: 'blocked' });
			expect(await snapshot(db)).toEqual(before);
		});
	});
});
