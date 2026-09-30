import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import * as schema from '#lib/server/db/schema/index.ts';

export const managementIds = {
	tournament: 't',
	otherTournament: 'other',
	teamA: 'team-a',
	teamB: 'team-b',
	teamC: 'team-c',
	entryA: 'entry-a',
	entryB: 'entry-b',
	entryC: 'entry-c',
	match: 'match',
	maps: ['map-1', 'map-2', 'map-3', 'map-4', 'map-5', 'map-6', 'map-7']
} as const;

/** libSQL's local transaction handles need GC before Windows can unlink the file. */
export async function removeTestDatabase(directory: string, ...clients: Client[]) {
	for (const client of clients) client.close();
	try {
		await rm(directory, { recursive: true, force: true });
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== 'EBUSY' || !process.env.VLR_TEST_CLEANUP)
			throw cause;
		// A completed libSQL transaction may remain reachable by an assertion until worker exit.
		await appendFile(process.env.VLR_TEST_CLEANUP, `${directory}\n`);
	}
}

async function fixture(twoConnections: boolean) {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-management-'));
	const url = `file:${join(directory, 'app.db')}`;
	const client = createClient({ url });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
	await db.insert(schema.tournaments).values([
		{ id: 't', name: 'Event', slug: 'event' },
		{ id: 'other', name: 'Other event', slug: 'other-event' }
	]);
	await db.insert(schema.teams).values(
		['a', 'b', 'c'].map((key) => ({
			id: `team-${key}`,
			name: `Team ${key.toUpperCase()}`,
			tag: key.toUpperCase()
		}))
	);
	await db.insert(schema.tournamentEntries).values(
		['a', 'b', 'c'].map((key) => ({
			id: `entry-${key}`,
			tournamentId: 't',
			teamId: `team-${key}`
		}))
	);
	await db.insert(schema.players).values(
		['a', 'b'].flatMap((team) =>
			Array.from({ length: 6 }, (_, i) => ({
				id: `${team}${i + 1}`,
				displayName: `Player ${team}${i + 1}`
			}))
		)
	);
	await db.insert(schema.tournamentEntryPlayers).values(
		['a', 'b'].flatMap((team) =>
			Array.from({ length: 6 }, (_, i) => ({
				entryId: `entry-${team}`,
				playerId: `${team}${i + 1}`
			}))
		)
	);
	await db
		.insert(schema.maps)
		.values(managementIds.maps.map((id) => ({ id, key: id, displayName: id })));
	await db
		.insert(schema.tournamentMapPool)
		.values(managementIds.maps.map((mapId) => ({ tournamentId: 't', mapId })));
	await db.insert(schema.matches).values({
		id: 'match',
		tournamentId: 't',
		teamAEntryId: 'entry-a',
		teamBEntryId: 'entry-b',
		label: 'Opening',
		bestOf: 3
	});
	const secondClient = twoConnections ? createClient({ url }) : null;
	return {
		directory,
		url,
		client,
		db,
		ids: managementIds,
		secondClient,
		secondDb: secondClient ? drizzle(secondClient, { schema }) : null
	};
}

export type ManagementFixture = Awaited<ReturnType<typeof fixture>>;

async function withFixture<T>(
	twoConnections: boolean,
	run: (context: ManagementFixture) => Promise<T>
) {
	const context = await fixture(twoConnections);
	vi.resetModules();
	vi.doMock('#lib/server/db/index.ts', () => ({ db: context.db }));
	try {
		return await run(context);
	} finally {
		vi.doUnmock('#lib/server/db/index.ts');
		vi.resetModules();
		await removeTestDatabase(
			context.directory,
			context.client,
			...(context.secondClient ? [context.secondClient] : [])
		);
	}
}

export function withManagementFixture<T>(run: (context: ManagementFixture) => Promise<T>) {
	return withFixture(false, run);
}

export function withTwoConnections<T>(
	run: (
		context: ManagementFixture & { secondClient: Client; secondDb: ManagementFixture['db'] }
	) => Promise<T>
) {
	return withFixture(true, (context) =>
		run({ ...context, secondClient: context.secondClient!, secondDb: context.secondDb! })
	);
}
