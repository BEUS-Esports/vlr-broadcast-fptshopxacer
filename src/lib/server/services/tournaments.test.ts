import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import * as schema from '#lib/server/db/schema/index.ts';

it('creates normalized unique slugs and revision-checks metadata, archive and deletion', async () => {
	await withManagementFixture(async ({ db }) => {
		const service = await import('./tournaments');
		const created = await service.saveTournament({ name: '  Giải đấu  ', slug: '  CUP-2026  ' });
		expect(created.revision).toBe(1);
		expect(
			await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, created.id))
		).toMatchObject([{ name: 'Giải đấu', slug: 'cup-2026' }]);
		await expect(
			service.saveTournament({ name: 'Duplicate', slug: 'cup-2026' })
		).rejects.toMatchObject({ code: 'invalid' });
		for (const slug of ['', '../bad', 'bad slug', '-bad', 'bad-', 'bad--slug', 'đấu']) {
			await expect(service.saveTournament({ name: 'Event', slug })).rejects.toMatchObject({
				code: 'invalid'
			});
		}
		await expect(
			service.saveTournament({
				id: created.id,
				expectedRevision: 1,
				name: 'Renamed',
				slug: 'cup-2026'
			})
		).resolves.toMatchObject({ revision: 2 });
		await expect(
			service.saveTournament({
				id: created.id,
				expectedRevision: 1,
				name: 'Stale',
				slug: 'cup-2026'
			})
		).rejects.toMatchObject({ code: 'stale' });
		await expect(
			service.setTournamentArchived({
				tournamentId: created.id,
				expectedRevision: 2,
				archived: true
			})
		).resolves.toMatchObject({ revision: 3 });
		await expect(
			service.saveTournament({
				id: created.id,
				expectedRevision: 3,
				name: 'Blocked',
				slug: 'cup-2026'
			})
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(
			service.replaceTournamentMapPool({
				tournamentId: created.id,
				expectedRevision: 3,
				mapIds: ['map-1']
			})
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(
			service.deleteTournament({ tournamentId: created.id, expectedRevision: 3 })
		).rejects.toMatchObject({ code: 'blocked' });
		expect(
			await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, created.id))
		).toHaveLength(1);
		await service.setTournamentArchived({
			tournamentId: created.id,
			expectedRevision: 3,
			archived: false
		});
		await service.deleteTournament({ tournamentId: created.id, expectedRevision: 4 });
		expect(
			await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, created.id))
		).toHaveLength(0);
		await expect(
			service.deleteTournament({ tournamentId: 't', expectedRevision: 1 })
		).rejects.toMatchObject({ code: 'blocked' });
	});
});

it('retains referenced/unavailable pool maps, rejects new unavailable maps and isolates events', async () => {
	await withManagementFixture(async ({ db }) => {
		const { replaceTournamentMapPool } = await import('./tournaments');
		await db.update(schema.maps).set({ isActive: false }).where(eq(schema.maps.id, 'map-1'));
		await expect(
			replaceTournamentMapPool({
				tournamentId: 't',
				expectedRevision: 1,
				mapIds: ['map-1', 'map-2']
			})
		).resolves.toMatchObject({ revision: 2 });
		await expect(
			replaceTournamentMapPool({ tournamentId: 'other', expectedRevision: 1, mapIds: ['map-1'] })
		).rejects.toMatchObject({ code: 'invalid' });
		await replaceTournamentMapPool({
			tournamentId: 'other',
			expectedRevision: 1,
			mapIds: ['map-3']
		});
		expect(
			await db
				.select()
				.from(schema.tournamentMapPool)
				.where(eq(schema.tournamentMapPool.tournamentId, 't'))
		).toHaveLength(2);
		await db
			.insert(schema.games)
			.values({ id: 'game', matchId: 'match', number: 1, name: 'Game 1', mapId: 'map-1' });
		await expect(
			replaceTournamentMapPool({ tournamentId: 't', expectedRevision: 2, mapIds: ['map-2'] })
		).rejects.toMatchObject({ code: 'blocked' });
		expect(
			(await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, 't')))[0].revision
		).toBe(2);
	});
});
