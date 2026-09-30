import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import * as s from '#lib/server/db/schema/index.ts';
import {
	removeTestDatabase,
	withManagementFixture
} from '#lib/server/testing/management-fixture.ts';

it('rejects invalid stored statistics and cascades game deletion without removing profiles', async () => {
	await withManagementFixture(async ({ db, client }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		const row = { gameId: 'g', playerId: 'a1', entryId: 'entry-a', kills: 0 };
		await expect(db.insert(s.gamePlayerStatistics).values({ ...row, kills: -1 })).rejects.toThrow();
		await db.insert(s.gamePlayerStatistics).values(row);
		await expect(db.insert(s.gamePlayerStatistics).values(row)).rejects.toThrow();
		await expect(db.update(s.games).set({ mvpPlayerId: 'missing' })).rejects.toThrow();
		await expect(db.delete(s.players).where(eq(s.players.id, 'a1'))).rejects.toThrow();
		await db.insert(s.gameStatisticsMeta).values({ gameId: 'g', lastManualEditAt: new Date() });
		await db.delete(s.games).where(eq(s.games.id, 'g'));
		expect(
			(await client.execute('SELECT COUNT(*) AS n FROM game_player_statistics')).rows[0].n
		).toBe(0);
		expect((await client.execute('SELECT COUNT(*) AS n FROM game_statistics_meta')).rows[0].n).toBe(
			0
		);
		expect(
			(await client.execute("SELECT COUNT(*) AS n FROM players WHERE id = 'a1'")).rows[0].n
		).toBe(1);
	});
});

it('upgrades populated Phase 3 records with foreign keys intact', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-phase4-upgrade-'));
	const client = createClient({ url: `file:${join(directory, 'app.db')}` });
	try {
		const old = join(directory, 'phase3-migrations');
		await mkdir(join(old, 'meta'), { recursive: true });
		const root = join(process.cwd(), 'drizzle');
		for (const file of [
			'0000_initial_migrations.sql',
			'0001_match_winner_participant.sql',
			'0002_high_steel_serpent.sql'
		])
			await cp(join(root, file), join(old, file));
		const journal = JSON.parse(await readFile(join(root, 'meta/_journal.json'), 'utf8'));
		journal.entries = journal.entries.slice(0, 3);
		await writeFile(join(old, 'meta/_journal.json'), JSON.stringify(journal));
		const db = drizzle(client, { schema: s });
		await migrate(db, { migrationsFolder: old });
		await client.execute("INSERT INTO tournaments (id, name, slug) VALUES ('t', 'Event', 'event')");
		await db.insert(s.teams).values([
			{ id: 'a', name: 'A', tag: 'A' },
			{ id: 'b', name: 'B', tag: 'B' }
		]);
		await db.insert(s.players).values({ id: 'p', displayName: 'Player' });
		await db.insert(s.tournamentEntries).values([
			{ id: 'ea', tournamentId: 't', teamId: 'a' },
			{ id: 'eb', tournamentId: 't', teamId: 'b' }
		]);
		await client.execute(
			"INSERT INTO matches (id, tournament_id, team_a_entry_id, team_b_entry_id, label) VALUES ('m', 't', 'ea', 'eb', 'Final')"
		);
		await client.execute(
			"INSERT INTO games (id, match_id, number, name) VALUES ('g', 'm', 1, 'One')"
		);
		await db.insert(s.gameLineups).values({ gameId: 'g', entryId: 'ea', slot: 1, playerId: 'p' });
		await migrate(db, { migrationsFolder: root });
		expect((await client.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0);
		expect(
			(await client.execute("SELECT player_id FROM game_lineups WHERE game_id = 'g'")).rows[0]
				.player_id
		).toBe('p');
		await db
			.insert(s.gamePlayerStatistics)
			.values({ gameId: 'g', playerId: 'p', entryId: 'ea', kills: 0 });
		expect((await db.select().from(s.gamePlayerStatistics))[0].kills).toBe(0);
	} finally {
		await removeTestDatabase(directory, client);
	}
});
