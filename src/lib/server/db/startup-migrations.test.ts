import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '#lib/server/db/schema/index.ts';
import { removeTestDatabase } from '#lib/server/testing/management-fixture.ts';
import { migrateOnStartup } from './startup-migrations.ts';

const env = vi.hoisted(() => ({ DATABASE_URL: '' }));
vi.mock('$app/env/private', () => env);

type Journal = { entries: { idx: number; when: number; tag: string }[] };
const realFolder = join(process.cwd(), 'drizzle');
const journal: Journal = JSON.parse(
	await readFile(join(realFolder, 'meta', '_journal.json'), 'utf8')
);
const tags = journal.entries.map((entry) => entry.tag);
const lastTag = tags.at(-1)!;

const saved = ['DATABASE_URL', 'ASSET_DIR', 'SETTINGS_ENCRYPTION_KEY_FILE'].map(
	(name) => [name, process.env[name]] as const
);
let directory: string;
let backupRoot: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'vlr-startup-migrations-'));
	await mkdir(join(directory, 'assets'));
	backupRoot = join(directory, 'backups');
	env.DATABASE_URL = `file:${join(directory, 'app.db')}`;
	process.env.DATABASE_URL = 'file:somewhere-else.db';
	process.env.ASSET_DIR = join(directory, 'assets');
	process.env.SETTINGS_ENCRYPTION_KEY_FILE = join(directory, 'settings.key');
	client = createClient({ url: env.DATABASE_URL });
	db = drizzle(client, { schema });
});

afterEach(async () => {
	for (const [name, value] of saved)
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	await removeTestDatabase(directory, client);
});

/** A copy of drizzle/ with the journal rewritten by `edit`. */
async function folder(name: string, edit: (journal: Journal) => Journal) {
	const path = join(directory, name);
	await cp(realFolder, path, { recursive: true });
	await writeFile(
		join(path, 'meta', '_journal.json'),
		JSON.stringify(edit(structuredClone(journal)))
	);
	return path;
}

const partial = () =>
	folder('partial', (copy) => ({ ...copy, entries: copy.entries.slice(0, -1) }));

async function appliedCount() {
	const result = await client.execute('SELECT count(*) AS count FROM __drizzle_migrations');
	return Number(result.rows[0].count);
}

it('does nothing when no migration is pending', async () => {
	await migrate(db, { migrationsFolder: realFolder });
	await expect(migrateOnStartup(db, { migrationsFolder: realFolder, backupRoot })).resolves.toEqual(
		{ applied: [], backup: null }
	);
	expect(existsSync(backupRoot)).toBe(false);
});

it('backs up existing data, then applies pending migrations', async () => {
	await migrate(db, { migrationsFolder: await partial() });
	await db.insert(schema.teams).values({ id: 'kept', name: 'Kept', tag: 'K' });
	const result = await migrateOnStartup(db, {
		migrationsFolder: realFolder,
		backupRoot,
		now: () => new Date('2026-11-17T01:02:03.004Z')
	});
	const backup = join(backupRoot, `2026-11-17T01-02-03-004Z-before-${lastTag}`);
	expect(result).toEqual({ applied: [lastTag], backup });
	const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8'));
	expect(manifest.complete).toBe(true);
	expect(manifest.migrations).toHaveLength(tags.length - 1);
	expect(await appliedCount()).toBe(tags.length);
	expect(await db.select().from(schema.teams)).toMatchObject([{ id: 'kept' }]);
});

it('migrates a new database without a backup', async () => {
	await expect(migrateOnStartup(db, { migrationsFolder: realFolder, backupRoot })).resolves.toEqual(
		{ applied: tags, backup: null }
	);
	expect(await appliedCount()).toBe(tags.length);
	expect(existsSync(backupRoot)).toBe(false);
});

it('does not migrate when the backup fails', async () => {
	await migrate(db, { migrationsFolder: await partial() });
	await expect(
		migrateOnStartup(db, {
			migrationsFolder: realFolder,
			backupRoot,
			backup: () => Promise.reject(new Error('disk full'))
		})
	).rejects.toThrow(/Pre-migration backup failed; no migrations were applied/);
	expect(await appliedCount()).toBe(tags.length - 1);
});

async function brokenFolder() {
	const broken = await folder('broken', (copy) => ({
		...copy,
		entries: [
			...copy.entries,
			{
				idx: copy.entries.length,
				version: '6',
				when: copy.entries.at(-1)!.when + 1,
				tag: '9999_broken',
				breakpoints: true
			}
		]
	}));
	await writeFile(
		join(broken, '9999_broken.sql'),
		'CREATE TABLE broken_one (id integer);\n--> statement-breakpoint\nCREATE TABL broken_two (id integer);'
	);
	return broken;
}

const times = (...isos: string[]) => {
	const dates = isos.map((iso) => new Date(iso));
	return () => dates.shift()!;
};

it('reuses the backup when an unchanged database retries a failed migration', async () => {
	await migrate(db, { migrationsFolder: realFolder });
	const migrationsFolder = await brokenFolder();
	const now = times('2026-11-17T01:00:00.000Z', '2026-11-17T01:01:00.000Z');
	const first = await migrateOnStartup(db, { migrationsFolder, backupRoot, now }).catch(
		(error: Error) => error.message
	);
	const second = await migrateOnStartup(db, { migrationsFolder, backupRoot, now }).catch(
		(error: Error) => error.message
	);
	expect(second).toBe(first);
	expect(await readdir(backupRoot)).toEqual(['2026-11-17T01-00-00-000Z-before-9999_broken']);
});

it('backs up again when the database changed since the last backup', async () => {
	await migrate(db, { migrationsFolder: realFolder });
	const migrationsFolder = await brokenFolder();
	const now = times('2026-11-17T01:00:00.000Z', '2026-11-17T01:01:00.000Z');
	await migrateOnStartup(db, { migrationsFolder, backupRoot, now }).catch(() => {});
	await db.insert(schema.teams).values({ id: 'newer', name: 'Newer', tag: 'N' });
	await migrateOnStartup(db, { migrationsFolder, backupRoot, now }).catch(() => {});
	expect(await readdir(backupRoot)).toEqual([
		'2026-11-17T01-00-00-000Z-before-9999_broken',
		'2026-11-17T01-01-00-000Z-before-9999_broken'
	]);
});

it('rolls back a failing migration and keeps the backup', async () => {
	await migrate(db, { migrationsFolder: realFolder });
	const broken = await brokenFolder();
	const failure = migrateOnStartup(db, { migrationsFolder: broken, backupRoot });
	await expect(failure).rejects.toThrow(/the pre-migration backup is at .*before-9999_broken/);
	const error: Error = await failure.then(
		() => {
			throw new Error('expected a failure');
		},
		(caught: Error) => caught
	);
	expect(error.cause).toBeInstanceOf(Error);
	expect(await appliedCount()).toBe(tags.length);
	const tables = await client.execute(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'broken_one'"
	);
	expect(tables.rows).toHaveLength(0);
	const backup = /backup is at (.*)\.$/.exec(error.message)![1];
	expect(existsSync(join(backup, 'manifest.json'))).toBe(true);
});
