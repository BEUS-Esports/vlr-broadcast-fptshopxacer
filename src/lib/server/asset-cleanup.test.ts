import { afterEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as s from '#lib/server/db/schema/index.ts';
import {
	withManagementFixture,
	withTwoConnections
} from '#lib/server/testing/management-fixture.ts';

const day = 24 * 60 * 60 * 1000;
const start = new Date('2026-10-24T00:00:00Z').getTime();
const image = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'image.png');

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it('persists the first unreferenced time across restarts and waits a full 14 days', async () => {
	await withManagementFixture(async ({ db, directory }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		const { saveUpload, assetExists } = await import('./assets');
		const path = (await saveUpload(image()))!;
		const { collectUnusedAssets } = await import('./asset-cleanup');
		await collectUnusedAssets(start);
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([{ path, unreferencedAt: start }]);
		vi.resetModules();
		const restarted = await import('./asset-cleanup');
		await restarted.collectUnusedAssets(start + 14 * day - 1);
		expect(await assetExists(path)).toBe(true);
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([{ path, unreferencedAt: start }]);
		await restarted.collectUnusedAssets(start + 14 * day);
		expect(await assetExists(path)).toBe(false);
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([]);
	});
});

it('cancels deletion for reused assets and restarts the grace period when released again', async () => {
	await withManagementFixture(async ({ db, directory }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		const { saveUpload, assetExists } = await import('./assets');
		const path = (await saveUpload(image()))!;
		const { collectUnusedAssets } = await import('./asset-cleanup');
		await collectUnusedAssets(start);
		await db.update(s.teams).set({ logoPath: path }).where(eq(s.teams.id, 'team-a'));
		await collectUnusedAssets(start + 15 * day);
		expect(await assetExists(path)).toBe(true);
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([]);
		await db.update(s.teams).set({ logoPath: null }).where(eq(s.teams.id, 'team-a'));
		await collectUnusedAssets(start + 16 * day);
		await collectUnusedAssets(start + 29 * day);
		expect(await assetExists(path)).toBe(true);
		await collectUnusedAssets(start + 30 * day);
		expect(await assetExists(path)).toBe(false);
	});
});

it('protects archived profiles, inactive catalogue artwork, ability icons and held captures', async () => {
	await withManagementFixture(async ({ db, directory }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		const { saveUpload, assetExists } = await import('./assets');
		const paths = await Promise.all(Array.from({ length: 15 }, () => saveUpload(image())));
		await db
			.update(s.teams)
			.set({
				logoPath: paths[0],
				logoWhitePath: paths[1],
				logoBlackPath: paths[2],
				archivedAt: new Date()
			})
			.where(eq(s.teams.id, 'team-a'));
		await db
			.update(s.players)
			.set({ portraitPath: paths[3], archivedAt: new Date() })
			.where(eq(s.players.id, 'a1'));
		await db
			.update(s.maps)
			.set({
				displayIconPath: paths[4],
				listViewIconPath: paths[5],
				splashPath: paths[6],
				stylizedBackgroundPath: paths[7],
				isActive: false
			})
			.where(eq(s.maps.id, 'map-1'));
		await db.insert(s.agents).values({
			id: 'agent',
			key: 'agent',
			displayName: 'Agent',
			isActive: false,
			displayIconPath: paths[8],
			fullPortraitPath: paths[9],
			bustPortraitPath: paths[10],
			roleIconPath: paths[11],
			abilities: [{ slot: 'ability1', displayName: 'Ability', displayIconPath: paths[12] }]
		});
		await db.insert(s.weapons).values({
			id: 'weapon',
			key: 'weapon',
			displayName: 'Weapon',
			isActive: false,
			displayIconPath: paths[13],
			killStreamIconPath: paths[14]
		});
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Game' });
		await db
			.insert(s.gameLineups)
			.values({ gameId: 'g', entryId: 'entry-a', slot: 1, playerId: 'a1' });
		const { updateBroadcastState } = await import('./services/broadcast');
		await updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { 'player-lineup': true }
		});
		await db
			.update(s.teams)
			.set({ logoPath: null, logoWhitePath: null, logoBlackPath: null })
			.where(eq(s.teams.id, 'team-a'));
		await db.update(s.players).set({ portraitPath: null }).where(eq(s.players.id, 'a1'));
		const { collectUnusedAssets } = await import('./asset-cleanup');
		await collectUnusedAssets(start - day);
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([]);
		await updateBroadcastState({ expectedRevision: 2, visibility: { 'player-lineup': false } });
		await db
			.update(s.teams)
			.set({ logoPath: paths[0], logoWhitePath: paths[1], logoBlackPath: paths[2] })
			.where(eq(s.teams.id, 'team-a'));
		await db.update(s.players).set({ portraitPath: paths[3] }).where(eq(s.players.id, 'a1'));
		await collectUnusedAssets(start);
		await collectUnusedAssets(start + 30 * day);
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([]);
		for (const path of paths) expect(await assetExists(path)).toBe(true);
	});
});

