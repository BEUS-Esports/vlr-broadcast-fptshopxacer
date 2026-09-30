import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import {
	createdAtColumn,
	idColumn,
	resultTypes,
	revisionColumn,
	sideChoices,
	updatedAtColumn,
	vetoActionTypes
} from './common';
import { maps } from './resources';
import { players } from './profiles';
import { tournamentEntries, tournaments } from './tournaments';

export const matches = sqliteTable(
	'matches',
	{
		id: idColumn(),
		tournamentId: text('tournament_id')
			.notNull()
			.references(() => tournaments.id, { onDelete: 'restrict' }),
		teamAEntryId: text('team_a_entry_id').notNull(),
		teamBEntryId: text('team_b_entry_id').notNull(),
		label: text('label').notNull(),
		bestOf: integer('best_of').notNull().default(3),
		resultType: text('result_type', { enum: resultTypes }),
		winnerEntryId: text('winner_entry_id'),
		mvpPlayerId: text('mvp_player_id').references(() => players.id, { onDelete: 'restrict' }),
		revision: revisionColumn(),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		index('matches_tournament_idx').on(table.tournamentId),
		index('matches_team_a_entry_idx').on(table.teamAEntryId),
		index('matches_team_b_entry_idx').on(table.teamBEntryId),
		index('matches_winner_entry_idx').on(table.winnerEntryId),
		foreignKey({
			name: 'matches_team_a_tournament_fk',
			columns: [table.teamAEntryId, table.tournamentId],
			foreignColumns: [tournamentEntries.id, tournamentEntries.tournamentId]
		}).onDelete('restrict'),
		foreignKey({
			name: 'matches_team_b_tournament_fk',
			columns: [table.teamBEntryId, table.tournamentId],
			foreignColumns: [tournamentEntries.id, tournamentEntries.tournamentId]
		}).onDelete('restrict'),
		foreignKey({
			name: 'matches_winner_tournament_fk',
			columns: [table.winnerEntryId, table.tournamentId],
			foreignColumns: [tournamentEntries.id, tournamentEntries.tournamentId]
		}).onDelete('restrict'),
		check('matches_distinct_teams_check', sql`${table.teamAEntryId} <> ${table.teamBEntryId}`),
		check(
			'matches_winner_participant_check',
			sql`${table.winnerEntryId} is null or ${table.winnerEntryId} = ${table.teamAEntryId} or ${table.winnerEntryId} = ${table.teamBEntryId}`
		),
		check('matches_best_of_check', sql`${table.bestOf} in (1, 2, 3, 5)`),
		check(
			'matches_result_type_check',
			sql`${table.resultType} is null or ${table.resultType} in ('normal', 'forfeit', 'walkover', 'cancelled')`
		),
		check(
			'matches_result_state_check',
			sql`(
				(${table.resultType} is null and ${table.winnerEntryId} is null)
				or (${table.resultType} = 'normal' and (${table.winnerEntryId} is not null or ${table.bestOf} = 2))
				or (${table.resultType} in ('forfeit', 'walkover') and ${table.winnerEntryId} is not null)
				or (${table.resultType} = 'cancelled' and ${table.winnerEntryId} is null)
			)`
		)
	]
);

export const matchVetoActions = sqliteTable(
	'match_veto_actions',
	{
		id: idColumn(),
		matchId: text('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		sequence: integer('sequence').notNull(),
		action: text('action', { enum: vetoActionTypes }).notNull(),
		mapId: text('map_id')
			.notNull()
			.references(() => maps.id, { onDelete: 'restrict' }),
		actingEntryId: text('acting_entry_id').references(() => tournamentEntries.id, {
			onDelete: 'restrict'
		}),
		gameNumber: integer('game_number'),
		sideChooserEntryId: text('side_chooser_entry_id').references(() => tournamentEntries.id, {
			onDelete: 'restrict'
		}),
		sideChoice: text('side_choice', { enum: sideChoices }),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		uniqueIndex('match_veto_actions_match_sequence_unique').on(table.matchId, table.sequence),
		uniqueIndex('match_veto_actions_match_map_unique').on(table.matchId, table.mapId),
		uniqueIndex('match_veto_actions_match_game_number_unique').on(table.matchId, table.gameNumber),
		index('match_veto_actions_map_idx').on(table.mapId),
		index('match_veto_actions_acting_entry_idx').on(table.actingEntryId),
		check('match_veto_actions_sequence_check', sql`${table.sequence} > 0`),
		check(
			'match_veto_actions_game_number_check',
			sql`${table.gameNumber} is null or ${table.gameNumber} > 0`
		),
		check('match_veto_actions_action_check', sql`${table.action} in ('ban', 'pick', 'decider')`),
		check(
			'match_veto_actions_side_choice_check',
			sql`${table.sideChoice} is null or ${table.sideChoice} in ('attack', 'defense')`
		),
		check(
			'match_veto_actions_side_assignment_check',
			sql`(${table.sideChooserEntryId} is null and ${table.sideChoice} is null) or (${table.sideChooserEntryId} is not null and ${table.sideChoice} is not null and ${table.gameNumber} is not null)`
		)
	]
);
