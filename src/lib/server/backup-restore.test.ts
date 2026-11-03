import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import * as schema from './db/schema';
import { withManagementFixture } from './testing/management-fixture';
import { createBackup } from '../../../scripts/backup.mjs';

it('restores saved data, held Program, served artwork and encrypted settings with a separate key', async () => {
	await withManagementFixture(async ({ directory, url, client, db }) => {
		const assetName = '11111111-1111-4111-8111-111111111111.png';
		const assetPath = `/assets/${assetName}`;
		const assetRoot = join(directory, 'artwork');
		const key = join(directory, 'separate.key');
		await mkdir(assetRoot);
		const artwork = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
		await writeFile(join(assetRoot, assetName), artwork);
		await writeFile(key, Buffer.alloc(32, 9).toString('base64'));
		vi.stubEnv('ASSET_DIR', assetRoot);
		vi.stubEnv('SETTINGS_ENCRYPTION_KEY', '');
		vi.stubEnv('SETTINGS_ENCRYPTION_KEY_FILE', key);
		vi.stubEnv('LIVE_PROVIDER_CONFIG_FILE', join(directory, 'absent-legacy.json'));
		let restoredClient;
		try {
			await db
				.update(schema.teams)
				.set({ logoPath: assetPath })
				.where(eq(schema.teams.id, 'team-a'));
			await db
				.insert(schema.games)
				.values({ id: 'g', matchId: 'match', number: 1, name: 'Shown game' });
			const { updateBroadcastState } = await import('./services/broadcast');
			await updateBroadcastState({
				expectedRevision: 1,
				selectedGameId: 'g',
				visibility: { 'player-lineup': true }
			});
			const { buildBroadcastSnapshot } = await import('./broadcast/snapshot');
			const shown = (await buildBroadcastSnapshot()).publications['player-lineup'];
			await db
				.update(schema.games)
				.set({ name: 'Latest saved game' })
				.where(eq(schema.games.id, 'g'));
			const { loadProviderSettings, saveProviderSettings } = await import('./settings/providers');
			const settings = await loadProviderSettings();
			await saveProviderSettings(
				{ henrikdevApiKey: 'synthetic-restored-secret' },
				settings.revision
			);
			client.close();
			const output = join(directory, 'restored');
			const manifest = await createBackup({
				output,
				appStopped: true,
				cwd: process.cwd(),
				env: {
					DATABASE_URL: url,
					ASSET_DIR: assetRoot,
					SETTINGS_ENCRYPTION_KEY_FILE: key
				}
			});
			expect(manifest.complete).toBe(true);
			await copyFile(key, join(directory, 'restored-separate.key'));
			vi.stubEnv('ASSET_DIR', join(output, 'assets'));
			vi.stubEnv('SETTINGS_ENCRYPTION_KEY_FILE', join(directory, 'restored-separate.key'));
			restoredClient = createClient({ url: `file:${join(output, 'database.db')}` });
			const restoredDb = drizzle(restoredClient, { schema });
			vi.resetModules();
			vi.doMock('#lib/server/db/index.ts', () => ({ db: restoredDb }));
			const restored = await (await import('./broadcast/snapshot')).buildBroadcastSnapshot();
			expect(restored.game?.name).toBe('Latest saved game');
			expect(restored.publications['player-lineup']).toEqual(shown);
			expect(restored.publications['player-lineup']?.game?.name).toBe('Shown game');
			expect(
				(await (await import('./settings/providers')).loadProviderSettings()).henrikdevApiKey
			).toBe('synthetic-restored-secret');
			const { GET } = await import('../../routes/assets/[name]/+server');
			const response = await GET({ params: { name: assetName } } as Parameters<typeof GET>[0]);
			expect(response.status).toBe(200);
			expect(Buffer.from(await response.arrayBuffer())).toEqual(artwork);
			expect(await readFile(join(output, 'manifest.json'), 'utf8')).not.toContain(
				'synthetic-restored-secret'
			);
		} finally {
			restoredClient?.close();
			vi.unstubAllEnvs();
		}
	});
});
