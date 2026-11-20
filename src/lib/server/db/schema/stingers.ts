import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAtColumn, idColumn, revisionColumn, updatedAtColumn } from './common';

export const stingers = sqliteTable(
	'stingers',
	{
		id: idColumn(),
		name: text('name').notNull(),
		path: text('path').notNull(),
		kind: text('kind', { enum: ['video', 'image'] }).notNull(),
		durationMs: integer('duration_ms').notNull(),
		cutPointMs: integer('cut_point_ms').notNull(),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		check('stingers_revision_check', sql`${table.revision} > 0`),
		check('stingers_duration_check', sql`${table.durationMs} between 1 and 60000`),
		check('stingers_cut_point_check', sql`${table.cutPointMs} between 0 and ${table.durationMs}`)
	]
);

export const stingerSettings = sqliteTable(
	'stinger_settings',
	{
		id: integer('id').primaryKey().default(1),
		revision: revisionColumn(),
		activeStingerId: text('active_stinger_id').references(() => stingers.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		check('stinger_settings_singleton_check', sql`${table.id} = 1`),
		check('stinger_settings_revision_check', sql`${table.revision} > 0`)
	]
);
