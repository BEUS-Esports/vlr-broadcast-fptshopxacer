import { and, asc, eq } from 'drizzle-orm';
import {
	STINGER_DURATION_MAX_MS,
	type BroadcastStinger,
	type StingerKind
} from '#lib/broadcast/stinger.ts';
import { db } from '#lib/server/db/index.ts';
import { stingerSettings, stingers } from '#lib/server/db/schema/index.ts';
import { SaveError } from '#lib/server/services/save-error.ts';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Stinger = typeof stingers.$inferSelect;
export type StingerSettings = { activeStingerId: string | null; revision: number };
type StingerTiming = { name: string; durationMs: number; cutPointMs: number };

const NAME_MAX_LENGTH = 80;
const assetPath =
	/^\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|webp|avif)$/;

function validateRevision(revision: number, label: string) {
	if (!Number.isSafeInteger(revision) || revision < 1)
		throw new SaveError('invalid', `A valid ${label} revision is required.`);
}

/** Shared with the upload endpoint, which must reject bad fields before streaming a body. */
export function validateStingerTiming(input: StingerTiming) {
	const name = typeof input.name === 'string' ? input.name.trim() : '';
	if (!name || name.length > NAME_MAX_LENGTH)
		throw new SaveError('invalid', `Name must be 1–${NAME_MAX_LENGTH} characters.`);
	const { durationMs, cutPointMs } = input;
	if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > STINGER_DURATION_MAX_MS)
		throw new SaveError('invalid', 'Duration must be 1–60000 ms.');
	if (!Number.isInteger(cutPointMs) || cutPointMs < 0 || cutPointMs > durationMs)
		throw new SaveError('invalid', 'Cut point must be between 0 and the duration.');
	return { name, durationMs, cutPointMs };
}

export async function listStingers(): Promise<Stinger[]> {
	return db.select().from(stingers).orderBy(asc(stingers.createdAt), asc(stingers.name));
}

export async function createStinger(input: StingerTiming & { path: string; kind: StingerKind }) {
	const timing = validateStingerTiming(input);
	const { path, kind } = input;
	const extension = typeof path === 'string' && assetPath.exec(path)?.[1];
	if (!extension) throw new SaveError('invalid', 'The stinger file is invalid.');
	if (kind !== (extension === 'webm' ? 'video' : 'image'))
		throw new SaveError('invalid', 'The stinger type does not match its file.');
	const [row] = await db
		.insert(stingers)
		.values({ ...timing, path, kind })
		.returning();
	return row;
}

export async function updateStinger(
	id: string,
	input: StingerTiming,
	expectedRevision: number
): Promise<Stinger> {
	validateRevision(expectedRevision, 'stinger');
	const timing = validateStingerTiming(input);
	const [row] = await db
		.update(stingers)
		.set({ ...timing, revision: expectedRevision + 1 })
		.where(and(eq(stingers.id, id), eq(stingers.revision, expectedRevision)))
		.returning();
	if (row) return row;
	const [existing] = await db.select({ id: stingers.id }).from(stingers).where(eq(stingers.id, id));
	if (!existing) throw new SaveError('not-found', 'Stinger not found.');
	throw new SaveError('stale', 'Stinger changed. Reload before saving.');
}

/** Deletes the row only; the file stays for the asset cleanup queue so an on-air play keeps it. */
export async function deleteStinger(id: string): Promise<void> {
	await db.delete(stingers).where(eq(stingers.id, id));
}

/** Read-only: the migration seeds the row, and a read must not bump the broadcast revision. */
export async function loadStingerSettings(
	connection: typeof db | Transaction = db
): Promise<StingerSettings> {
	const [row] = await connection.select().from(stingerSettings).where(eq(stingerSettings.id, 1));
	return { activeStingerId: row?.activeStingerId ?? null, revision: row?.revision ?? 1 };
}

export async function setActiveStinger(
	id: string | null,
	expectedRevision: number
): Promise<StingerSettings> {
	validateRevision(expectedRevision, 'stinger settings');
	if (id !== null) {
		const [existing] = await db
			.select({ id: stingers.id })
			.from(stingers)
			.where(eq(stingers.id, id));
		if (!existing) throw new SaveError('not-found', 'Stinger not found.');
	}
	const [row] = await db
		.update(stingerSettings)
		.set({ activeStingerId: id, revision: expectedRevision + 1 })
		.where(and(eq(stingerSettings.id, 1), eq(stingerSettings.revision, expectedRevision)))
		.returning();
	if (!row) throw new SaveError('stale', 'Stinger settings changed. Reload before saving.');
	return { activeStingerId: row.activeStingerId, revision: row.revision };
}

export async function loadActiveStinger(
	connection: typeof db | Transaction = db
): Promise<BroadcastStinger | null> {
	const [row] = await connection
		.select({
			path: stingers.path,
			kind: stingers.kind,
			durationMs: stingers.durationMs,
			cutPointMs: stingers.cutPointMs
		})
		.from(stingerSettings)
		.innerJoin(stingers, eq(stingers.id, stingerSettings.activeStingerId))
		.where(eq(stingerSettings.id, 1));
	return row ?? null;
}
