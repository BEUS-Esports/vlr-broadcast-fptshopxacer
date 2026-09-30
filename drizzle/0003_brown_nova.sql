CREATE TABLE `game_player_statistics` (
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`kills` integer,
	`deaths` integer,
	`assists` integer,
	`performance_score` integer,
	`trades` integer,
	`first_bloods` integer,
	`plants` integer,
	`defuses` integer,
	`manually_edited_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	PRIMARY KEY(`game_id`, `player_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "game_player_statistics_kills_check" CHECK("game_player_statistics"."kills" is null or "game_player_statistics"."kills" >= 0),
	CONSTRAINT "game_player_statistics_deaths_check" CHECK("game_player_statistics"."deaths" is null or "game_player_statistics"."deaths" >= 0),
	CONSTRAINT "game_player_statistics_assists_check" CHECK("game_player_statistics"."assists" is null or "game_player_statistics"."assists" >= 0),
	CONSTRAINT "game_player_statistics_performanceScore_check" CHECK("game_player_statistics"."performance_score" is null or "game_player_statistics"."performance_score" >= 0),
	CONSTRAINT "game_player_statistics_trades_check" CHECK("game_player_statistics"."trades" is null or "game_player_statistics"."trades" >= 0),
	CONSTRAINT "game_player_statistics_firstBloods_check" CHECK("game_player_statistics"."first_bloods" is null or "game_player_statistics"."first_bloods" >= 0),
	CONSTRAINT "game_player_statistics_plants_check" CHECK("game_player_statistics"."plants" is null or "game_player_statistics"."plants" >= 0),
	CONSTRAINT "game_player_statistics_defuses_check" CHECK("game_player_statistics"."defuses" is null or "game_player_statistics"."defuses" >= 0)
);
--> statement-breakpoint
CREATE INDEX `game_player_statistics_player_idx` ON `game_player_statistics` (`player_id`);--> statement-breakpoint
CREATE INDEX `game_player_statistics_entry_idx` ON `game_player_statistics` (`entry_id`);--> statement-breakpoint
CREATE TABLE `game_statistics_meta` (
	`game_id` text PRIMARY KEY NOT NULL,
	`import_source` text,
	`external_match_id` text,
	`imported_at` integer,
	`last_manual_edit_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `games` ADD `mvp_player_id` text REFERENCES players(id);--> statement-breakpoint
ALTER TABLE `tournaments` ADD `mvp_player_id` text REFERENCES players(id);--> statement-breakpoint
ALTER TABLE `matches` ADD `mvp_player_id` text REFERENCES players(id);