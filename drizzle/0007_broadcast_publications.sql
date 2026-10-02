ALTER TABLE `broadcast_state` ADD `publications` text DEFAULT '{"player-lineup":null,"player-stats":null,"map-veto":null,"agent-select":null,"in-game":null,"post-game":null,"mvp":null}' NOT NULL;
--> statement-breakpoint
-- Legacy shown graphics have no capture. Hide them; operators must Show again to publish.
UPDATE `broadcast_state` SET `visibility` = '{"player-lineup":false,"player-stats":false,"map-veto":false,"agent-select":false,"in-game":false,"post-game":false,"mvp":false}', `control_revision` = `control_revision` + 1;
