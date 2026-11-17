ALTER TABLE `broadcast_state` ADD `booths_swapped` integer DEFAULT false NOT NULL CONSTRAINT `broadcast_booths_swapped_check` CHECK (`booths_swapped` in (0, 1));
