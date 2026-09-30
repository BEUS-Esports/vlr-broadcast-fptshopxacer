import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

const lineup = () =>
	['a', 'b'].map((team) => ({
		entryId: `entry-${team}`,
		slots: Array.from({ length: 5 }, (_, i) => ({ slot: i + 1, playerId: `${team}${i + 1}` }))
	}));

it('selects and clears MVPs by actual scope participation, independent of statistics', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { saveGameStatistics } = await import('./statistics');
		const { setGameMvp, setMatchMvp, setTournamentMvp } = await import('./mvp');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		for (const save of [
			() => setGameMvp({ gameId: 'g', expectedRevision: 2, playerId: 'a6' }),
			() => setMatchMvp({ matchId: 'match', expectedRevision: 1, playerId: 'a6' }),
			() => setTournamentMvp({ tournamentId: 't', expectedRevision: 1, playerId: 'a6' })
		])
			await expect(save()).rejects.toMatchObject({ code: 'invalid' });
		await setGameMvp({ gameId: 'g', expectedRevision: 2, playerId: 'a1' });
		await setMatchMvp({ matchId: 'match', expectedRevision: 1, playerId: 'a1' });
		await setTournamentMvp({ tournamentId: 't', expectedRevision: 1, playerId: 'a1' });
		await db.update(s.players).set({ archivedAt: new Date() }).where(eq(s.players.id, 'a1'));
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 3,
			players: [
				{ playerId: 'a1', entryId: 'entry-a', agentId: null, kills: 0 },
				{ playerId: 'b1', entryId: 'entry-b', agentId: null, kills: 99 }
			]
		});
		expect((await db.select().from(s.games))[0].mvpPlayerId).toBe('a1');
		expect((await db.select().from(s.matches))[0].mvpPlayerId).toBe('a1');
		expect(
			(await db.select().from(s.tournaments).where(eq(s.tournaments.id, 't')))[0].mvpPlayerId
		).toBe('a1');
		await expect(
			setGameMvp({ gameId: 'g', expectedRevision: 3, playerId: 'b1' })
		).rejects.toMatchObject({ code: 'stale' });
		await setGameMvp({ gameId: 'g', expectedRevision: 4, playerId: null });
		expect((await db.select().from(s.games))[0].mvpPlayerId).toBeNull();
	});
});

it('keeps MVP participation valid when a draft lineup changes', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { setGameMvp, setMatchMvp, setTournamentMvp } = await import('./mvp');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		await setGameMvp({ gameId: 'g', expectedRevision: 2, playerId: 'a1' });
		await setMatchMvp({ matchId: 'match', expectedRevision: 1, playerId: 'a1' });
		await setTournamentMvp({ tournamentId: 't', expectedRevision: 1, playerId: 'a1' });
		const changed = lineup();
		changed[0].slots[0].playerId = 'a6';
		for (const clear of [
			() => setGameMvp({ gameId: 'g', expectedRevision: 3, playerId: null }),
			() => setMatchMvp({ matchId: 'match', expectedRevision: 2, playerId: null }),
			() => setTournamentMvp({ tournamentId: 't', expectedRevision: 2, playerId: null })
		]) {
			await expect(
				replaceGameLineups({
					gameId: 'g',
					expectedGameRevision: (await db.select().from(s.games))[0].revision,
					teams: changed
				})
			).rejects.toMatchObject({ code: 'blocked' });
			await clear();
		}
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 4, teams: changed });
	});
});

it('requires clearing scope MVPs before deleting their last game appearance', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceGameLineups } = await import('./lineups');
		const { deleteDraftGame } = await import('./games');
		const { setMatchMvp, setTournamentMvp } = await import('./mvp');
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 1, teams: lineup() });
		await setMatchMvp({ matchId: 'match', expectedRevision: 1, playerId: 'a1' });
		await setTournamentMvp({ tournamentId: 't', expectedRevision: 1, playerId: 'a1' });
		await expect(
			deleteDraftGame({ gameId: 'g', expectedGameRevision: 2, expectedMatchRevision: 2 })
		).rejects.toMatchObject({ code: 'blocked' });
		await setMatchMvp({ matchId: 'match', expectedRevision: 2, playerId: null });
		await expect(
			deleteDraftGame({ gameId: 'g', expectedGameRevision: 2, expectedMatchRevision: 3 })
		).rejects.toMatchObject({ code: 'blocked' });
		await setTournamentMvp({ tournamentId: 't', expectedRevision: 2, playerId: null });
		await deleteDraftGame({ gameId: 'g', expectedGameRevision: 2, expectedMatchRevision: 3 });
		expect(await db.select().from(s.games)).toHaveLength(0);
	});
});
