import { afterEach, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';
import type { ImportPreview } from '#lib/import/types.ts';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const bundleBytes = () =>
	zipSync({
		'teams.csv': strToU8('team_name,team_tag\nBundle Team,BT\n'),
		'players.csv': strToU8('display_name,full_name,riot_id\nBundle Player,,Bundle#VN2\n'),
		'team_logos/normal/BT.png': png,
		'player_images/Bundle#VN2.png': png
	});
const post = (name: string, file: Uint8Array | null, hash?: string) => {
	const form = new FormData();
	if (file) form.set('bundle', new File([file as BlobPart], 'bundle.zip'));
	if (hash !== undefined) form.set('hash', hash);
	return {
		request: new Request(`http://localhost/admin/teams?/${name}`, { method: 'POST', body: form })
	};
};

afterEach(() => vi.unstubAllEnvs());

type Fixture = Parameters<Parameters<typeof withManagementFixture>[0]>[0];
type Context = Pick<Fixture, 'db'> & {
	assetDir: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	preview: (file: Uint8Array | null) => Promise<any>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	commit: (file: Uint8Array | null, hash: string) => Promise<any>;
};

async function setup(run: (context: Context) => Promise<void>) {
	await withManagementFixture(async ({ db, directory }) => {
		const assetDir = join(directory, 'assets');
		vi.stubEnv('ASSET_DIR', assetDir);
		const { bundleImportActions } = await import('./actions');
		type Call = Parameters<typeof bundleImportActions.importPreview>[0];
		await run({
			db,
			assetDir,
			preview: async (file) =>
				bundleImportActions.importPreview(post('importPreview', file) as Call),
			commit: async (file, hash) =>
				bundleImportActions.importCommit(post('importCommit', file, hash) as Call)
		});
	});
}
const files = (dir: string) => readdir(dir).catch(() => [] as string[]);
const counts = async (db: Fixture['db']) =>
	(
		await Promise.all(
			[s.teams, s.players, s.tournamentEntries, s.tournamentEntryPlayers].map(
				async (table) => (await db.select().from(table)).length
			)
		)
	).join(',');

it('previews without writing, then commits, then sees the rows as clashes', async () => {
	await setup(async ({ db, assetDir, preview, commit }) => {
		const before = await counts(db);
		const { importPreview } = (await preview(bundleBytes())) as { importPreview: ImportPreview };
		expect(importPreview.problems).toEqual([]);
		expect(importPreview.hash).toMatch(/^[0-9a-f]{64}$/);
		expect(await counts(db)).toBe(before);
		expect(await files(assetDir)).toEqual([]);

		expect(await commit(bundleBytes(), importPreview.hash)).toEqual({
			imported: { teams: 1, players: 1 }
		});
		const { assetExists } = await import('../assets');
		const [team] = await db
			.select()
			.from(s.teams)
			.where((await import('drizzle-orm')).eq(s.teams.tag, 'BT'));
		const [player] = await db
			.select()
			.from(s.players)
			.where((await import('drizzle-orm')).eq(s.players.displayName, 'Bundle Player'));
		expect(await assetExists(team.logoPath)).toBe(true);
		expect(await assetExists(player.portraitPath)).toBe(true);
		expect((await files(assetDir)).length).toBe(2);
		expect((await counts(db)).split(',').slice(2).join(',')).toBe(
			before.split(',').slice(2).join(',')
		);

		const again = await preview(bundleBytes());
		expect(again.importPreview.problems.map((p: { message: string }) => p.message)).toContain(
			'Team name "Bundle Team" is already used by team "Bundle Team".'
		);
	});
});

it('refuses a commit whose hash does not match and returns the new preview', async () => {
	await setup(async ({ db, assetDir, commit }) => {
		const before = await counts(db);
		const result = await commit(bundleBytes(), 'x'.repeat(64));
		expect(result).toMatchObject({
			status: 400,
			data: {
				importError: 'The file changed since the preview. Review the new preview before importing.',
				importPreview: { hash: expect.stringMatching(/^[0-9a-f]{64}$/) }
			}
		});
		expect(await counts(db)).toBe(before);
		expect(await files(assetDir)).toEqual([]);
	});
});

it('refuses a commit when a clash appears after the preview', async () => {
	await setup(async ({ db, assetDir, preview, commit }) => {
		const { importPreview } = await preview(bundleBytes());
		await db.insert(s.teams).values({ name: 'Other', tag: 'BT' });
		const before = await counts(db);
		const result = await commit(bundleBytes(), importPreview.hash);
		expect(result).toMatchObject({
			status: 400,
			data: { importError: 'Nothing was imported. Fix the errors below and preview again.' }
		});
		expect(result.data.importPreview.problems.map((p: { message: string }) => p.message)).toContain(
			'Team tag "BT" is already used by team "Other".'
		);
		expect(await counts(db)).toBe(before);
		expect(await files(assetDir)).toEqual([]);
	});
});

it('removes saved images when the transaction fails', async () => {
	await setup(async ({ db, assetDir, preview, commit }) => {
		const { importPreview } = await preview(bundleBytes());
		vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('boom'));
		await expect(commit(bundleBytes(), importPreview.hash)).rejects.toThrow('boom');
		expect(await files(assetDir)).toEqual([]);
	});
});

it('reports file-level failures without opening an editor', async () => {
	await setup(async ({ preview }) => {
		expect(await preview(null)).toMatchObject({
			status: 400,
			data: { importError: 'Choose a zip bundle.' }
		});
		expect(await preview(new Uint8Array([1, 2, 3]))).toMatchObject({
			status: 400,
			data: { importError: 'This file is not a valid zip.' }
		});
	});
});
