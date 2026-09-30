import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { createdAtColumn, idColumn, resultTypes, revisionColumn, updatedAtColumn } from './common';
import { matches } from './matches';
import { players } from './profiles';
import { agents, maps } from './resources';
import { tournamentEntries } from './tournaments';

export const games = sqliteTable(
	'games',
	{
		id: idColumn(),
		matchId: text('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'restrict' }),
		number: integer('number').notNull(),
		name: text('name').notNull(),
		mapId: text('map_id').references(() => maps.id, { onDelete: 'restrict' }),
		startingAttackersEntryId: text('starting_attackers_entry_id').references(
			() => tournamentEntries.id,
			{ onDelete: 'restrict' }
		),
		startingDefendersEntryId: text('starting_defenders_entry_id').references(
			() => tournamentEntries.id,
			{ onDelete: 'restrict' }
		),
		scoreA: integer('score_a'),
		scoreB: integer('score_b'),
		resultType: text('result_type', { enum: resultTypes }),
		winnerEntryId: text('winner_entry_id').references(() => tournamentEntries.id, {
			onDelete: 'restrict'
		}),
		mvpPlayerId: text('mvp_player_id').references(() => players.id, { onDelete: 'restrict' }),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		uniqueIndex('games_match_number_unique').on(table.matchId, table.number),
		index('games_map_idx').on(table.mapId),
		index('games_winner_entry_idx').on(table.winnerEntryId),
		check('games_number_check', sql`${table.number} > 0`),
		check('games_score_a_check', sql`${table.scoreA} is null or ${table.scoreA} >= 0`),
		check('games_score_b_check', sql`${table.scoreB} is null or ${table.scoreB} >= 0`),
		check(
			'games_scores_pair_check',
			sql`(${table.scoreA} is null and ${table.scoreB} is null) or (${table.scoreA} is not null and ${table.scoreB} is not null)`
		),
		check(
			'games_starting_sides_check',
			sql`(${table.startingAttackersEntryId} is null and ${table.startingDefendersEntryId} is null) or (${table.startingAttackersEntryId} is not null and ${table.startingDefendersEntryId} is not null and ${table.startingAttackersEntryId} <> ${table.startingDefendersEntryId})`
		),
		check(
			'games_result_type_check',
			sql`${table.resultType} is null or ${table.resultType} in ('normal', 'forfeit', 'walkover', 'cancelled')`
		),
		check(
			'games_result_state_check',
			sql`(
				(${table.resultType} is null and ${table.winnerEntryId} is null)
				or (
					${table.resultType} = 'normal'
					and ${table.winnerEntryId} is not null
					and ${table.scoreA} is not null
					and ${table.scoreB} is not null
					and ${table.scoreA} <> ${table.scoreB}
				)
				or (
					${table.resultType} in ('forfeit', 'walkover')
					and ${table.winnerEntryId} is not null
					and ${table.scoreA} is null
					and ${table.scoreB} is null
				)
				or (
					${table.resultType} = 'cancelled'
					and ${table.winnerEntryId} is null
					and ${table.scoreA} is null
					and ${table.scoreB} is null
				)
			)`
		)
	]
);

export const gameLineups = sqliteTable(
	'game_lineups',
	{
		gameId: text('game_id')
			.notNull()
			.references(() => games.id, { onDelete: 'cascade' }),
		entryId: text('entry_id')
			.notNull()
			.references(() => tournamentEntries.id, { onDelete: 'restrict' }),
		slot: integer('slot').notNull(),
		playerId: text('player_id').references(() => players.id, { onDelete: 'restrict' }),
		agentId: text('agent_id').references(() => agents.id, { onDelete: 'restrict' })
	},
	(table) => [
		primaryKey({ columns: [table.gameId, table.entryId, table.slot] }),
		uniqueIndex('game_lineups_game_player_unique').on(table.gameId, table.playerId),
		index('game_lineups_entry_idx').on(table.entryId),
		index('game_lineups_player_idx').on(table.playerId),
		index('game_lineups_agent_idx').on(table.agentId),
		check('game_lineups_slot_check', sql`${table.slot} between 1 and 5`)
	]
);
