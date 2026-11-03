import { expect, it } from 'vitest';
import { withManagementFixture } from '../testing/management-fixture';
import * as s from '../db/schema';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTestDatabase } from '../testing/management-fixture';
import { eq } from 'drizzle-orm';

it('defaults v4 controls and independently persists canonical field lists and live lineup teams', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values([
			{ id: 'g', matchId: 'match', number: 1, name: 'Held' },
			{ id: 'g2', matchId: 'match', number: 2, name: 'Next' }
		]);
		const service = await import('../services/broadcast');
		const { buildBroadcastSnapshot } = await import('./snapshot');
		let state = await service.updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { 'player-lineup': true, mvp: true }
		});
		const snapshot = await buildBroadcastSnapshot();
		expect(snapshot.version).toBe(4);
		expect(snapshot.liveControls.lineupTeams).toBe('both');
		expect(snapshot.controls.playerStats.fields).toHaveLength(8);
		const held = snapshot.publications.mvp;
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			lineupTeams: 'team-a',
			swapped: true,
			mvpFields: ['defuses', 'kills']
		});
		expect(state.mvpFields).toEqual(['kills', 'defuses']);
		expect(state.playerStats.fields).toHaveLength(8);
		expect(state.publications.mvp).toEqual(held);
		const { programSnapshot, lineupTeamVisible } = await import('../../broadcast/selectors');
		const program = programSnapshot(await buildBroadcastSnapshot(), 'player-lineup')!;
		expect(program.liveControls.lineupTeams).toBe('team-a');
		expect(lineupTeamVisible(program, 'entry-a')).toBe(true);
		expect(lineupTeamVisible(program, 'entry-b')).toBe(false);
		expect(program.presentation.rightEntryId).toBe('entry-a');
		await expect(
			service.updateBroadcastState({
				expectedRevision: state.controlRevision - 1,
				lineupTeams: 'team-b'
			})
		).rejects.toMatchObject({ code: 'stale' });
		for (const fields of [[], ['kills', 'kills'], ['unknown'], null]) {
			await expect(
				service.updateBroadcastState({
					expectedRevision: state.controlRevision,
					mvpFields: fields
				} as never)
			).rejects.toMatchObject({ code: 'invalid' });
		}
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			visibility: { 'player-lineup': false, mvp: false }
		});
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			selectedGameId: 'g2'
		});
		expect(state.lineupTeams).toBe('both');
		expect(state.mvpFields).toHaveLength(8);
	});
});

it('validates player and MVP fields independently and captures new choices only on Show', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Held' });
		const { updateBroadcastState } = await import('../services/broadcast');
		const { defaultPlayerStats } = await import('../../broadcast/controls');
		let state = await updateBroadcastState({ expectedRevision: 1, selectedGameId: 'g' });
		state = await updateBroadcastState({
			expectedRevision: state.controlRevision,
			playerStats: { ...defaultPlayerStats, fields: ['defuses', 'kills'] },
			mvpFields: ['deaths']
		});
		expect(state.playerStats.fields).toEqual(['kills', 'defuses']);
		expect(state.mvpFields).toEqual(['deaths']);
		state = await updateBroadcastState({
			expectedRevision: state.controlRevision,
			visibility: { 'player-stats': true, mvp: true }
		});
		const heldStats = state.publications['player-stats'];
		const heldMvp = state.publications.mvp;
		state = await updateBroadcastState({
			expectedRevision: state.controlRevision,
			playerStats: { ...state.playerStats, fields: ['assists'] },
			mvpFields: ['kills']
		});
		expect(state.publications['player-stats']).toEqual(heldStats);
		expect(state.publications.mvp).toEqual(heldMvp);
		for (const fields of [[], ['kills', 'kills'], ['unknown'], null]) {
			await expect(
				updateBroadcastState({
					expectedRevision: state.controlRevision,
					playerStats: { ...state.playerStats, fields }
				} as never)
			).rejects.toMatchObject({ code: 'invalid' });
		}
		state = await updateBroadcastState({
			expectedRevision: state.controlRevision,
			visibility: { 'player-stats': false, mvp: false }
		});
		state = await updateBroadcastState({
			expectedRevision: state.controlRevision,
			visibility: { 'player-stats': true, mvp: true }
		});
		expect(state.publications['player-stats']?.controls.playerStats.fields).toEqual(['assists']);
		expect(state.publications.mvp?.controls.mvpFields).toEqual(['kills']);
	});
});

