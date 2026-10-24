import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const assetDeletionQueue = sqliteTable('asset_deletion_queue', {
	path: text('path').primaryKey(),
	unreferencedAt: integer('unreferenced_at').notNull()
});
