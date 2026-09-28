import { and, eq, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { agents, maps } from '#lib/server/db/schema/index.ts';
import { removeAsset, saveCatalogueImage } from '#lib/server/assets.ts';
import { hasDatabaseError, SaveError } from './save-error';

function label(value: string, field: string) {
	const clean = value.trim();
	if (!clean || clean.length > 100)
		throw new SaveError('invalid', `${field} must be 1–100 characters.`);
	return clean;
}

function key(value: string) {
	const clean = value.trim().toLowerCase();
	if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(clean))
		throw new SaveError('invalid', 'Key must use lowercase letters, numbers, and hyphens.');
	return clean;
}

export async function saveResource(input: {
	kind: 'map' | 'agent';
	id?: string;
	revision?: number;
	key: string;
	displayName: string;
	roleName?: string;
	isActive: boolean;
}) {
	const values = {
		key: key(input.key),
		displayName: label(input.displayName, 'Name'),
		isActive: input.isActive
	};
	const table = input.kind === 'map' ? maps : agents;
	const roleName = input.roleName?.trim() || null;
	if (roleName && roleName.length > 100)
		throw new SaveError('invalid', 'Role must be at most 100 characters.');
	const fields = input.kind === 'agent' ? { ...values, roleName } : values;
	try {
		if (!input.id) {
			const [row] = await db.insert(table).values(fields).returning();
			return row;
		}
		if (!Number.isSafeInteger(input.revision) || (input.revision ?? 0) < 1)
			throw new SaveError('invalid', 'A valid revision is required.');
		const [row] = await db
			.update(table)
			.set({ ...fields, revision: sql`${table.revision} + 1` })
			.where(and(eq(table.id, input.id), eq(table.revision, input.revision!)))
			.returning();
		if (!row)
			throw new SaveError('stale', 'Resource changed or was removed. Reload before saving.');
		return row;
	} catch (cause) {
		if (hasDatabaseError(cause, 'UNIQUE constraint failed'))
			throw new SaveError('invalid', 'That resource key is already in use.');
		throw cause;
	}
}

export async function removeResource(kind: 'map' | 'agent', id: string, revision: number) {
	if (!id || !Number.isSafeInteger(revision) || revision < 1)
		throw new SaveError('invalid', 'A valid resource and revision are required.');
	const table = kind === 'map' ? maps : agents;
	try {
		const [row] = await db
			.delete(table)
			.where(and(eq(table.id, id), eq(table.revision, revision)))
			.returning({ id: table.id });
		if (!row)
			throw new SaveError('stale', 'Resource changed or was removed. Reload before deleting.');
	} catch (cause) {
		if (hasDatabaseError(cause, 'FOREIGN KEY constraint failed'))
			throw new SaveError(
				'blocked',
				'This resource is used by a tournament or game and cannot be deleted.'
			);
		throw cause;
	}
}

type CatalogueRecord = {
	uuid: string;
	displayName: string;
	displayIcon: string | null;
	mapUrl?: string | null;
	splash?: string | null;
	fullPortrait?: string | null;
	role?: { displayName?: string, displayIcon?: string } | null;
	isPlayableCharacter?: boolean;
};

async function catalogue(path: string): Promise<CatalogueRecord[]> {
	const response = await fetch(`https://valorant-api.com/v1/${path}`, {
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok) throw new Error(`Catalogue request failed: ${response.status}`);
	const body: unknown = await response.json();
	if (
		!body ||
		typeof body !== 'object' ||
		!('data' in body) ||
		!Array.isArray(body.data) ||
		!body.data.length ||
		body.data.length > 100 ||
		!body.data.every(validRecord)
	)
		throw new SaveError('invalid', 'Catalogue response is invalid.');
	return body.data;
}

function validRecord(value: unknown): value is CatalogueRecord {
	if (!value || typeof value !== 'object') return false;
	const row = value as Record<string, unknown>;
	return (
		typeof row.uuid === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.uuid) &&
		typeof row.displayName === 'string' &&
		row.displayName.trim().length > 0 &&
		row.displayName.length <= 100 &&
		['displayIcon', 'mapUrl', 'splash', 'fullPortrait'].every(
			(field) => row[field] == null || typeof row[field] === 'string'
		) &&
		(row.role == null ||
			(typeof row.role === 'object' &&
				(typeof (row.role as Record<string, unknown>).displayName === 'string' ||
					(row.role as Record<string, unknown>).displayName == null)))
	);
}

