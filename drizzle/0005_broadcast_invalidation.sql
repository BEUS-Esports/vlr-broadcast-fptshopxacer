-- Prepared writes and their broadcast revision commit/rollback together. No singleton means no client has observed a revision yet.
CREATE TRIGGER `broadcast_revision_teams_insert` AFTER INSERT ON `teams`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_teams_update` AFTER UPDATE ON `teams`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_teams_delete` AFTER DELETE ON `teams`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_players_insert` AFTER INSERT ON `players`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_players_update` AFTER UPDATE ON `players`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_players_delete` AFTER DELETE ON `players`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_maps_insert` AFTER INSERT ON `maps`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_maps_update` AFTER UPDATE ON `maps`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_maps_delete` AFTER DELETE ON `maps`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_agents_insert` AFTER INSERT ON `agents`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_agents_update` AFTER UPDATE ON `agents`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_agents_delete` AFTER DELETE ON `agents`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_tournaments_insert` AFTER INSERT ON `tournaments`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_tournaments_update` AFTER UPDATE ON `tournaments`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_tournaments_delete` AFTER DELETE ON `tournaments`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_matches_insert` AFTER INSERT ON `matches`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_matches_update` AFTER UPDATE ON `matches`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_matches_delete` AFTER DELETE ON `matches`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_games_insert` AFTER INSERT ON `games`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_games_update` AFTER UPDATE ON `games`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_games_delete` AFTER DELETE ON `games`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_game_lineups_insert` AFTER INSERT ON `game_lineups`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_game_lineups_update` AFTER UPDATE ON `game_lineups`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_game_lineups_delete` AFTER DELETE ON `game_lineups`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_game_player_statistics_insert` AFTER INSERT ON `game_player_statistics`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_game_player_statistics_update` AFTER UPDATE ON `game_player_statistics`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_game_player_statistics_delete` AFTER DELETE ON `game_player_statistics`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_match_veto_actions_insert` AFTER INSERT ON `match_veto_actions`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_match_veto_actions_update` AFTER UPDATE ON `match_veto_actions`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_match_veto_actions_delete` AFTER DELETE ON `match_veto_actions`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_tournament_entries_insert` AFTER INSERT ON `tournament_entries`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_tournament_entries_update` AFTER UPDATE ON `tournament_entries`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_tournament_entries_delete` AFTER DELETE ON `tournament_entries`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
