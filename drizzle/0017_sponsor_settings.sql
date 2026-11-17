CREATE TABLE `sponsor_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`banners` text DEFAULT '{"default":{"backgroundPath":null,"logoPath":null},"round-win":{"backgroundPath":null,"logoPath":null},"thrifty":{"backgroundPath":null,"logoPath":null},"clutch":{"backgroundPath":null,"logoPath":null},"team-ace":{"backgroundPath":null,"logoPath":null},"flawless":{"backgroundPath":null,"logoPath":null},"tactical":{"backgroundPath":null,"logoPath":null},"technical":{"backgroundPath":null,"logoPath":null}}' NOT NULL,
	`loop_logos` text DEFAULT '[]' NOT NULL,
	`loop_interval_ms` integer DEFAULT 5000 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	CONSTRAINT "sponsor_settings_singleton_check" CHECK("sponsor_settings"."id" = 1),
	CONSTRAINT "sponsor_settings_revision_check" CHECK("sponsor_settings"."revision" > 0),
	CONSTRAINT "sponsor_settings_interval_check" CHECK("sponsor_settings"."loop_interval_ms" between 2000 and 60000)
);

--> statement-breakpoint
INSERT INTO `sponsor_settings` (`id`) VALUES (1);
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_sponsor_settings_insert` AFTER INSERT ON `sponsor_settings`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `broadcast_revision_sponsor_settings_update` AFTER UPDATE ON `sponsor_settings`
BEGIN
	UPDATE `broadcast_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
