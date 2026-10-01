-- Keep the existing revision column as prepared-data invalidation and give operator controls
-- an independent optimistic-lock revision. This preserves upgradeability for Phase 5 databases
-- that already applied 0004/0005.
ALTER TABLE `broadcast_state` ADD `control_revision` integer DEFAULT 1 NOT NULL;
