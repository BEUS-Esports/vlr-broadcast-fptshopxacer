import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
	defaultPlayerStats,
	defaultVisibility,
	type BroadcastScope,
	type GraphicVisibility,
	type PlayerStatsControl
} from '#lib/broadcast/controls.ts';
import { createdAtColumn, revisionColumn, updatedAtColumn } from './common';
import { games } from './games';
import { tournamentEntries } from './tournaments';
import type { BroadcastPublications } from '#lib/broadcast/types.ts';
import type {
	BroadcastPauseState,
	BroadcastCeremonyEvent
} from '#lib/broadcast/in-game-controls.ts';

export const broadcastState = sqliteTable(
	'broadcast_state',
	{
		id: integer('id').primaryKey().default(1),
		selectedGameId: text('selected_game_id').references(() => games.id, { onDelete: 'restrict' }),
		// `revision` is prepared-data invalidation; operator stale-write locking is separate.
		dataRevision: revisionColumn(),
		controlRevision: integer('control_revision').notNull().default(1),
		swapped: integer('swapped', { mode: 'boolean' }).notNull().default(false),
		pause: text('pause', { mode: 'json' })
			.$type<BroadcastPauseState>()
			.notNull()
			.default({ type: 'none' }),
		ceremony: text('ceremony', { mode: 'json' }).$type<BroadcastCeremonyEvent>(),
		currentAttackersEntryId: text('current_attackers_entry_id').references(
			() => tournamentEntries.id,
			{ onDelete: 'restrict' }
		),
		visibility: text('visibility', { mode: 'json' })
			.$type<GraphicVisibility>()
			.notNull()
			.default(defaultVisibility),
		publications: text('publications', { mode: 'json' })
			.$type<BroadcastPublications>()
			.notNull()
			.default({
				'player-lineup': null,
				'player-stats': null,
				'map-veto': null,
				'agent-select': null,
				'in-game': null,
				'post-game': null,
				mvp: null
			}),
		playerStats: text('player_stats', { mode: 'json' })
			.$type<PlayerStatsControl>()
			.notNull()
			.default(defaultPlayerStats),
		mvpScope: text('mvp_scope', { enum: ['game', 'match', 'tournament'] })
			.$type<BroadcastScope>()
			.notNull()
			.default('game'),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		check('broadcast_singleton_check', sql`${table.id} = 1`),
		check('broadcast_revision_check', sql`${table.dataRevision} > 0`),
		check('broadcast_swapped_check', sql`${table.swapped} in (0, 1)`),
		check('broadcast_mvp_scope_check', sql`${table.mvpScope} in ('game', 'match', 'tournament')`)
	]
);
