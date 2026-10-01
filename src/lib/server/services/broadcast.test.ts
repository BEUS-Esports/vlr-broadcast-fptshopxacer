import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '#lib/server/db/schema/index.ts';
import { withTwoConnections } from '#lib/server/testing/management-fixture.ts';

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
			revision: 1
		});
		state = await service.updateBroadcastState({ expectedRevision: 1, selectedGameId: 'g1' });
		expect(state).toMatchObject({
			selectedGameId: 'g1',
			matchId: 'match',
			tournamentId: 't',
			revision: 2
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
			expectedRevision: state.revision,
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
				service.updateBroadcastState({ expectedRevision: state.revision, ...patch } as Parameters<
					typeof service.updateBroadcastState
				>[0])
			).rejects.toMatchObject({ code: expect.stringMatching(/invalid|not-found/) });
			expect(await service.getBroadcastState()).toEqual(state);
		}
		state = await service.updateBroadcastState({
			expectedRevision: state.revision,
			playerStats: { mode: 'head-to-head', scope: 'match', playerId: 'a1', opponentPlayerId: 'b1' }
		});
		expect(state.playerStats.opponentPlayerId).toBe('b1');
		state = await service.updateBroadcastState({
			expectedRevision: state.revision,
			playerStats: { ...stats, scope: 'tournament', playerId: 'b1' }
		});
		expect(state.playerStats.playerId).toBe('b1');
		state = await service.updateBroadcastState({
			expectedRevision: state.revision,
			selectedGameId: 'g2'
		});
		expect(state).toMatchObject({
			selectedGameId: 'g2',
			swapped: false,
			currentAttackersEntryId: null,
			playerStats: { mode: 'single', scope: 'game', playerId: null, opponentPlayerId: null },
			mvpScope: 'game'
		});
		expect(state.visibility['player-stats']).toBe(true);
		await expect(db.delete(schema.games).where(eq(schema.games.id, 'g2'))).rejects.toThrow();
		expect({
			games: await db.select().from(schema.games),
			matches: await db.select().from(schema.matches),
			lineups: await db.select().from(schema.gameLineups),
			veto: await db.select().from(schema.matchVetoActions)
		}).toEqual(before);
	});
});

it('advances the shared revision without requiring selection or changing controls', async () => {
	await withTwoConnections(async () => {
		const service = await import('./broadcast');
		const initial = await service.getBroadcastState();
		const advanced = await service.advanceBroadcastRevision();
		expect(advanced).toEqual({ ...initial, revision: 2, updatedAt: advanced.updatedAt });
		await expect(
			service.updateBroadcastState({ expectedRevision: 1, visibility: { 'in-game': true } })
		).rejects.toMatchObject({ code: 'stale' });
		await expect(
			service.updateBroadcastState({ expectedRevision: 2, currentAttackersEntryId: 'entry-a' })
		).rejects.toMatchObject({ code: 'invalid' });
		expect(await service.getBroadcastState()).toEqual(advanced);
	});
});
