import { expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import {
	withTwoConnections,
	type ManagementFixture
} from '#lib/server/testing/management-fixture.ts';

async function services(db: ManagementFixture['db']) {
	vi.resetModules();
	vi.doMock('#lib/server/db/index.ts', () => ({ db }));
	return {
		games: await import('./games'),
		matches: await import('./matches'),
		entries: await import('./tournament-entries'),
		lineups: await import('./lineups'),
		tournaments: await import('./tournaments'),
		vetoes: await import('./vetoes'),
		boundDb: (await import('#lib/server/db/index.ts')).db
	};
}

async function race(
	run: (
		a: Awaited<ReturnType<typeof services>>,
		b: Awaited<ReturnType<typeof services>>,
		fixture: ManagementFixture & { secondDb: ManagementFixture['db'] }
	) => Promise<void>
) {
	await withTwoConnections(async (fixture) => {
		const a = await services(fixture.db);
		const b = await services(fixture.secondDb);
		expect(a.boundDb).toBe(fixture.db);
		expect(b.boundDb).toBe(fixture.secondDb);
		expect(a.boundDb).not.toBe(b.boundDb);
		expect(a.games).not.toBe(b.games);
		await run(a, b, fixture);
	});
}

async function settle(first: Promise<unknown>, second: Promise<unknown>) {
	const results = await Promise.allSettled([first, second]);
	expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
	for (const result of results)
		if (result.status === 'rejected') {
			const error = result.reason as { code?: string; message?: string };
			expect(['stale', 'blocked', 'invalid', 'busy']).toContain(
				/busy|locked/i.test(`${error.code} ${error.message}`) ? 'busy' : error.code
			);
		}
	return results;
}

const lineup = () =>
	['a', 'b'].map((team) => ({
		entryId: `entry-${team}`,
		slots: Array.from({ length: 5 }, (_, index) => ({
			slot: index + 1,
			playerId: `${team}${index + 1}`
		}))
	}));

it('serializes two teams claiming the same unassigned tournament player', () =>
	race(async (a, b, { db }) => {
		await db.insert(s.players).values({ id: 'free', displayName: 'Free agent' });
		const results = await settle(
			a.entries.replaceTournamentRoster({
				tournamentId: 't',
				expectedTournamentRevision: 1,
				entryId: 'entry-a',
				playerIds: ['free']
			}),
			b.entries.replaceTournamentRoster({
				tournamentId: 't',
				expectedTournamentRevision: 1,
				entryId: 'entry-b',
				playerIds: ['free']
			})
		);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(
			await db
				.select()
				.from(s.tournamentEntryPlayers)
				.where(eq(s.tournamentEntryPlayers.playerId, 'free'))
		).toHaveLength(1);
	}));

it('serializes two creations of the same game slot', () =>
	race(async (a, b, { db }) => {
		await settle(
			a.games.createGame({ matchId: 'match', expectedMatchRevision: 1, number: 1, name: 'A' }),
			b.games.createGame({ matchId: 'match', expectedMatchRevision: 1, number: 1, name: 'B' })
		);
		const rows = await db.select().from(s.games);
		expect(rows).toHaveLength(1);
		expect(rows[0].number).toBe(1);
		expect((await db.select().from(s.matches))[0].revision).toBe(2);
	}));

it('keeps distinct simultaneous game finals and the series result consistent', () =>
	race(async (a, b, { db }) => {
		await db.insert(s.games).values([
			{ id: 'g1', matchId: 'match', number: 1, name: 'One', mapId: 'map-1' },
			{ id: 'g2', matchId: 'match', number: 2, name: 'Two', mapId: 'map-2' }
		]);
		await settle(
			a.games.saveGameResult({
				gameId: 'g1',
				expectedGameRevision: 1,
				expectedMatchRevision: 1,
				result: { mode: 'normal', scoreA: 13, scoreB: 8 }
			}),
			b.games.saveGameResult({
				gameId: 'g2',
				expectedGameRevision: 1,
				expectedMatchRevision: 1,
				result: { mode: 'normal', scoreA: 7, scoreB: 13 }
			})
		);
		const games = await db.select().from(s.games);
		const match = (await db.select().from(s.matches))[0];
		expect(games.filter((game) => game.resultType === 'normal').length).toBeGreaterThanOrEqual(1);
		expect(match.revision).toBe(1 + games.filter((game) => game.resultType === 'normal').length);
		expect(match.resultType).toBeNull();
		expect(match.winnerEntryId).toBeNull();
		for (const game of games.filter((row) => row.resultType === 'normal'))
			expect(game.winnerEntryId).toBe(game.scoreA! > game.scoreB! ? 'entry-a' : 'entry-b');
	}));

it('cannot swap match participants around a newly created game', () =>
	race(async (a, b, { db }) => {
		await settle(
			a.matches.updateMatchParticipants({
				matchId: 'match',
				expectedRevision: 1,
				teamAEntryId: 'entry-c',
				teamBEntryId: 'entry-b'
			}),
			b.games.createGame({ matchId: 'match', expectedMatchRevision: 1, number: 1, name: 'One' })
		);
		const match = (await db.select().from(s.matches))[0];
		const games = await db.select().from(s.games);
		expect(match.revision).toBe(2);
		expect(games.length).toBeLessThanOrEqual(1);
		if (games.length) expect(match.teamAEntryId).toBe('entry-a');
		else expect(match.teamAEntryId).toBe('entry-c');
	}));

it('keeps lineup selections valid when a roster changes concurrently', () =>
	race(async (a, b, { db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await settle(
			a.entries.replaceTournamentRoster({
				tournamentId: 't',
				expectedTournamentRevision: 1,
				entryId: 'entry-a',
				playerIds: ['a2', 'a3', 'a4', 'a5', 'a6']
			}),
			b.lineups.replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() })
		);
		const roster = await db
			.select()
			.from(s.tournamentEntryPlayers)
			.where(eq(s.tournamentEntryPlayers.entryId, 'entry-a'));
		const rows = await db.select().from(s.gameLineups);
		expect([5, 6]).toContain(roster.length);
		expect([0, 10]).toContain(rows.length);
		if (rows.length && !roster.some((row) => row.playerId === 'a1'))
			expect(rows.some((row) => row.playerId === 'a1')).toBe(true);
		if (!rows.length) expect(roster.some((row) => row.playerId === 'a1')).toBe(false);
	}));

