CREATE TABLE `asset_deletion_queue` (
	`path` text PRIMARY KEY NOT NULL,
	`unreferenced_at` integer NOT NULL
);
