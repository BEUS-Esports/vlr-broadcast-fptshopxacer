ALTER TABLE `broadcast_state` ADD `pause` text DEFAULT '{"type":"none"}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `broadcast_state` ADD `ceremony` text;