export async function refreshCatalogue() {
	const [incomingMaps, incomingAgents] = await Promise.all([
		catalogue('maps?language=en-US'),
		catalogue('agents?isPlayableCharacter=true&language=en-US')
	]);
	const mapRows = incomingMaps.filter(
		(row) =>
			row.displayIcon && row.mapUrl?.startsWith('/Game/Maps/') && !row.mapUrl.includes('/HURM/')
	);
	const agentRows = incomingAgents.filter((row) => row.isPlayableCharacter);
	for (const rows of [mapRows, agentRows]) {
		if (!rows.length || new Set(rows.map((row) => row.uuid)).size !== rows.length)
			throw new SaveError('invalid', 'Catalogue returned an invalid or empty resource list.');
	}
	const existingMaps = await db.select().from(maps);
	const existingAgents = await db.select().from(agents);
	const oldMaps = new Map(
		existingMaps.filter((r) => r.valorantApiUuid).map((r) => [r.valorantApiUuid, r])
	);
	const oldAgents = new Map(
		existingAgents.filter((r) => r.valorantApiUuid).map((r) => [r.valorantApiUuid, r])
	);
	const created: string[] = [];
	async function local(url: string | null | undefined, old: string | null | undefined) {
		if (old) return old;
		if (!url) return null;
		const path = await saveCatalogueImage(url);
		created.push(path);
		return path;
	}
	try {
		const preparedMaps: (typeof maps.$inferInsert)[] = [];
		for (const row of mapRows) {
			const old = oldMaps.get(row.uuid);
			preparedMaps.push({
				valorantApiUuid: row.uuid,
				key: old?.key ?? `catalog-${row.uuid}`,
				displayName: row.displayName.trim(),
				displayIconPath: await local(row.displayIcon, old?.displayIconPath),
				splashPath: await local(row.splash, old?.splashPath),
				isActive: old?.isActive ?? true
			});
		}
		const preparedAgents: (typeof agents.$inferInsert)[] = [];
		for (const row of agentRows) {
			const old = oldAgents.get(row.uuid);
			preparedAgents.push({
				valorantApiUuid: row.uuid,
				key: old?.key ?? `catalog-${row.uuid}`,
				displayName: row.displayName.trim(),
				roleName: row.role?.displayName?.trim() || null,
				roleIconPath: row.role?.displayIcon?.trim() || null,
				displayIconPath: await local(row.displayIcon, old?.displayIconPath),
				fullPortraitPath: await local(row.fullPortrait, old?.fullPortraitPath),
				isActive: old?.isActive ?? true
			});
		}
		await db.transaction(async (tx) => {
			for (const row of preparedMaps) {
				await tx
					.insert(maps)
					.values(row)
					.onConflictDoUpdate({
						target: maps.valorantApiUuid,
						set: { ...row, revision: sql`${maps.revision} + 1` }
					});
			}
			for (const row of preparedAgents) {
				await tx
					.insert(agents)
					.values(row)
					.onConflictDoUpdate({
						target: agents.valorantApiUuid,
						set: { ...row, revision: sql`${agents.revision} + 1` }
					});
			}
		});
		return { maps: preparedMaps.length, agents: preparedAgents.length };
	} catch (cause) {
		await Promise.all(created.map(removeAsset));
		throw cause;
	}
}
