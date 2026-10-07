import { test as base } from '@playwright/test';
import { createClient } from '@libsql/client';
import { defaultPlayerStats, defaultVisibility } from '../src/lib/broadcast/controls';

export const test = base.extend<{ broadcastIsolation: void }>({
	broadcastIsolation: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments.
		async ({}, use) => {
			const db = createClient({ url: process.env.DATABASE_URL! });
			const reset = () =>
				db.execute({
					sql: `UPDATE broadcast_state SET selected_game_id = NULL, swapped = 0,
					current_attackers_entry_id = NULL, visibility = ?, publications = '{}',
					player_stats = ?, mvp_scope = 'game', pause = '{"type":"none"}', ceremony = NULL,
					control_revision = control_revision + 1, revision = revision + 1 WHERE id = 1`,
					args: [JSON.stringify(defaultVisibility), JSON.stringify(defaultPlayerStats)]
				});
			try {
				await reset();
				await use();
			} finally {
				try {
					await reset();
				} finally {
					db.close();
				}
			}
		},
		{ auto: true }
	]
});
