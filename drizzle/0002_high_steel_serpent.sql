PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_games` (
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
	CONSTRAINT "games_number_check" CHECK("__new_games"."number" > 0),
	CONSTRAINT "games_score_a_check" CHECK("__new_games"."score_a" is null or "__new_games"."score_a" >= 0),
	CONSTRAINT "games_score_b_check" CHECK("__new_games"."score_b" is null or "__new_games"."score_b" >= 0),
	CONSTRAINT "games_scores_pair_check" CHECK(("__new_games"."score_a" is null and "__new_games"."score_b" is null) or ("__new_games"."score_a" is not null and "__new_games"."score_b" is not null)),
	CONSTRAINT "games_starting_sides_check" CHECK(("__new_games"."starting_attackers_entry_id" is null and "__new_games"."starting_defenders_entry_id" is null) or ("__new_games"."starting_attackers_entry_id" is not null and "__new_games"."starting_defenders_entry_id" is not null and "__new_games"."starting_attackers_entry_id" <> "__new_games"."starting_defenders_entry_id")),
	CONSTRAINT "games_result_type_check" CHECK("__new_games"."result_type" is null or "__new_games"."result_type" in ('normal', 'forfeit', 'walkover', 'cancelled')),
	CONSTRAINT "games_result_state_check" CHECK((
				("__new_games"."result_type" is null and "__new_games"."winner_entry_id" is null)
				or (
					"__new_games"."result_type" = 'normal'
					and "__new_games"."winner_entry_id" is not null
					and "__new_games"."score_a" is not null
					and "__new_games"."score_b" is not null
					and "__new_games"."score_a" <> "__new_games"."score_b"
				)
				or (
					"__new_games"."result_type" in ('forfeit', 'walkover')
					and "__new_games"."winner_entry_id" is not null
					and "__new_games"."score_a" is null
					and "__new_games"."score_b" is null
				)
				or (
					"__new_games"."result_type" = 'cancelled'
					and "__new_games"."winner_entry_id" is null
					and "__new_games"."score_a" is null
					and "__new_games"."score_b" is null
				)
			))
);
--> statement-breakpoint
INSERT INTO `__new_games`("id", "match_id", "number", "name", "map_id", "starting_attackers_entry_id", "starting_defenders_entry_id", "score_a", "score_b", "result_type", "winner_entry_id", "revision", "created_at", "updated_at") SELECT "id", "match_id", "number", "name", "map_id", "starting_attackers_entry_id", "starting_defenders_entry_id", "score_a", "score_b", "result_type", "winner_entry_id", "revision", "created_at", "updated_at" FROM `games`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `games_match_number_unique` ON `games` (`match_id`,`number`);--> statement-breakpoint
CREATE INDEX `games_map_idx` ON `games` (`map_id`);--> statement-breakpoint
CREATE INDEX `games_winner_entry_idx` ON `games` (`winner_entry_id`);--> statement-breakpoint
CREATE TABLE `__new_match_veto_actions` (
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
	CONSTRAINT "match_veto_actions_sequence_check" CHECK("__new_match_veto_actions"."sequence" > 0),
	CONSTRAINT "match_veto_actions_game_number_check" CHECK("__new_match_veto_actions"."game_number" is null or "__new_match_veto_actions"."game_number" > 0),
	CONSTRAINT "match_veto_actions_action_check" CHECK("__new_match_veto_actions"."action" in ('ban', 'pick', 'decider')),
	CONSTRAINT "match_veto_actions_side_choice_check" CHECK("__new_match_veto_actions"."side_choice" is null or "__new_match_veto_actions"."side_choice" in ('attack', 'defense')),
	CONSTRAINT "match_veto_actions_side_assignment_check" CHECK(("__new_match_veto_actions"."side_chooser_entry_id" is null and "__new_match_veto_actions"."side_choice" is null) or ("__new_match_veto_actions"."side_chooser_entry_id" is not null and "__new_match_veto_actions"."side_choice" is not null and "__new_match_veto_actions"."game_number" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_match_veto_actions`("id", "match_id", "sequence", "action", "map_id", "acting_entry_id", "game_number", "side_chooser_entry_id", "side_choice", "created_at", "updated_at") SELECT "id", "match_id", "sequence", "action", "map_id", "acting_entry_id", "game_number", "side_chooser_entry_id", "side_choice", "created_at", "updated_at" FROM `match_veto_actions`;--> statement-breakpoint
DROP TABLE `match_veto_actions`;--> statement-breakpoint
ALTER TABLE `__new_match_veto_actions` RENAME TO `match_veto_actions`;--> statement-breakpoint
CREATE UNIQUE INDEX `match_veto_actions_match_sequence_unique` ON `match_veto_actions` (`match_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_veto_actions_match_map_unique` ON `match_veto_actions` (`match_id`,`map_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_veto_actions_match_game_number_unique` ON `match_veto_actions` (`match_id`,`game_number`);--> statement-breakpoint
CREATE INDEX `match_veto_actions_map_idx` ON `match_veto_actions` (`map_id`);--> statement-breakpoint
CREATE INDEX `match_veto_actions_acting_entry_idx` ON `match_veto_actions` (`acting_entry_id`);