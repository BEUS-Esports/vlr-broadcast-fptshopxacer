import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdir, open, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATABASE_URL } from '$app/env/private';
import { createBackup } from '../../../../scripts/backup.mjs';

const STATE_FILE = 'source-state.json';
type SourceState = { latest: number; changeCounter: number };

/** SQLite's file change counter: outside WAL mode it changes on every committed write. */
async function sourceState<TSchema extends Record<string, unknown>>(
	db: LibSQLDatabase<TSchema>,
	latest: number
): Promise<SourceState | null> {
	const [{ journal_mode: mode }] = await db.all<{ journal_mode: string }>(sql`PRAGMA journal_mode`);
	if (mode === 'wal' || !DATABASE_URL.startsWith('file:') || /[?#]/.test(DATABASE_URL)) return null;
	const path = DATABASE_URL.startsWith('file://')
		? fileURLToPath(DATABASE_URL)
		: resolve(DATABASE_URL.slice(5));
	const handle = await open(path, 'r');
	try {
		const header = Buffer.alloc(4);
		await handle.read(header, 0, 4, 24);
		return { latest, changeCounter: header.readUInt32BE(0) };
	} finally {
		await handle.close();
	}
}

/** The newest complete backup for `tag`, if the database has not changed since it was taken. */
async function reusableBackup(backupRoot: string, tag: string, state: SourceState) {
	let names: string[];
	try {
		names = await readdir(backupRoot);
	} catch {
		return null;
	}
	const newest = names
		.filter((name) => name.endsWith(`-before-${tag}`))
		.sort()
		.at(-1);
	if (!newest) return null;
	const path = join(backupRoot, newest);
	try {
		const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
		const saved: SourceState = JSON.parse(await readFile(join(path, STATE_FILE), 'utf8'));
		return manifest.complete === true &&
			saved.latest === state.latest &&
			saved.changeCounter === state.changeCounter
			? path
			: null;
	} catch {
		return null;
	}
}

type Options = {
	migrationsFolder?: string;
	backupRoot?: string;
	now?: () => Date;
	backup?: (output: string) => Promise<unknown>;
};

/** Applies pending migrations before the server serves, backing up existing data first. */
export async function migrateOnStartup<TSchema extends Record<string, unknown>>(
	db: LibSQLDatabase<TSchema>,
	{
		migrationsFolder = resolve('drizzle'),
		backupRoot = resolve('data/backups'),
		now = () => new Date(),
		// Back up the database `db` opened, even when process.env disagrees with the app's env.
		backup = (output) =>
			createBackup({ output, appStopped: true, env: { ...process.env, DATABASE_URL } })
	}: Options = {}
): Promise<{ applied: string[]; backup: string | null }> {
	const journal: { entries: { when: number; tag: string }[] } = JSON.parse(
		await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
	);
	// Drizzle's own rule: a migration is pending when it is newer than the latest applied one.
	const table = await db.all(
		sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`
	);
	const latest = table.length
		? (
				await db.all<{ latest: number | null }>(
					sql`SELECT MAX(created_at) AS latest FROM __drizzle_migrations`
				)
			)[0].latest
		: null;
	const pending = journal.entries
		.filter((entry) => latest === null || entry.when > Number(latest))
		.map((entry) => entry.tag);
	if (!pending.length) return { applied: [], backup: null };

	let backupPath: string | null = null;
	if (latest !== null) {
		const tag = pending.at(-1)!;
		const state = await sourceState(db, Number(latest));
		// A failed migration exits and Docker restarts the app; don't copy the same data every time.
		backupPath = state && (await reusableBackup(backupRoot, tag, state));
		if (!backupPath) {
			const stamp = now().toISOString().replace(/[:.]/g, '-');
			backupPath = join(backupRoot, `${stamp}-before-${tag}`);
			try {
				await mkdir(backupRoot, { recursive: true });
				await backup(backupPath);
				if (state) await writeFile(join(backupPath, STATE_FILE), JSON.stringify(state) + '\n');
			} catch (cause) {
				throw new Error('Pre-migration backup failed; no migrations were applied.', { cause });
			}
		}
	}
	try {
		await migrate(db, { migrationsFolder });
	} catch (cause) {
		throw new Error(
			backupPath
				? `Database migration failed; the pre-migration backup is at ${backupPath}.`
				: 'Database migration failed; no backup was needed.',
			{ cause }
		);
	}
	return { applied: pending, backup: backupPath };
}
