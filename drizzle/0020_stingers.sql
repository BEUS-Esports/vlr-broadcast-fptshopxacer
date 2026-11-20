CREATE TABLE `stinger_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`active_stinger_id` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`active_stinger_id`) REFERENCES `stingers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "stinger_settings_singleton_check" CHECK("stinger_settings"."id" = 1),
	CONSTRAINT "stinger_settings_revision_check" CHECK("stinger_settings"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE `stingers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`kind` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`cut_point_ms` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	CONSTRAINT "stingers_revision_check" CHECK("stingers"."revision" > 0),
	CONSTRAINT "stingers_duration_check" CHECK("stingers"."duration_ms" between 1 and 60000),
	CONSTRAINT "stingers_cut_point_check" CHECK("stingers"."cut_point_ms" between 0 and "stingers"."duration_ms")
);
--> statement-breakpoint
INSERT INTO `stinger_settings` (`id`) VALUES (1);
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_stingers_insert` AFTER INSERT ON `stingers`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_stingers_update` AFTER UPDATE ON `stingers`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_stingers_delete` AFTER DELETE ON `stingers`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_stinger_settings_update` AFTER UPDATE ON `stinger_settings`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
