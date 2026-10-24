import { eq } from 'drizzle-orm';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { agents, maps, weapons } from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import type { ResourceSyncProgress } from './resources';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

it.each(['map', 'agent', 'weapon'] as const)(
	'restores missing %s artwork and reuses files that still exist',
	async (kind) => {
		await withManagementFixture(async ({ db, directory }) => {
			vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
			const table = kind === 'map' ? maps : kind === 'agent' ? agents : weapons;
			const uuid = '11111111-1111-4111-8111-111111111111';
			const imageUrl = 'https://media.valorant-api.com/artwork.png';
			const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
			const fetch = vi.fn(async (value: URL | string) => {
				if (String(value) === imageUrl)
					return new Response(png, { headers: { 'content-type': 'image/png' } });
				return Response.json({
					data: [
						{
							uuid,
							displayName: 'Catalogue resource',
							displayIcon: imageUrl,
							mapUrl: '/Game/Maps/Test/Test',
							splash: imageUrl,
							isPlayableCharacter: true,
							fullPortrait: imageUrl,
							role: { displayName: 'Initiator', displayIcon: imageUrl },
							abilities: [{ slot: 'Grenade', displayName: 'Ability', displayIcon: imageUrl }],
							killStreamIcon: imageUrl
						}
					]
				});
			});
			vi.stubGlobal('fetch', fetch);
			const { syncResourceKind } = await import('./resources');
			const { readAsset, removeAsset } = await import('../assets');
			await syncResourceKind(kind);
			const [original] = await db.select().from(table).where(eq(table.valorantApiUuid, uuid));
			await removeAsset(original.displayIconPath);
			fetch.mockClear();
			const progress: ResourceSyncProgress[] = [];

			await syncResourceKind(kind, (event) => {
				progress.push(event);
			});

			const [repaired] = await db.select().from(table).where(eq(table.valorantApiUuid, uuid));
			expect(fetch.mock.calls.filter(([url]) => String(url) === imageUrl)).toHaveLength(1);
			expect(repaired).toMatchObject({
				id: original.id,
				key: original.key,
				isActive: original.isActive
			});
			expect(repaired.displayIconPath).not.toBe(original.displayIconPath);
			expect((await readAsset(repaired.displayIconPath!.slice('/assets/'.length))).bytes).toEqual(
				Buffer.from(png)
			);
			if (kind === 'map') expect(repaired).toMatchObject({ splashPath: repaired.displayIconPath });
			if (kind === 'agent')
				expect(repaired).toMatchObject({
					fullPortraitPath: repaired.displayIconPath,
					roleIconPath: repaired.displayIconPath,
					abilities: [{ slot: 'grenade', displayIconPath: repaired.displayIconPath }]
				});
			if (kind === 'weapon')
				expect(repaired).toMatchObject({ killStreamIconPath: repaired.displayIconPath });
			expect(progress.filter((event) => event.phase === 'download')).toMatchObject([
				{ completed: 0, total: 1 },
				{ completed: 1, total: 1 }
			]);

			fetch.mockClear();
			progress.length = 0;
			await syncResourceKind(kind, (event) => {
				progress.push(event);
			});
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(
				(await db.select().from(table).where(eq(table.valorantApiUuid, uuid)))[0].displayIconPath
			).toBe(repaired.displayIconPath);
			expect(progress.filter((event) => event.phase === 'download')).toMatchObject([
				{ completed: 0, total: 0 }
			]);
		});
	}
);

it.each(['download', 'database save'])(
	'keeps resource metadata and removes new artwork when repair fails during %s',
	async (failure) => {
		await withManagementFixture(async ({ db, client, directory }) => {
			const assets = join(directory, 'assets');
			vi.stubEnv('ASSET_DIR', assets);
			const uuid = '11111111-1111-4111-8111-111111111111';
			const [original] = await db
				.insert(maps)
				.values({
					valorantApiUuid: uuid,
					key: 'missing-art',
					displayName: 'Original',
					displayIconPath: `/assets/${uuid}.png`,
					splashPath: '/assets/22222222-2222-4222-8222-222222222222.png'
				})
				.returning();
			if (failure === 'database save')
				await client.execute(`
				CREATE TRIGGER fail_artwork_save BEFORE UPDATE ON maps
				BEGIN SELECT RAISE(ABORT, 'test save failure'); END
			`);
			vi.stubGlobal(
				'fetch',
				vi.fn(async (value: URL | string) => {
					const url = String(value);
					if (url.includes('/v1/maps'))
						return Response.json({
							data: [
								{
									uuid,
									displayName: 'Updated',
									mapUrl: '/Game/Maps/Test/Test',
									displayIcon: 'https://media.valorant-api.com/icon.png',
									splash: 'https://media.valorant-api.com/splash.png'
								}
							]
						});
					if (failure === 'download' && url.endsWith('/splash.png'))
						return new Response('', { status: 503 });
					return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]));
				})
			);
			const { syncResourceKind } = await import('./resources');

			await expect(syncResourceKind('map')).rejects.toThrow();

			expect((await db.select().from(maps).where(eq(maps.id, original.id)))[0]).toEqual(original);
			expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
			expect(await readdir(assets)).toEqual([]);
		});
	}
);

it.each(['map', 'agent', 'weapon'] as const)(
	'preserves operator edits made during %s sync while refreshing catalogue fields',
	async (kind) => {
		await withManagementFixture(async ({ db, directory }) => {
			vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
			const table = kind === 'map' ? maps : kind === 'agent' ? agents : weapons;
			const uuid = '11111111-1111-4111-8111-111111111111';
			const imageUrl = 'https://media.valorant-api.com/test.png';
			const [original] = await db
				.insert(table)
				.values({ valorantApiUuid: uuid, key: 'original-key', displayName: 'Original name' })
				.returning();
			vi.stubGlobal(
				'fetch',
				vi.fn(async (value: URL | string) => {
					if (String(value) === imageUrl)
						return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]), {
							headers: { 'content-type': 'image/png' }
						});
					return Response.json({
						data: [
							{
								uuid,
								displayName: 'Catalogue name',
								displayIcon: imageUrl,
								mapUrl: '/Game/Maps/Test/Test',
								isPlayableCharacter: true,
								role: { displayName: 'Initiator' },
								category: 'EEquippableCategory::Rifle'
							}
						]
					});
				})
			);
			const { saveResource, syncResourceKind } = await import('./resources');
			const edit = {
				kind,
				id: original.id,
				revision: original.revision,
				key: 'operator-key',
				displayName: original.displayName,
				isActive: false
			};

			const result = await syncResourceKind(kind, async (progress) => {
				if (progress.phase !== 'save') return;
				await saveResource(edit);
				await saveResource({
					kind,
					key: original.key,
					displayName: 'Manual resource',
					isActive: true
				});
			});

			expect(result).toEqual({ kind, count: 1 });
			const [saved] = await db.select().from(table).where(eq(table.id, original.id));
			expect(saved).toMatchObject({
				id: original.id,
				key: edit.key,
				isActive: edit.isActive,
				displayName: 'Catalogue name',
				displayIconPath: expect.stringMatching(/^\/assets\/[0-9a-f-]+\.png$/),
				revision: original.revision + 2
			});
			expect(await db.select().from(table).where(eq(table.key, original.key))).toMatchObject([
				{ displayName: 'Manual resource', isActive: true, valorantApiUuid: null, revision: 1 }
			]);
			await expect(
				saveResource({ ...edit, revision: original.revision + 1 })
			).rejects.toMatchObject({
				code: 'stale'
			});
		});
	}
);