it.each(['game', 'veto'] as const)(
	'protects a map from pool removal when a %s references it',
	(kind) =>
		race(async (a, b, { db }) => {
			const remove = a.tournaments.replaceTournamentMapPool({
				tournamentId: 't',
				expectedRevision: 1,
				mapIds: ['map-2', 'map-3', 'map-4', 'map-5', 'map-6', 'map-7']
			});
			const reference =
				kind === 'game'
					? b.games
							.createGame({ matchId: 'match', expectedMatchRevision: 1, number: 1, name: 'One' })
							.then(async (saved) =>
								b.games.saveGameInfo({
									gameId: saved.gameId,
									expectedGameRevision: 1,
									expectedMatchRevision: 2,
									name: 'One',
									mapId: 'map-1',
									startingAttackersEntryId: null,
									startingDefendersEntryId: null
								})
							)
					: b.vetoes.replaceMatchVeto({
							matchId: 'match',
							expectedMatchRevision: 1,
							actions: [
								{
									action: 'pick',
									mapId: 'map-1',
									gameNumber: 1,
									actingEntryId: 'entry-a',
									sideChooserEntryId: null,
									sideChoice: null
								}
							]
						});
			await settle(remove, reference);
			const pool = await db.select().from(s.tournamentMapPool);
			const referenced =
				kind === 'game'
					? (await db.select().from(s.games)).some((row) => row.mapId === 'map-1')
					: (await db.select().from(s.matchVetoActions)).some((row) => row.mapId === 'map-1');
			if (referenced) expect(pool.some((row) => row.mapId === 'map-1')).toBe(true);
			else expect(pool.some((row) => row.mapId === 'map-1')).toBe(false);
		})
);

it('keeps veto assignments and game info consistent across concurrent edits', () =>
	race(async (a, b, { db }) => {
		await db
			.insert(s.games)
			.values({ id: 'g', matchId: 'match', number: 1, name: 'One', mapId: 'map-1' });
		await settle(
			a.vetoes.replaceMatchVeto({
				matchId: 'match',
				expectedMatchRevision: 1,
				actions: [
					{
						action: 'pick',
						mapId: 'map-2',
						gameNumber: 1,
						actingEntryId: 'entry-a',
						sideChooserEntryId: null,
						sideChoice: null
					}
				],
				applyToDraftGames: [{ gameId: 'g', expectedGameRevision: 1 }]
			}),
			b.games.saveGameInfo({
				gameId: 'g',
				expectedGameRevision: 1,
				expectedMatchRevision: 1,
				name: 'Edited',
				mapId: 'map-3',
				startingAttackersEntryId: null,
				startingDefendersEntryId: null
			})
		);
		const game = (await db.select().from(s.games))[0];
		const veto = (await db.select().from(s.matchVetoActions))[0];
		if (veto) expect(game.mapId).toBe(veto.mapId);
		else expect(game.mapId).toBe('map-3');
		expect(game.revision).toBe(2);
		expect((await db.select().from(s.matches))[0].revision).toBe(2);
	}));
