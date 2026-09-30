import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import * as schema from '#lib/server/db/schema/index.ts';

it('owns entries and complete roster replacements while preserving historical selections', async () => {
	await withManagementFixture(async ({ db, client }) => {
		const { addTournamentEntry, removeTournamentEntry, replaceTournamentRoster } =
			await import('./tournament-entries');
		await expect(
			addTournamentEntry({ tournamentId: 't', expectedTournamentRevision: 1, teamId: 'team-a' })
		).rejects.toMatchObject({ code: 'invalid' });
		const entry = await addTournamentEntry({
			tournamentId: 'other',
			expectedTournamentRevision: 1,
			teamId: 'team-a'
		});
		expect(entry.tournamentRevision).toBe(2);
		await expect(
			replaceTournamentRoster({
				tournamentId: 't',
				expectedTournamentRevision: 1,
				entryId: entry.entryId,
				playerIds: ['a1']
			})
		).rejects.toMatchObject({ code: 'invalid' });
		await expect(
			replaceTournamentRoster({
				tournamentId: 't',
				expectedTournamentRevision: 1,
				entryId: 'entry-a',
				playerIds: ['a1', 'a1']
			})
		).rejects.toMatchObject({ code: 'invalid' });
		await db.insert(schema.games).values({ id: 'g', matchId: 'match', number: 1, name: 'First' });
		await db
			.insert(schema.gameLineups)
			.values({ gameId: 'g', entryId: 'entry-a', slot: 1, playerId: 'a1' });
		await replaceTournamentRoster({
			tournamentId: 't',
			expectedTournamentRevision: 1,
			entryId: 'entry-a',
			playerIds: ['a2', 'a3', 'a4', 'a5', 'a6', 'b6']
		});
		expect(await db.select().from(schema.gameLineups)).toMatchObject([{ playerId: 'a1' }]);
		expect(
			await db
				.select()
				.from(schema.tournamentEntryPlayers)
				.where(eq(schema.tournamentEntryPlayers.entryId, 'entry-a'))
		).toHaveLength(6);
		await expect(
			replaceTournamentRoster({
				tournamentId: 't',
				expectedTournamentRevision: 1,
				entryId: 'entry-a',
				playerIds: []
			})
		).rejects.toMatchObject({ code: 'stale' });
		await expect(
			removeTournamentEntry({
				tournamentId: 't',
				expectedTournamentRevision: 2,
				entryId: 'entry-a'
			})
		).rejects.toMatchObject({ code: 'blocked' });
		await client.execute(
			"CREATE TRIGGER reject_roster BEFORE INSERT ON tournament_entry_players WHEN NEW.player_id = 'a1' BEGIN SELECT RAISE(ABORT, 'test rollback'); END"
		);
		await expect(
			replaceTournamentRoster({
				tournamentId: 't',
				expectedTournamentRevision: 2,
				entryId: 'entry-a',
				playerIds: ['a1']
			})
		).rejects.toThrow();
		expect(
			(await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, 't')))[0].revision
		).toBe(2);
		expect(
			await db
				.select()
				.from(schema.tournamentEntryPlayers)
				.where(eq(schema.tournamentEntryPlayers.entryId, 'entry-a'))
		).toHaveLength(6);
		await removeTournamentEntry({
			tournamentId: 'other',
			expectedTournamentRevision: 2,
			entryId: entry.entryId
		});
		expect(
			await db
				.select()
				.from(schema.tournamentEntries)
				.where(eq(schema.tournamentEntries.id, entry.entryId))
		).toHaveLength(0);
	});
});
