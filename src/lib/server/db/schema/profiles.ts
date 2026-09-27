import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
	archivedAtColumn,
	createdAtColumn,
	idColumn,
	revisionColumn,
	updatedAtColumn
} from './common';

export const teams = sqliteTable(
	'teams',
	{
		id: idColumn(),
		name: text('name').notNull(),
		tag: text('tag').notNull(),
		logoPath: text('logo_path'),
		logoWhitePath: text('logo_white_path'),
		logoBlackPath: text('logo_black_path'),
		archivedAt: archivedAtColumn(),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		index('teams_name_idx').on(table.name),
		index('teams_tag_idx').on(table.tag),
		index('teams_archived_at_idx').on(table.archivedAt)
	]
);

export const players = sqliteTable(
	'players',
	{
		id: idColumn(),
		displayName: text('display_name').notNull(),
		fullName: text('full_name'),
		riotId: text('riot_id'),
		portraitPath: text('portrait_path'),
		archivedAt: archivedAtColumn(),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		index('players_display_name_idx').on(table.displayName),
		index('players_riot_id_idx').on(table.riotId),
		index('players_archived_at_idx').on(table.archivedAt)
	]
);
