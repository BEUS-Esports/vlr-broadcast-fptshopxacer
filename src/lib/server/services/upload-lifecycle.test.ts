import { afterEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

const image = () =>
	new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'image.png', {
		type: 'image/png'
	});

afterEach(() => vi.unstubAllEnvs());

it.each(['team', 'player'] as const)(
	'removes new %s uploads after validation and stale-save failures, preserving saved images',
	async (kind) => {
		await withManagementFixture(async ({ db, directory }) => {
			const assetDir = join(directory, 'assets');
			vi.stubEnv('ASSET_DIR', assetDir);
			const { saveUpload } = await import('../assets');
			const original = await saveUpload(image());
			const table = kind === 'team' ? s.teams : s.players;
			const id = kind === 'team' ? 'team-a' : 'a1';
			if (kind === 'team')
				await db.update(s.teams).set({ logoPath: original }).where(eq(s.teams.id, id));
			else await db.update(s.players).set({ portraitPath: original }).where(eq(s.players.id, id));
			const before = await db.select().from(table).where(eq(table.id, id));
			const files = await readdir(assetDir);
			for (const failure of ['invalid', 'stale']) {
				const form = new FormData();
				form.set('id', id);
				form.set('revision', failure === 'stale' ? '99' : '1');
				form.set(kind === 'team' ? 'name' : 'displayName', failure === 'invalid' ? '' : 'Updated');
				form.set('tag', 'UP');
				for (const field of kind === 'team' ? ['logo', 'logoWhite', 'logoBlack'] : ['portrait'])
					form.set(field, image());
				const request = new Request('http://localhost/admin/profiles?/save', {
					method: 'POST',
					body: form
				});
				let result;
				if (kind === 'team') {
					const { actions } = await import('../../../routes/admin/teams/+page.server');
					result = await actions.save({ request } as Parameters<typeof actions.save>[0]);
				} else {
					const { actions } = await import('../../../routes/admin/players/+page.server');
					result = await actions.save({ request } as Parameters<typeof actions.save>[0]);
				}
				expect(result).toMatchObject({
					status: failure === 'stale' ? 409 : 400,
					data: { code: failure }
				});
				expect(await readdir(assetDir)).toEqual(files);
				expect(await db.select().from(table).where(eq(table.id, id))).toEqual(before);
			}
		});
	}
);

it('removes an earlier team upload when a later image is invalid', async () => {
	await withManagementFixture(async ({ directory }) => {
		const assetDir = join(directory, 'assets');
		vi.stubEnv('ASSET_DIR', assetDir);
		const { actions } = await import('../../../routes/admin/teams/+page.server');
		const form = new FormData();
		form.set('name', 'New team');
		form.set('tag', 'NEW');
		form.set('logo', image());
		form.set('logoWhite', new File(['invalid'], 'bad.png', { type: 'image/png' }));
		const request = new Request('http://localhost/admin/teams?/save', {
			method: 'POST',
			body: form
		});
		expect(await actions.save({ request } as Parameters<typeof actions.save>[0])).toMatchObject({
			status: 400,
			data: { code: 'invalid' }
		});
		expect(await readdir(assetDir)).toEqual([]);
	});
});

it('keeps replaced logos and portraits readable while held graphics still reference them', async () => {
	await withManagementFixture(async ({ db, directory }) => {
		vi.stubEnv('ASSET_DIR', join(directory, 'assets'));
		const { saveUpload, assetExists } = await import('../assets');
		const { saveTeam, savePlayer } = await import('./profiles');
		const logo = await saveUpload(image()),
			portrait = await saveUpload(image());
		const team = await saveTeam({
			id: 'team-a',
			revision: 1,
			name: 'Team A',
			tag: 'A',
			logoPath: logo
		});
		const player = await savePlayer({
			id: 'a1',
			revision: 1,
			displayName: 'Player A',
			fullName: '',
			riotId: '',
			portraitPath: portrait
		});
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Game' });
		await db
			.insert(s.gameLineups)
			.values({ gameId: 'g', entryId: 'entry-a', slot: 1, playerId: 'a1' });
		const { updateBroadcastState } = await import('./broadcast');
		const { buildBroadcastSnapshot } = await import('../broadcast/snapshot');
		await updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { 'player-lineup': true }
		});
		const nextLogo = await saveUpload(image()),
			nextPortrait = await saveUpload(image());
		await saveTeam({
			id: team.id,
			revision: team.revision,
			name: team.name,
			tag: team.tag,
			logoPath: nextLogo
		});
		await savePlayer({
			id: player.id,
			revision: player.revision,
			displayName: player.displayName,
			fullName: '',
			riotId: '',
			portraitPath: nextPortrait
		});
		const snapshot = await buildBroadcastSnapshot();
		expect(snapshot.teams.find((entry) => entry.teamId === team.id)?.logoPath).toBe(nextLogo);
		expect(snapshot.lineups[0].player?.portraitPath).toBe(nextPortrait);
		const held = snapshot.publications['player-lineup'];
		expect(held?.teams.find((entry) => entry.teamId === team.id)?.logoPath).toBe(logo);
		expect(held?.lineups[0].player?.portraitPath).toBe(portrait);
		for (const path of [logo, portrait, nextLogo, nextPortrait])
			expect(await assetExists(path)).toBe(true);
	});
});