it('backfills a populated pre-C database without changing saved selections or held content', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-c-upgrade-'));
	const client = createClient({ url: `file:${join(directory, 'app.db')}` });
	try {
		const root = join(process.cwd(), 'drizzle');
		const old = join(directory, 'old');
		await mkdir(join(old, 'meta'), { recursive: true });
		const journal = JSON.parse(await readFile(join(root, 'meta/_journal.json'), 'utf8'));
		journal.entries = journal.entries.slice(0, 14);
		for (const entry of journal.entries)
			await cp(join(root, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
		await writeFile(join(old, 'meta/_journal.json'), JSON.stringify(journal));
		const db = drizzle(client);
		await migrate(db, { migrationsFolder: old });
		const oldStats = { mode: 'single', scope: 'match', playerId: null, opponentPlayerId: null };
		const publications = { mvp: { sentinel: 'held-content' } };
		await client.execute({
			sql: 'INSERT INTO broadcast_state(id, revision, control_revision, player_stats, publications) VALUES(1, ?, ?, ?, ?)',
			args: [7, 12, JSON.stringify(oldStats), JSON.stringify(publications)]
		});
		await migrate(db, { migrationsFolder: root });
		const result = await client.execute(
			'SELECT revision, control_revision, player_stats, publications, lineup_teams, mvp_fields FROM broadcast_state WHERE id = 1'
		);
		const state = result.rows[0];
		const fields = [
			'kills',
			'deaths',
			'assists',
			'performanceScore',
			'trades',
			'firstBloods',
			'plants',
			'defuses'
		];
		expect(state.revision).toBe(7);
		expect(state.control_revision).toBe(12);
		expect(state.lineup_teams).toBe('both');
		expect(JSON.parse(String(state.player_stats))).toEqual({ ...oldStats, fields });
		expect(JSON.parse(String(state.mvp_fields))).toEqual(fields);
		expect(JSON.parse(String(state.publications))).toEqual(publications);
		expect((await client.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0);
	} finally {
		await removeTestDatabase(directory, client);
	}
});

it('strictly decodes v4 and upgrades valid persisted v2/v3 without changing captured content or revisions', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Held' });
		const { updateBroadcastState } = await import('../services/broadcast');
		await updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { mvp: true }
		});
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const { decodeBroadcastSnapshot, validatedPublications } =
			await import('../../broadcast/types');
		const snapshot = await buildBroadcastSnapshot();
		expect(snapshot.version).toBe(4);
		const held = snapshot.publications.mvp!;
		await db.update(s.games).set({ name: 'Newer saved game' }).where(eq(s.games.id, 'g'));
		for (const version of [2, 3]) {
			const legacy = JSON.parse(JSON.stringify(held));
			legacy.version = version;
			delete legacy.liveControls.lineupTeams;
			delete legacy.controls.playerStats.fields;
			delete legacy.controls.mvpFields;
			if (version === 2) {
				delete legacy.liveControls.pause;
				delete legacy.liveControls.ceremony;
			}
			expect(validatedPublications({ mvp: legacy }).mvp).toEqual(held);
			await db
				.update(s.broadcastState)
				.set({ publications: { ...snapshot.publications, mvp: legacy } });
			const restored = await buildBroadcastSnapshot();
			expect(restored.game?.name).toBe('Newer saved game');
			expect(restored.publications.mvp).toEqual(held);
			expect(
				decodeBroadcastSnapshot(
					JSON.stringify({ ...snapshot, publications: { ...snapshot.publications, mvp: legacy } })
				)
			).toBeNull();
			expect(validatedPublications({ mvp: { ...legacy, game: null } }).mvp).toBeNull();
		}
		for (const fields of [[], ['kills', 'kills'], ['defuses', 'kills'], ['unknown']]) {
			expect(
				decodeBroadcastSnapshot(
					JSON.stringify({ ...snapshot, controls: { ...snapshot.controls, mvpFields: fields } })
				)
			).toBeNull();
		}
	});
});
