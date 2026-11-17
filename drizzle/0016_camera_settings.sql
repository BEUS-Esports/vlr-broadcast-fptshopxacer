CREATE TABLE `camera_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`room` text DEFAULT '' NOT NULL,
	`password_encrypted` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	CONSTRAINT "camera_settings_singleton_check" CHECK("camera_settings"."id" = 1),
	CONSTRAINT "camera_settings_revision_check" CHECK("camera_settings"."revision" > 0)
);
