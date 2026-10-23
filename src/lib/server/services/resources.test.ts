import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { agents, maps, weapons } from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

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
