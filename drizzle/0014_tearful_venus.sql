ALTER TABLE `broadcast_state` ADD COLUMN `lineup_teams` text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE `broadcast_state` ADD COLUMN `mvp_fields` text DEFAULT '["kills","deaths","assists","performanceScore","trades","firstBloods","plants","defuses"]' NOT NULL;--> statement-breakpoint
UPDATE `broadcast_state` SET `player_stats` = CASE WHEN json_valid(`player_stats`) AND json_type(`player_stats`) = 'object' THEN json_set(`player_stats`, '$.fields', json('["kills","deaths","assists","performanceScore","trades","firstBloods","plants","defuses"]')) ELSE '{"mode":"single","scope":"game","playerId":null,"opponentPlayerId":null,"fields":["kills","deaths","assists","performanceScore","trades","firstBloods","plants","defuses"]}' END;--> statement-breakpoint
CREATE TRIGGER `broadcast_player_stats_default_fields` AFTER INSERT ON `broadcast_state`
WHEN json_valid(NEW.`player_stats`) AND json_type(NEW.`player_stats`) = 'object' AND json_type(NEW.`player_stats`, '$.fields') IS NULL
BEGIN
 UPDATE `broadcast_state` SET `player_stats` = json_set(NEW.`player_stats`, '$.fields', json('["kills","deaths","assists","performanceScore","trades","firstBloods","plants","defuses"]')) WHERE `id` = NEW.`id`;
END;
