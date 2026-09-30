import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import * as schema from '#lib/server/db/schema/index.ts';
import { removeTestDatabase } from '#lib/server/testing/management-fixture.ts';

it('recreates persistent tables and makes aggregate edits atomic and revision checked', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-foundation-'));
	const url = `file:${join(directory, 'app.db')}`;
	const client = createClient({ url });
	try {
		const database = drizzle(client, { schema });
		await migrate(database, { migrationsFolder: join(process.cwd(), 'drizzle') });
		vi.doMock('#lib/server/db/index.ts', () => ({ db: database }));
		const { replaceTournamentMapPool } = await import('./tournaments');
		const { updateMatchParticipants } = await import('./matches');

		await database.insert(schema.tournaments).values({ id: 't', name: 'Event', slug: 'event' });
		await database.insert(schema.maps).values([
			{ id: 'map-1', key: 'ascent', displayName: 'Ascent' },
			{ id: 'map-2', key: 'bind', displayName: 'Bind' }
		]);
		await expect(
			replaceTournamentMapPool({ tournamentId: 't', expectedRevision: 1, mapIds: ['map-1'] })
		).resolves.toMatchObject({ revision: 2 });
		await expect(
			replaceTournamentMapPool({ tournamentId: 't', expectedRevision: 1, mapIds: ['map-2'] })
		).rejects.toMatchObject({ code: 'stale' });

		await client.execute(
			"CREATE TRIGGER reject_map_2 BEFORE INSERT ON tournament_map_pool WHEN NEW.map_id = 'map-2' BEGIN SELECT RAISE(ABORT, 'test rollback'); END"
		);
		await expect(
			replaceTournamentMapPool({ tournamentId: 't', expectedRevision: 2, mapIds: ['map-2'] })
		).rejects.toThrow();
		const [tournament] = await database
			.select({ revision: schema.tournaments.revision })
			.from(schema.tournaments)
			.where(eq(schema.tournaments.id, 't'));
		expect(tournament.revision).toBe(2);
		expect(await database.select().from(schema.tournamentMapPool)).toMatchObject([
			{ tournamentId: 't', mapId: 'map-1' }
		]);

		await database.insert(schema.teams).values([
			{ id: 'team-a', name: 'A', tag: 'A' },
			{ id: 'team-b', name: 'B', tag: 'B' },
			{ id: 'team-c', name: 'C', tag: 'C' }
		]);
		await database.insert(schema.tournamentEntries).values([
			{ id: 'entry-a', tournamentId: 't', teamId: 'team-a' },
			{ id: 'entry-b', tournamentId: 't', teamId: 'team-b' },
			{ id: 'entry-c', tournamentId: 't', teamId: 'team-c' }
		]);
		await database.insert(schema.matches).values({
			id: 'match',
			tournamentId: 't',
			teamAEntryId: 'entry-a',
			teamBEntryId: 'entry-b',
			label: 'Opening'
		});
		await expect(
			updateMatchParticipants({
				matchId: 'match',
				expectedRevision: 1,
				teamAEntryId: 'entry-c',
				teamBEntryId: 'entry-b'
			})
		).resolves.toMatchObject({ teamAEntryId: 'entry-c', revision: 2 });
		await expect(
			updateMatchParticipants({
				matchId: 'match',
				expectedRevision: 1,
				teamAEntryId: 'entry-a',
				teamBEntryId: 'entry-b'
			})
		).rejects.toMatchObject({ code: 'stale' });
		await expect(
			database.update(schema.matches).set({ resultType: 'normal', winnerEntryId: 'entry-a' })
		).rejects.toThrow();

		const reopened = createClient({ url });
		try {
			const rows = await reopened.execute(
				'SELECT map_id FROM tournament_map_pool WHERE tournament_id = ?',
				['t']
			);
			expect(rows.rows[0].map_id).toBe('map-1');
		} finally {
			reopened.close();
		}
	} finally {
		vi.doUnmock('#lib/server/db/index.ts');
		await removeTestDatabase(directory, client);
	}
});

it('upgrades a populated database without losing match and game references', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-migration-'));
	const client = createClient({ url: `file:${join(directory, 'app.db')}` });
	try {
		const oldMigrations = join(directory, 'old-migrations');
		await mkdir(join(oldMigrations, 'meta'), { recursive: true });
		await cp(
			join(process.cwd(), 'drizzle/0000_initial_migrations.sql'),
			join(oldMigrations, '0000_initial_migrations.sql')
		);
		const journal = JSON.parse(
			await readFile(join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8')
		);
		journal.entries = journal.entries.slice(0, 1);
		await writeFile(join(oldMigrations, 'meta/_journal.json'), JSON.stringify(journal));

		const database = drizzle(client, { schema });
		await migrate(database, { migrationsFolder: oldMigrations });
		await client.execute("INSERT INTO tournaments (id, name, slug) VALUES ('t', 'Event', 'event')");
		await database.insert(schema.teams).values([
			{ id: 'a', name: 'A', tag: 'A' },
			{ id: 'b', name: 'B', tag: 'B' },
			{ id: 'c', name: 'C', tag: 'C' }
		]);
		await database.insert(schema.tournamentEntries).values([
			{ id: 'ea', tournamentId: 't', teamId: 'a' },
			{ id: 'eb', tournamentId: 't', teamId: 'b' },
			{ id: 'ec', tournamentId: 't', teamId: 'c' }
		]);
		await client.execute(
			"INSERT INTO matches (id, tournament_id, team_a_entry_id, team_b_entry_id, label) VALUES ('m', 't', 'ea', 'eb', 'Final')"
		);
		await client.execute(
			"INSERT INTO games (id, match_id, number, name) VALUES ('g', 'm', 1, 'Game 1')"
		);

		await migrate(database, { migrationsFolder: join(process.cwd(), 'drizzle') });
		expect((await client.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0);
		expect((await client.execute('PRAGMA foreign_keys')).rows[0].foreign_keys).toBe(1);
		expect(
			(await client.execute('SELECT id FROM games WHERE match_id = ?', ['m'])).rows[0].id
		).toBe('g');
		await expect(
			database.update(schema.matches).set({ resultType: 'normal', winnerEntryId: 'ec' })
		).rejects.toThrow();
	} finally {
		await removeTestDatabase(directory, client);
	}
});
