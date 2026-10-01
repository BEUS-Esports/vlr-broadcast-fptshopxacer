CREATE TABLE `broadcast_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`selected_game_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`swapped` integer DEFAULT false NOT NULL,
	`current_attackers_entry_id` text,
	`visibility` text DEFAULT '{"player-lineup":false,"player-stats":false,"map-veto":false,"agent-select":false,"in-game":false,"post-game":false,"mvp":false}' NOT NULL,
	`player_stats` text DEFAULT '{"mode":"single","scope":"game","playerId":null,"opponentPlayerId":null}' NOT NULL,
	`mvp_scope` text DEFAULT 'game' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`selected_game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`current_attackers_entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "broadcast_singleton_check" CHECK("broadcast_state"."id" = 1),
	CONSTRAINT "broadcast_revision_check" CHECK("broadcast_state"."revision" > 0),
	CONSTRAINT "broadcast_swapped_check" CHECK("broadcast_state"."swapped" in (0, 1)),
	CONSTRAINT "broadcast_mvp_scope_check" CHECK("broadcast_state"."mvp_scope" in ('game', 'match', 'tournament'))
);
