import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAtColumn, updatedAtColumn } from './common';
import { games } from './games';
import { players } from './profiles';
import { tournamentEntries } from './tournaments';

export const statisticFields = [
	'kills',
	'deaths',
	'assists',
	'performanceScore',
	'trades',
	'firstBloods',
	'plants',
	'defuses'
] as const;

export const gamePlayerStatistics = sqliteTable(
	'game_player_statistics',
	{
		gameId: text('game_id')
			.notNull()
			.references(() => games.id, { onDelete: 'cascade' }),
		playerId: text('player_id')
			.notNull()
			.references(() => players.id, { onDelete: 'restrict' }),
		entryId: text('entry_id')
			.notNull()
			.references(() => tournamentEntries.id, { onDelete: 'restrict' }),
		kills: integer('kills'),
		deaths: integer('deaths'),
		assists: integer('assists'),
		performanceScore: integer('performance_score'),
		trades: integer('trades'),
		firstBloods: integer('first_bloods'),
		plants: integer('plants'),
		defuses: integer('defuses'),
		manuallyEditedAt: integer('manually_edited_at', { mode: 'timestamp_ms' }),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		primaryKey({ columns: [table.gameId, table.playerId] }),
		index('game_player_statistics_player_idx').on(table.playerId),
		index('game_player_statistics_entry_idx').on(table.entryId),
		...statisticFields.map((field) =>
			check(
				`game_player_statistics_${field}_check`,
				sql`${table[field]} is null or ${table[field]} >= 0`
			)
		)
	]
);

export const gameStatisticsMeta = sqliteTable('game_statistics_meta', {
	gameId: text('game_id')
		.primaryKey()
		.references(() => games.id, { onDelete: 'cascade' }),
	importSource: text('import_source'),
	externalMatchId: text('external_match_id'),
	importedAt: integer('imported_at', { mode: 'timestamp_ms' }),
	lastManualEditAt: integer('last_manual_edit_at', { mode: 'timestamp_ms' }),
	createdAt: createdAtColumn(),
	updatedAt: updatedAtColumn()
});
