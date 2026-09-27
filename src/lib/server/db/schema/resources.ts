import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAtColumn, idColumn, revisionColumn, updatedAtColumn } from './common';

export const maps = sqliteTable(
	'maps',
	{
		id: idColumn(),
		valorantApiUuid: text('valorant_api_uuid'),
		key: text('key').notNull(),
		displayName: text('display_name').notNull(),
		displayIconPath: text('display_icon_path'),
		listViewIconPath: text('list_view_icon_path'),
		splashPath: text('splash_path'),
		stylizedBackgroundPath: text('stylized_background_path'),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		uniqueIndex('maps_valorant_api_uuid_unique').on(table.valorantApiUuid),
		uniqueIndex('maps_key_unique').on(table.key),
		index('maps_display_name_idx').on(table.displayName),
		index('maps_is_active_idx').on(table.isActive)
	]
);

export const agents = sqliteTable(
	'agents',
	{
		id: idColumn(),
		valorantApiUuid: text('valorant_api_uuid'),
		key: text('key').notNull(),
		displayName: text('display_name').notNull(),
		roleName: text('role_name'),
		displayIconPath: text('display_icon_path'),
		fullPortraitPath: text('full_portrait_path'),
		bustPortraitPath: text('bust_portrait_path'),
		roleIconPath: text('role_icon_path'),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		uniqueIndex('agents_valorant_api_uuid_unique').on(table.valorantApiUuid),
		uniqueIndex('agents_key_unique').on(table.key),
		index('agents_display_name_idx').on(table.displayName),
		index('agents_is_active_idx').on(table.isActive)
	]
);

export const weapons = sqliteTable(
	'weapons',
	{
		id: idColumn(),
		valorantApiUuid: text('valorant_api_uuid'),
		key: text('key').notNull(),
		displayName: text('display_name').notNull(),
		category: text('category'),
		displayIconPath: text('display_icon_path'),
		killStreamIconPath: text('kill_stream_icon_path'),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		uniqueIndex('weapons_valorant_api_uuid_unique').on(table.valorantApiUuid),
		uniqueIndex('weapons_key_unique').on(table.key),
		index('weapons_display_name_idx').on(table.displayName),
		index('weapons_category_idx').on(table.category),
		index('weapons_is_active_idx').on(table.isActive)
	]
);
