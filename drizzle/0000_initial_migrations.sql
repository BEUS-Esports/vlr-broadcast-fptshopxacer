CREATE TABLE `game_lineups` (
	`game_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`slot` integer NOT NULL,
	`player_id` text,
	`agent_id` text,
	PRIMARY KEY(`game_id`, `entry_id`, `slot`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "game_lineups_slot_check" CHECK("game_lineups"."slot" between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_lineups_game_player_unique` ON `game_lineups` (`game_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `game_lineups_entry_idx` ON `game_lineups` (`entry_id`);--> statement-breakpoint
CREATE INDEX `game_lineups_player_idx` ON `game_lineups` (`player_id`);--> statement-breakpoint
CREATE INDEX `game_lineups_agent_idx` ON `game_lineups` (`agent_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`map_id` text,
	`starting_attackers_entry_id` text,
	`starting_defenders_entry_id` text,
	`score_a` integer,
	`score_b` integer,
	`result_type` text,
	`winner_entry_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`starting_attackers_entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`starting_defenders_entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`winner_entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "games_number_check" CHECK("games"."number" > 0),
	CONSTRAINT "games_score_a_check" CHECK("games"."score_a" is null or "games"."score_a" >= 0),
	CONSTRAINT "games_score_b_check" CHECK("games"."score_b" is null or "games"."score_b" >= 0),
	CONSTRAINT "games_scores_pair_check" CHECK(("games"."score_a" is null and "games"."score_b" is null) or ("games"."score_a" is not null and "games"."score_b" is not null)),
	CONSTRAINT "games_starting_sides_check" CHECK("games"."starting_attackers_entry_id" is null or "games"."starting_defenders_entry_id" is null or "games"."starting_attackers_entry_id" <> "games"."starting_defenders_entry_id"),
	CONSTRAINT "games_result_type_check" CHECK("games"."result_type" is null or "games"."result_type" in ('normal', 'forfeit', 'walkover', 'cancelled')),
	CONSTRAINT "games_result_state_check" CHECK((
				("games"."result_type" is null and "games"."winner_entry_id" is null)
				or (
					"games"."result_type" = 'normal'
					and "games"."winner_entry_id" is not null
					and "games"."score_a" is not null
					and "games"."score_b" is not null
					and "games"."score_a" <> "games"."score_b"
				)
				or (
					"games"."result_type" in ('forfeit', 'walkover')
					and "games"."winner_entry_id" is not null
					and "games"."score_a" is null
					and "games"."score_b" is null
				)
				or (
					"games"."result_type" = 'cancelled'
					and "games"."winner_entry_id" is null
					and "games"."score_a" is null
					and "games"."score_b" is null
				)
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_match_number_unique` ON `games` (`match_id`,`number`);--> statement-breakpoint
CREATE INDEX `games_map_idx` ON `games` (`map_id`);--> statement-breakpoint
CREATE INDEX `games_winner_entry_idx` ON `games` (`winner_entry_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`full_name` text,
	`riot_id` text,
	`portrait_path` text,
	`archived_at` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_display_name_idx` ON `players` (`display_name`);--> statement-breakpoint
CREATE INDEX `players_riot_id_idx` ON `players` (`riot_id`);--> statement-breakpoint
CREATE INDEX `players_archived_at_idx` ON `players` (`archived_at`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tag` text NOT NULL,
	`logo_path` text,
	`logo_white_path` text,
	`logo_black_path` text,
	`archived_at` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `teams_name_idx` ON `teams` (`name`);--> statement-breakpoint
CREATE INDEX `teams_tag_idx` ON `teams` (`tag`);--> statement-breakpoint
CREATE INDEX `teams_archived_at_idx` ON `teams` (`archived_at`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`valorant_api_uuid` text,
	`key` text NOT NULL,
	`display_name` text NOT NULL,
	`role_name` text,
	`display_icon_path` text,
	`full_portrait_path` text,
	`bust_portrait_path` text,
	`role_icon_path` text,
	`is_active` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_valorant_api_uuid_unique` ON `agents` (`valorant_api_uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_key_unique` ON `agents` (`key`);--> statement-breakpoint
CREATE INDEX `agents_display_name_idx` ON `agents` (`display_name`);--> statement-breakpoint
CREATE INDEX `agents_is_active_idx` ON `agents` (`is_active`);--> statement-breakpoint
CREATE TABLE `maps` (
	`id` text PRIMARY KEY NOT NULL,
	`valorant_api_uuid` text,
	`key` text NOT NULL,
	`display_name` text NOT NULL,
	`display_icon_path` text,
	`list_view_icon_path` text,
	`splash_path` text,
	`stylized_background_path` text,
	`is_active` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_valorant_api_uuid_unique` ON `maps` (`valorant_api_uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `maps_key_unique` ON `maps` (`key`);--> statement-breakpoint
CREATE INDEX `maps_display_name_idx` ON `maps` (`display_name`);--> statement-breakpoint
CREATE INDEX `maps_is_active_idx` ON `maps` (`is_active`);--> statement-breakpoint
CREATE TABLE `weapons` (
	`id` text PRIMARY KEY NOT NULL,
	`valorant_api_uuid` text,
	`key` text NOT NULL,
	`display_name` text NOT NULL,
	`category` text,
	`display_icon_path` text,
	`kill_stream_icon_path` text,
	`is_active` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weapons_valorant_api_uuid_unique` ON `weapons` (`valorant_api_uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `weapons_key_unique` ON `weapons` (`key`);--> statement-breakpoint
CREATE INDEX `weapons_display_name_idx` ON `weapons` (`display_name`);--> statement-breakpoint
CREATE INDEX `weapons_category_idx` ON `weapons` (`category`);--> statement-breakpoint
CREATE INDEX `weapons_is_active_idx` ON `weapons` (`is_active`);--> statement-breakpoint
CREATE TABLE `tournament_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entries_tournament_team_unique` ON `tournament_entries` (`tournament_id`,`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_entries_id_tournament_unique` ON `tournament_entries` (`id`,`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournament_entries_tournament_idx` ON `tournament_entries` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournament_entries_team_idx` ON `tournament_entries` (`team_id`);--> statement-breakpoint
CREATE TABLE `tournament_entry_players` (
	`entry_id` text NOT NULL,
	`player_id` text NOT NULL,
	PRIMARY KEY(`entry_id`, `player_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tournament_entry_players_player_idx` ON `tournament_entry_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `tournament_map_pool` (
	`tournament_id` text NOT NULL,
	`map_id` text NOT NULL,
	PRIMARY KEY(`tournament_id`, `map_id`),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tournament_map_pool_map_idx` ON `tournament_map_pool` (`map_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`archived_at` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_slug_unique` ON `tournaments` (`slug`);--> statement-breakpoint
CREATE INDEX `tournaments_name_idx` ON `tournaments` (`name`);--> statement-breakpoint
CREATE INDEX `tournaments_archived_at_idx` ON `tournaments` (`archived_at`);--> statement-breakpoint
CREATE TABLE `match_veto_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`action` text NOT NULL,
	`map_id` text NOT NULL,
	`acting_entry_id` text,
	`game_number` integer,
	`side_chooser_entry_id` text,
	`side_choice` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`acting_entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`side_chooser_entry_id`) REFERENCES `tournament_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "match_veto_actions_sequence_check" CHECK("match_veto_actions"."sequence" > 0),
	CONSTRAINT "match_veto_actions_game_number_check" CHECK("match_veto_actions"."game_number" is null or "match_veto_actions"."game_number" > 0),
	CONSTRAINT "match_veto_actions_action_check" CHECK("match_veto_actions"."action" in ('ban', 'pick', 'decider')),
	CONSTRAINT "match_veto_actions_side_choice_check" CHECK("match_veto_actions"."side_choice" is null or "match_veto_actions"."side_choice" in ('attack', 'defense'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_veto_actions_match_sequence_unique` ON `match_veto_actions` (`match_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_veto_actions_match_map_unique` ON `match_veto_actions` (`match_id`,`map_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_veto_actions_match_game_number_unique` ON `match_veto_actions` (`match_id`,`game_number`);--> statement-breakpoint
CREATE INDEX `match_veto_actions_map_idx` ON `match_veto_actions` (`map_id`);--> statement-breakpoint
CREATE INDEX `match_veto_actions_acting_entry_idx` ON `match_veto_actions` (`acting_entry_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team_a_entry_id` text NOT NULL,
	`team_b_entry_id` text NOT NULL,
	`label` text NOT NULL,
	`best_of` integer DEFAULT 3 NOT NULL,
	`result_type` text,
	`winner_entry_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`team_a_entry_id`,`tournament_id`) REFERENCES `tournament_entries`(`id`,`tournament_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`team_b_entry_id`,`tournament_id`) REFERENCES `tournament_entries`(`id`,`tournament_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`winner_entry_id`,`tournament_id`) REFERENCES `tournament_entries`(`id`,`tournament_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "matches_distinct_teams_check" CHECK("matches"."team_a_entry_id" <> "matches"."team_b_entry_id"),
	CONSTRAINT "matches_best_of_check" CHECK("matches"."best_of" in (1, 2, 3, 5)),
	CONSTRAINT "matches_result_type_check" CHECK("matches"."result_type" is null or "matches"."result_type" in ('normal', 'forfeit', 'walkover', 'cancelled')),
	CONSTRAINT "matches_result_state_check" CHECK((
				("matches"."result_type" is null and "matches"."winner_entry_id" is null)
				or ("matches"."result_type" = 'normal' and ("matches"."winner_entry_id" is not null or "matches"."best_of" = 2))
				or ("matches"."result_type" in ('forfeit', 'walkover') and "matches"."winner_entry_id" is not null)
				or ("matches"."result_type" = 'cancelled' and "matches"."winner_entry_id" is null)
			))
);
--> statement-breakpoint
CREATE INDEX `matches_tournament_idx` ON `matches` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `matches_team_a_entry_idx` ON `matches` (`team_a_entry_id`);--> statement-breakpoint
CREATE INDEX `matches_team_b_entry_idx` ON `matches` (`team_b_entry_id`);--> statement-breakpoint
CREATE INDEX `matches_winner_entry_idx` ON `matches` (`winner_entry_id`);