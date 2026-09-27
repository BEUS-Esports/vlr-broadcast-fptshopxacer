import { sql } from 'drizzle-orm';
import { integer, text } from 'drizzle-orm/sqlite-core';

export const resultTypes = ['normal', 'forfeit', 'walkover', 'cancelled'] as const;
export const vetoActionTypes = ['ban', 'pick', 'decider'] as const;
export const sideChoices = ['attack', 'defense'] as const;

export const idColumn = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

export const createdAtColumn = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch('subsecond') * 1000)`);

export const updatedAtColumn = () =>
	integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch('subsecond') * 1000)`)
		.$onUpdate(() => new Date());

export const revisionColumn = () => integer('revision').notNull().default(1);

export const archivedAtColumn = () => integer('archived_at', { mode: 'timestamp_ms' });
