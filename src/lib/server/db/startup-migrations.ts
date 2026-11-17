import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DATABASE_URL } from '$app/env/private';
import { createBackup } from '../../../../scripts/backup.mjs';

const FAILURE_MARKER = 'MIGRATION-FAILED';

/** Records a failed attempt so Docker's restarts don't back up and retry it every minute. */
async function recordFailure(
	marker: string,
	tag: string,
	at: Date,
	backup: string | null,
	error: Error
) {
	const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? '');
	await writeFile(
		marker,
		[
			`Migration to ${tag} failed at ${at.toISOString()}.`,
			`Backup: ${backup ?? 'none'}`,
			`Error: ${error.message}`,
			`Cause: ${cause}`,
			'Pending migrations are not retried while this file exists. Roll back the code,',
			'or fix the migration, then delete this file to back up and migrate again.',
			''
		].join('\n')
	);
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

	const tag = pending.at(-1)!;
	const marker = join(backupRoot, FAILURE_MARKER);
	if (existsSync(marker))
		throw new Error(
			`A previous migration failed; nothing was retried. Read ${marker}, then delete it to retry.`
		);

	const at = now();
	let backupPath: string | null = null;
	try {
		if (latest !== null) {
			const target = join(backupRoot, `${at.toISOString().replace(/[:.]/g, '-')}-before-${tag}`);
			try {
				await mkdir(backupRoot, { recursive: true });
				await backup(target);
				backupPath = target;
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
	} catch (error) {
		// Best effort: a full disk may refuse the marker too, and the original error matters more.
		await mkdir(backupRoot, { recursive: true })
			.then(() => recordFailure(marker, tag, at, backupPath, error as Error))
			.catch(() => {});
		throw error;
	}
	return { applied: pending, backup: backupPath };
}
