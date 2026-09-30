import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import * as schema from '#lib/server/db/schema/index.ts';

const pick = (mapId: string, gameNumber: number | null) => ({
	action: 'pick' as const,
	mapId,
	gameNumber,
	actingEntryId: 'entry-a',
	sideChooserEntryId: null,
	sideChoice: null
});

it('supports arbitrary ordered same-team picks, stable IDs, future games, and neutral deciders', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceMatchVeto } = await import('./vetoes');
		await db.update(schema.matches).set({ bestOf: 5 });
		await replaceMatchVeto({
			matchId: 'match',
			expectedMatchRevision: 1,
			actions: [
				pick('map-1', 1),
				pick('map-2', 2),
				{ ...pick('map-3', 5), action: 'decider', actingEntryId: null }
			]
		});
		expect(await db.select().from(schema.games)).toHaveLength(0);
		const rows = await db
			.select()
			.from(schema.matchVetoActions)
			.orderBy(schema.matchVetoActions.sequence);
		expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3]);
		await replaceMatchVeto({
			matchId: 'match',
			expectedMatchRevision: 2,
			actions: [...rows].reverse()
		});
		expect(
			(
				await db.select().from(schema.matchVetoActions).orderBy(schema.matchVetoActions.sequence)
			).map((row) => row.id)
		).toEqual(rows.map((row) => row.id).reverse());
		for (const actions of [
			[pick('map-1', 1), pick('map-1', 2)],
			[pick('map-1', 1), pick('map-2', 1)],
			[pick('missing', 1)],
			[{ ...pick('map-1', 1), actingEntryId: 'entry-c' }],
			[{ ...pick('map-1', 1), action: 'ban' as const }],
			[{ ...pick('map-1', 1), sideChoice: 'attack' as const }],
			[{ ...pick('map-1', 6) }],
			[{ ...pick('map-1', 1), id: 'foreign' }]
		]) {
			await expect(
				replaceMatchVeto({ matchId: 'match', expectedMatchRevision: 3, actions })
			).rejects.toMatchObject({ code: 'invalid' });
		}
		expect((await db.select().from(schema.matches))[0].revision).toBe(3);
	});
});

it('requires explicit revision-checked draft reconciliation and rolls back veto plus games together', async () => {
	await withManagementFixture(async ({ db, client }) => {
		const { replaceMatchVeto } = await import('./vetoes');
		await db
			.insert(schema.games)
			.values({ id: 'g', matchId: 'match', number: 1, name: 'First', mapId: 'map-1' });
		const actions = [
			{ ...pick('map-2', 1), sideChooserEntryId: 'entry-a', sideChoice: 'attack' as const }
		];
		await expect(
			replaceMatchVeto({ matchId: 'match', expectedMatchRevision: 1, actions })
		).rejects.toMatchObject({
			code: 'blocked',
			details: { conflicts: [{ gameId: 'g', terminal: false }] }
		});
		await expect(
			replaceMatchVeto({
				matchId: 'match',
				expectedMatchRevision: 1,
				actions,
				applyToDraftGames: [{ gameId: 'g', expectedGameRevision: 9 }]
			})
		).rejects.toMatchObject({ code: 'stale' });
		await client.execute(
			"CREATE TRIGGER reject_veto BEFORE INSERT ON match_veto_actions BEGIN SELECT RAISE(ABORT, 'veto rollback'); END"
		);
		await expect(
			replaceMatchVeto({
				matchId: 'match',
				expectedMatchRevision: 1,
				actions,
				applyToDraftGames: [{ gameId: 'g', expectedGameRevision: 1 }]
			})
		).rejects.toThrow();
		expect((await db.select().from(schema.games))[0]).toMatchObject({
			mapId: 'map-1',
			revision: 1
		});
		await client.execute('DROP TRIGGER reject_veto');
		await expect(
			replaceMatchVeto({
				matchId: 'match',
				expectedMatchRevision: 1,
				actions,
				applyToDraftGames: [{ gameId: 'g', expectedGameRevision: 1 }]
			})
		).resolves.toMatchObject({
			matchRevision: 2,
			changedGames: [{ gameId: 'g', gameRevision: 2 }]
		});
		expect((await db.select().from(schema.games))[0]).toMatchObject({
			mapId: 'map-2',
			startingAttackersEntryId: 'entry-a',
			startingDefendersEntryId: 'entry-b'
		});
		await replaceMatchVeto({ matchId: 'match', expectedMatchRevision: 2, actions: [] });
		expect((await db.select().from(schema.games))[0]).toMatchObject({
			mapId: 'map-2',
			revision: 2
		});
		await db.update(schema.games).set({ resultType: 'cancelled' }).where(eq(schema.games.id, 'g'));
		await expect(
			replaceMatchVeto({
				matchId: 'match',
				expectedMatchRevision: 3,
				actions: [pick('map-3', 1)],
				applyToDraftGames: [{ gameId: 'g', expectedGameRevision: 2 }]
			})
		).rejects.toMatchObject({ code: 'blocked' });
		expect(await db.select().from(schema.matchVetoActions)).toHaveLength(0);
	});
});
