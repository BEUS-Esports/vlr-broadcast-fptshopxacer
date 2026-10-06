ALTER TABLE `game_player_statistics` ADD `agent_manually_edited_at` integer;--> statement-breakpoint
ALTER TABLE `game_player_statistics` ADD `statistics_manual_override` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `game_player_statistics` ADD `agent_manual_override` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `game_statistics_meta_source_match_unique` ON `game_statistics_meta` (`import_source`,`external_match_id`);
--> statement-breakpoint
UPDATE game_player_statistics
SET statistics_manual_override = 1
WHERE manually_edited_at > (SELECT imported_at FROM game_statistics_meta WHERE game_id = game_player_statistics.game_id);
--> statement-breakpoint
-- Legacy agent edits were not tracked. Protect every imported lineup player's saved agent,
-- including manual clears and players without a statistics row, until explicitly resolved.
INSERT OR IGNORE INTO game_player_statistics (game_id, player_id, entry_id, agent_manual_override)
SELECT lineup.game_id, lineup.player_id, lineup.entry_id, 1
FROM game_lineups AS lineup
JOIN game_statistics_meta AS meta ON meta.game_id = lineup.game_id
WHERE meta.imported_at IS NOT NULL AND lineup.player_id IS NOT NULL;
--> statement-breakpoint
UPDATE game_player_statistics SET agent_manual_override = 1
WHERE EXISTS (SELECT 1 FROM game_statistics_meta AS meta WHERE meta.game_id = game_player_statistics.game_id AND meta.imported_at IS NOT NULL);
