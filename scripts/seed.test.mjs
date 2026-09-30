import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('seeds profiles once without overwriting later edits', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-seed-'));
	const url = `file:${join(directory, 'app.db')}`;
	const run = (args) =>
		spawnSync(process.execPath, args, {
			cwd: process.cwd(),
			env: { ...process.env, DATABASE_URL: url },
			encoding: 'utf8'
		});
	const execute = (code) => {
		const result = run(['--input-type=module', '-e', code]);
		assert.equal(result.status, 0, result.stderr);
		return result.stdout.trim();
	};
	try {
		execute(
			"import { createClient } from '@libsql/client'; import { drizzle } from 'drizzle-orm/libsql'; import { migrate } from 'drizzle-orm/libsql/migrator'; const client = createClient({ url: process.env.DATABASE_URL }); await migrate(drizzle(client), { migrationsFolder: 'drizzle' }); client.close();"
		);
		const first = run(['--env-file-if-exists=.env', 'scripts/seed.mjs']);
		assert.equal(first.status, 0, first.stderr);
		const profileSql =
			"import { createClient } from '@libsql/client'; const client = createClient({ url: process.env.DATABASE_URL }); const rows = await client.execute(\"SELECT (SELECT count(*) FROM teams) AS teams, (SELECT count(*) FROM players) AS players, (SELECT name FROM teams WHERE id = 'seed-team-alpha') AS teamName, (SELECT display_name FROM players WHERE id = 'seed-player-alpha-1') AS playerName\"); console.log(JSON.stringify(rows.rows[0])); client.close();";
		const initial = JSON.parse(execute(profileSql));
		assert.equal(initial.teams, 3);
		assert.equal(initial.players, 18);
		execute(
			"import { createClient } from '@libsql/client'; const client = createClient({ url: process.env.DATABASE_URL }); await client.batch([\"UPDATE teams SET name = 'Edited' WHERE id = 'seed-team-alpha'\", \"UPDATE players SET display_name = 'Edited' WHERE id = 'seed-player-alpha-1'\"]); client.close();"
		);
		const second = run(['--env-file-if-exists=.env', 'scripts/seed.mjs']);
		assert.equal(second.status, 0, second.stderr);
		assert.deepEqual(JSON.parse(execute(profileSql)), {
			teams: 3,
			players: 18,
			teamName: 'Edited',
			playerName: 'Edited'
		});
	} finally {
		await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	}
});
