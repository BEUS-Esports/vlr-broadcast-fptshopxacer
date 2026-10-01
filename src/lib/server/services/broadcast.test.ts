import { expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '#lib/server/db/schema/index.ts';
import { withTwoConnections } from '#lib/server/testing/management-fixture.ts';

it('blocks deleting the on-air game with a usable error and rolls back until selection is cleared', async () => {
	await withTwoConnections(async ({ db }) => {
		await db
			.insert(schema.games)
			.values({ id: 'on-air', matchId: 'match', number: 1, name: 'On air' });
		await db
			.insert(schema.gameLineups)
			.values({ gameId: 'on-air', entryId: 'entry-a', slot: 1, playerId: 'a1' });
		const broadcast = await import('./broadcast');
		const games = await import('./games');
		const selected = await broadcast.updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'on-air'
		});
		const before = {
			games: await db.select().from(schema.games),
			matches: await db.select().from(schema.matches),
			lineups: await db.select().from(schema.gameLineups)
		};
		const input = { gameId: 'on-air', expectedGameRevision: 1, expectedMatchRevision: 1 };
		await expect(games.deleteDraftGame(input)).rejects.toMatchObject({
			code: 'blocked',
			message: 'Clear the broadcast selection before deleting the on-air game.'
		});
		expect({
			games: await db.select().from(schema.games),
			matches: await db.select().from(schema.matches),
			lineups: await db.select().from(schema.gameLineups)
		}).toEqual(before);
		expect(await broadcast.getBroadcastState()).toEqual(selected);
		await broadcast.updateBroadcastState({
			expectedRevision: selected.controlRevision,
			selectedGameId: null
		});
		await games.deleteDraftGame(input);
		expect(await db.select().from(schema.games)).toEqual([]);
		expect(await db.select().from(schema.gameLineups)).toEqual([]);
	});
});

it('reads selected game and parents in one snapshot when another connection clears and deletes the game', async () => {
	await withTwoConnections(async ({ db, secondDb }) => {
		await db
			.insert(schema.games)
			.values({ id: 'selected', matchId: 'match', number: 1, name: 'Selected' });
		const service = await import('./broadcast');
		await service.updateBroadcastState({ expectedRevision: 1, selectedGameId: 'selected' });
		const reads = vi.spyOn(db, 'select');
		try {
			expect(await service.getBroadcastState()).toMatchObject({
				selectedGameId: 'selected',
				matchId: 'match',
				tournamentId: 't'
			});
			expect(reads).toHaveBeenCalledTimes(1);
			await secondDb
				.update(schema.broadcastState)
				.set({ selectedGameId: null })
				.where(eq(schema.broadcastState.id, 1));
			await secondDb.delete(schema.games).where(eq(schema.games.id, 'selected'));
			expect(await service.getBroadcastState()).toMatchObject({
				selectedGameId: null,
				matchId: null,
				tournamentId: null
			});
		} finally {
			reads.mockRestore();
		}
	});
});

it('persists shared controls, rejects stale writes, rolls back invalid picks, and isolates presentation', async () => {
	await withTwoConnections(async ({ db, secondDb }) => {
		await db.insert(schema.games).values([
			{
				id: 'g1',
				matchId: 'match',
				number: 1,
				name: 'First',
				startingAttackersEntryId: 'entry-a',
				startingDefendersEntryId: 'entry-b'
			},
			{ id: 'g2', matchId: 'match', number: 2, name: 'Second' }
		]);
		await db.insert(schema.gameLineups).values([
			{ gameId: 'g1', entryId: 'entry-a', slot: 1, playerId: 'a1' },
			{ gameId: 'g2', entryId: 'entry-b', slot: 1, playerId: 'b1' }
		]);
		const before = {
			games: await db.select().from(schema.games),
			matches: await db.select().from(schema.matches),
			lineups: await db.select().from(schema.gameLineups),
			veto: await db.select().from(schema.matchVetoActions)
		};
		const service = await import('./broadcast');
		let state = await service.getBroadcastState();
		expect(state).toMatchObject({
			selectedGameId: null,
			matchId: null,
			tournamentId: null,
			controlRevision: 1
		});
		state = await service.updateBroadcastState({ expectedRevision: 1, selectedGameId: 'g1' });
		expect(state).toMatchObject({
			selectedGameId: 'g1',
			matchId: 'match',
			tournamentId: 't',
			controlRevision: 2
		});
		await expect(
			service.updateBroadcastState({ expectedRevision: 1, swapped: true })
		).rejects.toMatchObject({ code: 'stale' });
		const stats = {
			mode: 'single' as const,
			scope: 'game' as const,
			playerId: 'a1',
			opponentPlayerId: null
		};
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			swapped: true,
			currentAttackersEntryId: 'entry-b',
			visibility: { 'player-stats': true },
			playerStats: stats,
			mvpScope: 'match'
		});
		expect((await secondDb.select().from(schema.broadcastState))[0]).toMatchObject({
			swapped: true,
			currentAttackersEntryId: 'entry-b'
		});
		expect(await service.getBroadcastState()).toEqual(state);
		for (const patch of [
			{ selectedGameId: 'missing' },
			{ currentAttackersEntryId: 'entry-c' },
			{ playerStats: { ...stats, playerId: 'b1' } },
			{ visibility: { 'player-stats': 'yes' } },
			{ mvpScope: 'unknown' },
			{ mvpScope: null },
			{ playerStats: null },
			{ playerStats: { ...stats, style: 'arbitrary' } }
		]) {
			await expect(
				service.updateBroadcastState({ expectedRevision: state.controlRevision, ...patch } as Parameters<
					typeof service.updateBroadcastState
				>[0])
			).rejects.toMatchObject({ code: expect.stringMatching(/invalid|not-found/) });
			expect(await service.getBroadcastState()).toEqual(state);
		}
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			playerStats: { mode: 'head-to-head', scope: 'match', playerId: 'a1', opponentPlayerId: 'b1' }
		});
		expect(state.playerStats.opponentPlayerId).toBe('b1');
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			playerStats: { ...stats, scope: 'tournament', playerId: 'b1' }
		});
		expect(state.playerStats.playerId).toBe('b1');
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			selectedGameId: 'g2'
		});
		expect(state).toMatchObject({
			selectedGameId: 'g2',
			swapped: true,
			currentAttackersEntryId: null,
			playerStats: { mode: 'single', scope: 'game', playerId: null, opponentPlayerId: null },
			mvpScope: 'game'
		});
		expect(state.visibility['player-stats']).toBe(true);
		// Prepared-data writes advance dataRevision without invalidating control drafts.
		const controlRevision = state.controlRevision;
		const dataRevision = state.dataRevision;
		await db.update(schema.teams).set({ name: 'Prepared edit' }).where(eq(schema.teams.id, 'team-a'));
		const afterPreparedEdit = await service.getBroadcastState();
		expect(afterPreparedEdit.controlRevision).toBe(controlRevision);
		expect(afterPreparedEdit.dataRevision).toBeGreaterThan(dataRevision);
		state = await service.updateBroadcastState({
			expectedRevision: controlRevision,
			visibility: { mvp: true }
		});
		expect(state.controlRevision).toBe(controlRevision + 1);
		await expect(db.delete(schema.games).where(eq(schema.games.id, 'g2'))).rejects.toThrow();
		expect({
			games: await db.select().from(schema.games),
			matches: await db.select().from(schema.matches),
			lineups: await db.select().from(schema.gameLineups),
			veto: await db.select().from(schema.matchVetoActions)
		}).toEqual(before);
	});
});
