CREATE UNIQUE INDEX `players_display_name_unique_ci` ON `players` (lower("display_name"));--> statement-breakpoint
CREATE UNIQUE INDEX `players_riot_id_unique_ci` ON `players` (lower("riot_id"));--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_unique_ci` ON `teams` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `teams_tag_unique_ci` ON `teams` (lower("tag"));