it('ignores unmanaged files and directories and tolerates an empty or missing asset directory', async () => {
	await withManagementFixture(async ({ db, directory }) => {
		const assetDir = join(directory, 'assets');
		vi.stubEnv('ASSET_DIR', assetDir);
		const { collectUnusedAssets } = await import('./asset-cleanup');
		await collectUnusedAssets(start);
		await mkdir(join(assetDir, `${crypto.randomUUID()}.png`), { recursive: true });
		const note = join(assetDir, 'keep.txt');
		await writeFile(note, 'keep');
		await collectUnusedAssets(start);
		await collectUnusedAssets(start + 30 * day);
		expect(await readFile(note, 'utf8')).toBe('keep');
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([]);
	});
});

it('keeps failed deletions queued for retry and removes stale marks for missing files', async () => {
	await withManagementFixture(async ({ db, directory }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		const assets = await import('./assets');
		const path = (await assets.saveUpload(image()))!;
		const missing = (await assets.saveUpload(image()))!;
		const deletable = (await assets.saveUpload(image()))!;
		const { collectUnusedAssets } = await import('./asset-cleanup');
		await collectUnusedAssets(start);
		await assets.removeAsset(missing);
		const originalRemove = assets.removeAsset;
		const remove = vi.spyOn(assets, 'removeAsset').mockImplementation(async (candidate) => {
			if (candidate === path) throw new Error('locked');
			await originalRemove(candidate);
		});
		await expect(collectUnusedAssets(start + 14 * day)).rejects.toThrow('will retry');
		expect(await assets.assetExists(path)).toBe(true);
		expect(await assets.assetExists(deletable)).toBe(false);
		expect(
			await db.select().from(s.assetDeletionQueue).where(eq(s.assetDeletionQueue.path, path))
		).toHaveLength(1);
		remove.mockRestore();
		await collectUnusedAssets(start + 14 * day);
		expect(await assets.assetExists(path)).toBe(false);
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([]);
	});
});

it('holds a database write lock until an expired asset is removed', async () => {
	await withTwoConnections(async ({ directory, secondClient }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		await secondClient.execute('PRAGMA busy_timeout = 0');
		const assets = await import('./assets');
		const path = (await assets.saveUpload(image()))!;
		const { collectUnusedAssets } = await import('./asset-cleanup');
		await collectUnusedAssets(start);
		const originalRemove = assets.removeAsset;
		vi.spyOn(assets, 'removeAsset').mockImplementationOnce(async (candidate) => {
			await expect(
				secondClient.execute({
					sql: "UPDATE teams SET logo_path = ? WHERE id = 'team-a'",
					args: [path]
				})
			).rejects.toThrow(/SQLITE_BUSY|locked/);
			await originalRemove(candidate);
		});
		await collectUnusedAssets(start + 14 * day);
		expect(await assets.assetExists(path)).toBe(false);
	});
});

it('does not delete anything when stored references cannot be read', async () => {
	await withManagementFixture(async ({ db, client, directory }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		const assets = await import('./assets');
		const path = (await assets.saveUpload(image()))!;
		const { collectUnusedAssets } = await import('./asset-cleanup');
		await collectUnusedAssets(start);
		await db.insert(s.broadcastState).values({ id: 1 }).onConflictDoNothing();
		await client.execute("UPDATE broadcast_state SET publications = 'invalid json'");
		await expect(collectUnusedAssets(start + 14 * day)).rejects.toThrow();
		expect(await assets.assetExists(path)).toBe(true);
		expect(await db.select().from(s.assetDeletionQueue)).toEqual([{ path, unreferencedAt: start }]);
	});
});

it('retries hourly after errors, never overlaps sweeps, and stops scheduling on disposal', async () => {
	await withManagementFixture(async ({ db, directory }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		const assets = await import('./assets');
		const path = (await assets.saveUpload(image()))!;
		const pending = Promise.withResolvers<string[]>();
		const list = vi.spyOn(assets, 'listAssetPaths').mockReturnValueOnce(pending.promise);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { startAssetCleanup } = await import('./asset-cleanup');
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		vi.setSystemTime(start);
		const stop = startAssetCleanup();
		try {
			await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
			expect(list).toHaveBeenCalledTimes(1);
			pending.reject(new Error('asset directory unavailable'));
			await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
			await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
			await vi.waitFor(async () => {
				expect(await db.select().from(s.assetDeletionQueue)).toMatchObject([{ path }]);
			});
			expect(list).toHaveBeenCalledTimes(2);
			stop();
			await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
			expect(list).toHaveBeenCalledTimes(2);
		} finally {
			stop();
		}
	});
});

it.each([true, false])(
	'starts automatic cleanup only outside builds (building=%s)',
	async (building) => {
		await withManagementFixture(async () => {
			vi.doMock('$app/env', () => ({ building }));
			try {
				const cleanup = await import('./asset-cleanup');
				const start = vi.spyOn(cleanup, 'startAssetCleanup').mockReturnValue(() => {});
				const { init } = await import('../../hooks.server');
				await init();
				expect(start).toHaveBeenCalledTimes(building ? 0 : 1);
			} finally {
				vi.doUnmock('$app/env');
			}
		});
	}
);
