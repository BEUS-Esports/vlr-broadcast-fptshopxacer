import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import * as schema from '#lib/server/db/schema/index.ts';

it('creates individual stable slots, preserves team scores across side swaps, and validates preparation', async () => {
	await withManagementFixture(async ({ db }) => {
		const service = await import('./games');
		let saved = await service.createGame({
			matchId: 'match',
			expectedMatchRevision: 1,
			number: 1,
			name: 'First'
		});
		expect(await db.select().from(schema.games)).toHaveLength(1);
		await expect(
			service.createGame({
				matchId: 'match',
				expectedMatchRevision: 2,
				number: 1,
				name: 'Collision'
			})
		).rejects.toMatchObject({ code: 'invalid' });
		await expect(
			service.createGame({ matchId: 'match', expectedMatchRevision: 1, number: 2, name: 'Stale' })
		).rejects.toMatchObject({ code: 'stale' });
		const key = () => ({
			gameId: saved.gameId,
			expectedGameRevision: saved.gameRevision,
			expectedMatchRevision: saved.matchRevision
		});
		await expect(
			service.saveGameInfo({
				...key(),
				name: 'First',
				mapId: 'unknown',
				startingAttackersEntryId: null,
				startingDefendersEntryId: null
			})
		).rejects.toMatchObject({ code: 'invalid' });
		await expect(
			service.saveGameInfo({
				...key(),
				name: 'First',
				mapId: 'map-1',
				startingAttackersEntryId: 'entry-a',
				startingDefendersEntryId: null
			})
		).rejects.toMatchObject({ code: 'invalid' });
		saved = await service.saveGameInfo({
			...key(),
			name: 'First',
			mapId: 'map-1',
			startingAttackersEntryId: 'entry-a',
			startingDefendersEntryId: 'entry-b'
		});
		saved = await service.saveGameResult({
			...key(),
			result: { mode: 'draft', scoreA: 0, scoreB: 9 }
		});
		expect(saved.series).toMatchObject({ winsA: 0, winsB: 0, state: 'incomplete' });
		saved = await service.saveGameInfo({
			...key(),
			name: 'Renamed',
			mapId: 'map-1',
			startingAttackersEntryId: 'entry-b',
			startingDefendersEntryId: 'entry-a'
		});
		expect((await db.select().from(schema.games))[0]).toMatchObject({
			number: 1,
			scoreA: 0,
			scoreB: 9,
			winnerEntryId: null
		});
		for (const scoreA of [NaN, -1, 1.5, Infinity])
			await expect(
				service.saveGameResult({ ...key(), result: { mode: 'draft', scoreA, scoreB: 0 } })
			).rejects.toMatchObject({ code: 'invalid' });
		await expect(
			service.saveGameResult({ ...key(), result: { mode: 'draft', scoreA: null, scoreB: 0 } })
		).rejects.toMatchObject({ code: 'invalid' });
		saved = await service.saveGameResult({
			...key(),
			result: { mode: 'normal', scoreA: 13, scoreB: 9 }
		});
		await expect(
			service.saveGameResult({ ...key(), result: { mode: 'draft', scoreA: 1, scoreB: 0 } })
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(
			service.saveGameInfo({
				...key(),
				name: 'Renamed',
				mapId: 'map-2',
				startingAttackersEntryId: 'entry-b',
				startingDefendersEntryId: 'entry-a'
			})
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(service.deleteDraftGame(key())).rejects.toMatchObject({ code: 'blocked' });
		saved = await service.reopenGame(key());
		expect((await db.select().from(schema.games))[0]).toMatchObject({
			scoreA: 13,
			scoreB: 9,
			resultType: null
		});
		await service.deleteDraftGame(key());
		expect(await db.select().from(schema.games)).toHaveLength(0);
	});
});

it('corrects BO2 2–0 to a draw and reopening makes it incomplete in one transaction', async () => {
	await withManagementFixture(async ({ db, client }) => {
		await db.update(schema.matches).set({ bestOf: 2 }).where(eq(schema.matches.id, 'match'));
		const service = await import('./games');
		const first = await service.createGame({
			matchId: 'match',
			expectedMatchRevision: 1,
			number: 1,
			name: 'One'
		});
		const second = await service.createGame({
			matchId: 'match',
			expectedMatchRevision: 2,
			number: 2,
			name: 'Two'
		});
		await db.update(schema.games).set({ mapId: 'map-1' });
		await service.saveGameResult({
			gameId: first.gameId,
			expectedGameRevision: 1,
			expectedMatchRevision: 3,
			result: { mode: 'normal', scoreA: 13, scoreB: 0 }
		});
		let saved = await service.saveGameResult({
			gameId: second.gameId,
			expectedGameRevision: 1,
			expectedMatchRevision: 4,
			result: { mode: 'normal', scoreA: 13, scoreB: 0 }
		});
		expect(saved.series).toMatchObject({ winsA: 2, state: 'completed', winnerEntryId: 'entry-a' });
		saved = await service.saveGameResult({
			gameId: second.gameId,
			expectedGameRevision: 2,
			expectedMatchRevision: 5,
			result: { mode: 'normal', scoreA: 0, scoreB: 13 }
		});
		expect(saved.series).toMatchObject({ winsA: 1, winsB: 1, state: 'draw', winnerEntryId: null });
		expect((await db.select().from(schema.matches))[0]).toMatchObject({
			resultType: 'normal',
			winnerEntryId: null
		});
		saved = await service.reopenGame({
			gameId: second.gameId,
			expectedGameRevision: 3,
			expectedMatchRevision: 6
		});
		expect(saved.series.state).toBe('incomplete');
		await client.execute(
			"CREATE TRIGGER reject_derived BEFORE UPDATE OF result_type ON matches BEGIN SELECT RAISE(ABORT, 'result rollback'); END"
		);
		await expect(
			service.saveGameResult({
				gameId: second.gameId,
				expectedGameRevision: 4,
				expectedMatchRevision: 7,
				result: { mode: 'normal', scoreA: 13, scoreB: 0 }
			})
		).rejects.toThrow();
		expect(
			(await db.select().from(schema.games).where(eq(schema.games.id, second.gameId)))[0]
		).toMatchObject({ revision: 4, resultType: null, scoreA: 0, scoreB: 13 });
		expect((await db.select().from(schema.matches))[0].revision).toBe(7);
	});
});

it('prefills veto assignments and blocks contradictory game edits', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(schema.matchVetoActions).values({
			id: 'v',
			matchId: 'match',
			sequence: 1,
			action: 'pick',
			mapId: 'map-2',
			actingEntryId: 'entry-a',
			gameNumber: 2,
			sideChooserEntryId: 'entry-b',
			sideChoice: 'attack'
		});
		const service = await import('./games');
		const game = await service.createGame({
			matchId: 'match',
			expectedMatchRevision: 1,
			number: 2,
			name: 'Two'
		});
		expect((await db.select().from(schema.games))[0]).toMatchObject({
			number: 2,
			mapId: 'map-2',
			startingAttackersEntryId: 'entry-b',
			startingDefendersEntryId: 'entry-a'
		});
		await expect(
			service.saveGameInfo({
				gameId: game.gameId,
				expectedGameRevision: 1,
				expectedMatchRevision: 2,
				name: 'Two',
				mapId: 'map-1',
				startingAttackersEntryId: 'entry-b',
				startingDefendersEntryId: 'entry-a'
			})
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(
			service.saveGameResult({
				gameId: game.gameId,
				expectedGameRevision: 1,
				expectedMatchRevision: 2,
				result: { mode: 'walkover', winnerEntryId: 'entry-c' }
			})
		).rejects.toMatchObject({ code: 'invalid' });
		await service.saveGameResult({
			gameId: game.gameId,
			expectedGameRevision: 1,
			expectedMatchRevision: 2,
			result: { mode: 'walkover', winnerEntryId: 'entry-a' }
		});
		await expect(
			service.saveGameResult({
				gameId: game.gameId,
				expectedGameRevision: 2,
				expectedMatchRevision: 3,
				result: { mode: 'normal', scoreA: 13, scoreB: 0 }
			})
		).rejects.toMatchObject({ code: 'blocked' });
		expect((await db.select().from(schema.games))[0]).toMatchObject({
			scoreA: null,
			scoreB: null,
			resultType: 'walkover'
		});
	});
});

