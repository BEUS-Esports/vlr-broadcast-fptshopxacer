import { expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as s from '#lib/server/db/schema/index.ts';
import { decodeBroadcastSnapshot } from '#lib/broadcast/types.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import { isBroadcastMutation } from '#lib/server/broadcast/mutations.ts';

const path = (n: number, extension = 'webm') =>
	`/assets/00000000-0000-4000-8000-${String(n).padStart(12, '0')}.${extension}`;
type StingerInput = Parameters<typeof import('./stingers').createStinger>[0];
const input = (patch: Partial<StingerInput> = {}): StingerInput => ({
	name: 'Main',
	path: path(1),
	kind: 'video',
	durationMs: 1000,
	cutPointMs: 500,
	...patch
});

it('creates a stinger and lists it', async () => {
	await withManagementFixture(async () => {
		const { createStinger, listStingers } = await import('./stingers');
		const created = await createStinger(input({ name: '  Main  ' }));
		expect(created).toMatchObject({
			name: 'Main',
			path: path(1),
			kind: 'video',
			durationMs: 1000,
			cutPointMs: 500,
			revision: 1
		});
		expect(await listStingers()).toEqual([created]);
	});
});

it.each([
	['zero duration', { durationMs: 0, cutPointMs: 0 }],
	['duration over a minute', { durationMs: 60001 }],
	['fractional duration', { durationMs: 1000.5 }],
	['cut point after the end', { cutPointMs: 1001 }],
	['negative cut point', { cutPointMs: -1 }],
	['empty name', { name: '   ' }],
	['name over 80 characters', { name: 'x'.repeat(81) }],
	['unmanaged path', { path: '/assets/../evil.webm' }],
	['video kind on an image path', { path: path(1, 'webp') }],
	['unknown kind', { kind: 'mov' as never }]
])('rejects an invalid stinger: %s', async (_name, patch) => {
	await withManagementFixture(async () => {
		const { createStinger, listStingers } = await import('./stingers');
		await expect(createStinger(input(patch))).rejects.toMatchObject({
			name: 'SaveError',
			code: 'invalid'
		});
		expect(await listStingers()).toEqual([]);
	});
});

it('accepts the boundary values', async () => {
	await withManagementFixture(async () => {
		const { createStinger, listStingers } = await import('./stingers');
		await createStinger(input({ path: path(1), durationMs: 1, cutPointMs: 0 }));
		await createStinger(input({ path: path(2), durationMs: 60000, cutPointMs: 60000 }));
		await createStinger(input({ path: path(3, 'webp'), kind: 'image', name: 'x'.repeat(80) }));
		expect(await listStingers()).toHaveLength(3);
	});
});

it('updates a stinger and bumps its revision', async () => {
	await withManagementFixture(async () => {
		const { createStinger, updateStinger } = await import('./stingers');
		const { id } = await createStinger(input());
		const updated = await updateStinger(
			id,
			{ name: 'Renamed', durationMs: 2000, cutPointMs: 1000 },
			1
		);
		expect(updated).toMatchObject({
			id,
			name: 'Renamed',
			durationMs: 2000,
			cutPointMs: 1000,
			revision: 2
		});
	});
});

it('rejects a stale update and an update of a missing stinger', async () => {
	await withManagementFixture(async () => {
		const { createStinger, updateStinger, listStingers } = await import('./stingers');
		const { id } = await createStinger(input());
		const next = { name: 'Other', durationMs: 1000, cutPointMs: 100 };
		await updateStinger(id, next, 1);
		await expect(updateStinger(id, { ...next, name: 'Late' }, 1)).rejects.toMatchObject({
			code: 'stale'
		});
		await expect(updateStinger('missing', next, 1)).rejects.toMatchObject({ code: 'not-found' });
		await expect(updateStinger(id, { ...next, cutPointMs: 5000 }, 2)).rejects.toMatchObject({
			code: 'invalid'
		});
		expect((await listStingers())[0]).toMatchObject({ name: 'Other', revision: 2 });
	});
});

it('loads default settings and selects the active stinger into the snapshot', async () => {
	await withManagementFixture(async () => {
		const { createStinger, loadStingerSettings, setActiveStinger } = await import('./stingers');
		const { buildBroadcastSnapshot } = await import('#lib/server/broadcast/snapshot.ts');
		expect(await loadStingerSettings()).toEqual({ activeStingerId: null, revision: 1 });
		expect((await buildBroadcastSnapshot()).stinger).toBeNull();
		const { id } = await createStinger(input());
		expect(await setActiveStinger(id, 1)).toEqual({ activeStingerId: id, revision: 2 });
		expect((await buildBroadcastSnapshot()).stinger).toEqual({
			path: path(1),
			kind: 'video',
			durationMs: 1000,
			cutPointMs: 500
		});
		expect(await setActiveStinger(null, 2)).toEqual({ activeStingerId: null, revision: 3 });
		expect((await buildBroadcastSnapshot()).stinger).toBeNull();
	});
});

it('rejects activating a missing stinger or with a stale revision', async () => {
	await withManagementFixture(async () => {
		const { createStinger, setActiveStinger, loadStingerSettings } = await import('./stingers');
		const { id } = await createStinger(input());
		await expect(setActiveStinger('missing', 1)).rejects.toMatchObject({ code: 'not-found' });
		await expect(setActiveStinger(id, 0)).rejects.toMatchObject({ code: 'invalid' });
		await setActiveStinger(id, 1);
		await expect(setActiveStinger(null, 1)).rejects.toMatchObject({ code: 'stale' });
		expect(await loadStingerSettings()).toEqual({ activeStingerId: id, revision: 2 });
	});
});

it('clears the active stinger when it is deleted', async () => {
	await withManagementFixture(async () => {
		const { createStinger, deleteStinger, setActiveStinger, loadStingerSettings, listStingers } =
			await import('./stingers');
		const { buildBroadcastSnapshot } = await import('#lib/server/broadcast/snapshot.ts');
		const { id } = await createStinger(input());
		await setActiveStinger(id, 1);
		await deleteStinger(id);
		expect((await buildBroadcastSnapshot()).stinger).toBeNull();
		expect((await loadStingerSettings()).activeStingerId).toBeNull();
		expect(await listStingers()).toEqual([]);
		await expect(deleteStinger(id)).resolves.toBeUndefined();
	});
});

it('keeps another stinger active when an inactive one is deleted', async () => {
	await withManagementFixture(async () => {
		const { createStinger, deleteStinger, setActiveStinger, loadStingerSettings } =
			await import('./stingers');
		const active = await createStinger(input());
		const other = await createStinger(input({ path: path(2), name: 'Other' }));
		await setActiveStinger(active.id, 1);
		await deleteStinger(other.id);
		expect((await loadStingerSettings()).activeStingerId).toBe(active.id);
	});
});

it('bumps broadcast dataRevision on every stinger change', async () => {
	await withManagementFixture(async () => {
		const { getBroadcastState } = await import('#lib/server/services/broadcast.ts');
		const { createStinger, updateStinger, setActiveStinger, deleteStinger } =
			await import('./stingers');
		let previous = (await getBroadcastState()).dataRevision;
		const bumped = async () => {
			const next = (await getBroadcastState()).dataRevision;
			expect(next).toBeGreaterThan(previous);
			previous = next;
		};
		const { id } = await createStinger(input());
		await bumped();
		await updateStinger(id, { name: 'B', durationMs: 1000, cutPointMs: 0 }, 1);
		await bumped();
		await setActiveStinger(id, 1);
		await bumped();
		await setActiveStinger(null, 2);
		await bumped();
		await deleteStinger(id);
		await bumped();
	});
});

it('does not queue an asset referenced by a stinger for deletion', async () => {
	await withManagementFixture(async ({ db, directory }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		try {
			const { saveStingerStream } = await import('../assets');
			const webp = await readFile(
				fileURLToPath(new URL('../../broadcast/fixtures/stinger.webp', import.meta.url))
			);
			const { path: saved, kind } = await saveStingerStream(new Blob([webp]).stream());
			const unreferenced = await saveStingerStream(new Blob([webp]).stream());
			const { createStinger } = await import('./stingers');
			await createStinger(input({ path: saved, kind }));
			const { collectUnusedAssets } = await import('../asset-cleanup');
			await collectUnusedAssets(1);
			expect((await db.select().from(s.assetDeletionQueue)).map((row) => row.path)).toEqual([
				unreferenced.path
			]);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

it('decodes snapshots with a null or valid stinger and rejects malformed ones', async () => {
	await withManagementFixture(async () => {
		const { createStinger, setActiveStinger } = await import('./stingers');
		const { buildBroadcastSnapshot } = await import('#lib/server/broadcast/snapshot.ts');
		const empty = await buildBroadcastSnapshot();
		expect(decodeBroadcastSnapshot(JSON.stringify(empty))?.stinger).toBeNull();
		const { id } = await createStinger(input());
		await setActiveStinger(id, 1);
		const active = await buildBroadcastSnapshot();
		expect(decodeBroadcastSnapshot(JSON.stringify(active))).toEqual(active);
		const decode = (stinger: unknown) =>
			decodeBroadcastSnapshot(JSON.stringify({ ...active, stinger }));
		const valid = active.stinger!;
		expect(decode({ ...valid, kind: 'mov' })).toBeNull();
		expect(decode({ ...valid, durationMs: 1.5 })).toBeNull();
		expect(decode({ ...valid, cutPointMs: '500' })).toBeNull();
		expect(decode({ ...valid, extra: 1 })).toBeNull();
		expect(decode({ path: valid.path })).toBeNull();
		expect(decodeBroadcastSnapshot(JSON.stringify({ ...active, stinger: undefined }))).toBeNull();
	});
});

it('treats stinger admin posts as broadcast mutations', () => {
	const post = new Request('http://localhost/admin/stingers', { method: 'POST' });
	expect(isBroadcastMutation(post, '/admin/stingers')).toBe(true);
	expect(isBroadcastMutation(post, '/admin/stingers/upload')).toBe(true);
	expect(isBroadcastMutation(post, '/admin/stingers-extra')).toBe(false);
});
