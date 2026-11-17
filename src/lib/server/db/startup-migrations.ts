import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DATABASE_URL } from '$app/env/private';
import { createBackup } from '../../../../scripts/backup.mjs';

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
		const stamp = now().toISOString().replace(/[:.]/g, '-');
		backupPath = join(backupRoot, `${stamp}-before-${pending.at(-1)}`);
		try {
			await mkdir(backupRoot, { recursive: true });
			await backup(backupPath);
		} catch (cause) {
			throw new Error('Pre-migration backup failed; no migrations were applied.', { cause });
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
