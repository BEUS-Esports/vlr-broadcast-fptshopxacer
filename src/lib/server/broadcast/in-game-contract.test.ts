import { expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as s from '#lib/server/db/schema/index.ts';
import {
	removeTestDatabase,
	withManagementFixture
} from '#lib/server/testing/management-fixture.ts';
import { decodeBroadcastSnapshot, validatedPublications } from '#lib/broadcast/types.ts';

it('strictly accepts v3 controls and upgrades only valid persisted v2 captures', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Held' });
		const { updateBroadcastState } = await import('../services/broadcast');
		await updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { 'in-game': true }
		});
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const snapshot = await buildBroadcastSnapshot();
		expect(snapshot.version).toBe(3);
		expect(decodeBroadcastSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
		for (const pause of [
			{ type: 'tactical', entryId: 'entry-a' },
			{ type: 'none', entryId: 'entry-a' },
			{ type: 'technical', pendingTechnical: true },
			null
		]) {
			expect(
				decodeBroadcastSnapshot(
					JSON.stringify({ ...snapshot, liveControls: { ...snapshot.liveControls, pause } })
				)
			).toBeNull();
		}
		for (const ceremony of [
			{ type: 'ace', entryId: 'entry-a', triggeredAt: 10, sequence: 2 },
			{ type: 'clutch', entryId: '', triggeredAt: 10, sequence: 2 },
			{ type: 'clutch', entryId: 'entry-a', triggeredAt: -1, sequence: 2 },
			{ type: 'clutch', entryId: 'entry-a', triggeredAt: 10, sequence: 0 }
		]) {
			expect(
				decodeBroadcastSnapshot(
					JSON.stringify({ ...snapshot, liveControls: { ...snapshot.liveControls, ceremony } })
				)
			).toBeNull();
		}
		const held = snapshot.publications['in-game']!;
		const legacy = {
			...held,
			version: 2,
			liveControls: {
				swapped: held.liveControls.swapped,
				currentAttackersEntryId: held.liveControls.currentAttackersEntryId
			}
		};
		expect(validatedPublications({ 'in-game': legacy })['in-game']).toEqual(held);
		expect(
			decodeBroadcastSnapshot(
				JSON.stringify({
					...snapshot,
					publications: { ...snapshot.publications, 'in-game': legacy }
				})
			)
		).toBeNull();
		for (const malformed of [
			{ ...legacy, game: null },
			{ ...legacy, extra: true },
			{ ...legacy, liveControls: { swapped: 'yes', currentAttackersEntryId: null } }
		])
			expect(validatedPublications({ 'in-game': malformed })['in-game']).toBeNull();
		await db.update(s.broadcastState).set({
			publications: {
				...snapshot.publications,
				'in-game': legacy
			} as unknown as typeof snapshot.publications
		});
		expect((await buildBroadcastSnapshot()).publications['in-game']).toEqual(held);
	});
});

it('forward upgrades an existing Phase 6 singleton without changing its held publications or revisions', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-phase61-upgrade-'));
	const client = createClient({ url: `file:${join(directory, 'app.db')}` });
	try {
		const root = join(process.cwd(), 'drizzle'),
			old = join(directory, 'old');
		await mkdir(join(old, 'meta'), { recursive: true });
		const journal = JSON.parse(await readFile(join(root, 'meta/_journal.json'), 'utf8'));
		journal.entries = journal.entries.slice(0, 9);
		for (const entry of journal.entries)
			await cp(join(root, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
		await writeFile(join(old, 'meta/_journal.json'), JSON.stringify(journal));
		const db = drizzle(client, { schema: s });
		await migrate(db, { migrationsFolder: old });
		await client.execute(
			'INSERT INTO broadcast_state(id,control_revision,publications) VALUES(1,12,\'{"in-game":{"sentinel":true}}\')'
		);
		await migrate(db, { migrationsFolder: root });
		const [state] = await db.select().from(s.broadcastState);
		expect(state).toMatchObject({
			controlRevision: 12,
			pause: { type: 'none' },
			ceremony: null,
			publications: { 'in-game': { sentinel: true } }
		});
		expect((await client.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0);
	} finally {
		await removeTestDatabase(directory, client);
	}
});
