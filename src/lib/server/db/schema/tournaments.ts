import {
	index,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import {
	archivedAtColumn,
	createdAtColumn,
	idColumn,
	revisionColumn,
	updatedAtColumn
} from './common';
import { players, teams } from './profiles';
import { maps } from './resources';

export const tournaments = sqliteTable(
	'tournaments',
	{
		id: idColumn(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		archivedAt: archivedAtColumn(),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		uniqueIndex('tournaments_slug_unique').on(table.slug),
		index('tournaments_name_idx').on(table.name),
		index('tournaments_archived_at_idx').on(table.archivedAt)
	]
);

export const tournamentEntries = sqliteTable(
	'tournament_entries',
	{
		id: idColumn(),
		tournamentId: text('tournament_id')
			.notNull()
			.references(() => tournaments.id, { onDelete: 'restrict' }),
		teamId: text('team_id')
			.notNull()
			.references(() => teams.id, { onDelete: 'restrict' }),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		uniqueIndex('tournament_entries_tournament_team_unique').on(
			table.tournamentId,
			table.teamId
		),
		uniqueIndex('tournament_entries_id_tournament_unique').on(
			table.id,
			table.tournamentId
		),
		index('tournament_entries_tournament_idx').on(table.tournamentId),
		index('tournament_entries_team_idx').on(table.teamId)
	]
);

export const tournamentEntryPlayers = sqliteTable(
	'tournament_entry_players',
	{
		entryId: text('entry_id')
			.notNull()
			.references(() => tournamentEntries.id, { onDelete: 'cascade' }),
		playerId: text('player_id')
			.notNull()
			.references(() => players.id, { onDelete: 'restrict' })
	},
	(table) => [
		primaryKey({ columns: [table.entryId, table.playerId] }),
		index('tournament_entry_players_player_idx').on(table.playerId)
	]
);

export const tournamentMapPool = sqliteTable(
	'tournament_map_pool',
	{
		tournamentId: text('tournament_id')
			.notNull()
			.references(() => tournaments.id, { onDelete: 'cascade' }),
		mapId: text('map_id')
			.notNull()
			.references(() => maps.id, { onDelete: 'restrict' })
	},
	(table) => [
		primaryKey({ columns: [table.tournamentId, table.mapId] }),
		index('tournament_map_pool_map_idx').on(table.mapId)
	]
);
