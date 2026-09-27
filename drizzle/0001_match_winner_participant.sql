PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_matches` (
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
	CONSTRAINT "matches_distinct_teams_check" CHECK("__new_matches"."team_a_entry_id" <> "__new_matches"."team_b_entry_id"),
	CONSTRAINT "matches_winner_participant_check" CHECK("__new_matches"."winner_entry_id" is null or "__new_matches"."winner_entry_id" = "__new_matches"."team_a_entry_id" or "__new_matches"."winner_entry_id" = "__new_matches"."team_b_entry_id"),
	CONSTRAINT "matches_best_of_check" CHECK("__new_matches"."best_of" in (1, 2, 3, 5)),
	CONSTRAINT "matches_result_type_check" CHECK("__new_matches"."result_type" is null or "__new_matches"."result_type" in ('normal', 'forfeit', 'walkover', 'cancelled')),
	CONSTRAINT "matches_result_state_check" CHECK((
				("__new_matches"."result_type" is null and "__new_matches"."winner_entry_id" is null)
				or ("__new_matches"."result_type" = 'normal' and ("__new_matches"."winner_entry_id" is not null or "__new_matches"."best_of" = 2))
				or ("__new_matches"."result_type" in ('forfeit', 'walkover') and "__new_matches"."winner_entry_id" is not null)
				or ("__new_matches"."result_type" = 'cancelled' and "__new_matches"."winner_entry_id" is null)
			))
);
--> statement-breakpoint
INSERT INTO `__new_matches`("id", "tournament_id", "team_a_entry_id", "team_b_entry_id", "label", "best_of", "result_type", "winner_entry_id", "revision", "created_at", "updated_at") SELECT "id", "tournament_id", "team_a_entry_id", "team_b_entry_id", "label", "best_of", "result_type", "winner_entry_id", "revision", "created_at", "updated_at" FROM `matches`;--> statement-breakpoint
DROP TABLE `matches`;--> statement-breakpoint
ALTER TABLE `__new_matches` RENAME TO `matches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `matches_tournament_idx` ON `matches` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `matches_team_a_entry_idx` ON `matches` (`team_a_entry_id`);--> statement-breakpoint
CREATE INDEX `matches_team_b_entry_idx` ON `matches` (`team_b_entry_id`);--> statement-breakpoint
CREATE INDEX `matches_winner_entry_idx` ON `matches` (`winner_entry_id`);