it('requires reopening a cancelled logical slot before recording a decisive result', async () => {
	await withManagementFixture(async ({ db }) => {
		const service = await import('./games');
		await db.insert(schema.games).values({
			id: 'cancelled',
			matchId: 'match',
			name: 'Replay',
			number: 1,
			mapId: 'map-1',
			resultType: 'cancelled'
		});
		for (const result of [
			{ mode: 'normal' as const, scoreA: 13, scoreB: 0 },
			{ mode: 'forfeit' as const, winnerEntryId: 'entry-a' }
		])
			await expect(
				service.saveGameResult({
					gameId: 'cancelled',
					expectedGameRevision: 1,
					expectedMatchRevision: 1,
					result
				})
			).rejects.toMatchObject({ code: 'blocked' });
		await service.reopenGame({
			gameId: 'cancelled',
			expectedGameRevision: 1,
			expectedMatchRevision: 1
		});
		await expect(
			service.saveGameResult({
				gameId: 'cancelled',
				expectedGameRevision: 2,
				expectedMatchRevision: 2,
				result: { mode: 'normal', scoreA: 13, scoreB: 0 }
			})
		).resolves.toMatchObject({ series: { winsA: 1 } });
	});
});

it('rejects malformed scores while preserving blank versus zero', async () => {
	await withManagementFixture(async () => {
		const { parseScore } = await import('./games');
		expect(parseScore('')).toBeNull();
		expect(parseScore('  ')).toBeNull();
		expect(parseScore('0')).toBe(0);
		for (const value of ['bad', '1.5', '-1', '1e3', 'Infinity', {}, undefined])
			expect(() => parseScore(value)).toThrow();
	});
});
