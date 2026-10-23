import { and, eq, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { agents, maps, weapons } from '#lib/server/db/schema/index.ts';
import { removeAsset, saveCatalogueImage } from '#lib/server/assets.ts';
import { hasDatabaseError, SaveError } from './save-error';
import type { AgentAbilitySlot } from '#lib/resources/types.ts';

export type ResourceKind = 'map' | 'agent' | 'weapon';

export type ResourceSyncProgress = {
	phase: 'fetch' | 'download' | 'save';
	completed: number;
	total: number;
	message: string;
};

type ProgressReporter = (progress: ResourceSyncProgress) => void | Promise<void>;

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

function optionalLabel(value: string | undefined, field: string) {
	const clean = value?.trim() || null;
	if (clean && clean.length > 100)
		throw new SaveError('invalid', `${field} must be at most 100 characters.`);
	return clean;
}

export async function saveResource(input: {
	kind: ResourceKind;
	id?: string;
	revision?: number;
	key: string;
	displayName: string;
	roleName?: string;
	category?: string;
	isActive: boolean;
}) {
	const values = {
		key: key(input.key),
		displayName: label(input.displayName, 'Name'),
		isActive: input.isActive
	};
	const roleName = optionalLabel(input.roleName, 'Role');
	const category = optionalLabel(input.category, 'Category');

	try {
		if (!input.id) {
			if (input.kind === 'map') {
				const [row] = await db.insert(maps).values(values).returning();
				return row;
			}
			if (input.kind === 'agent') {
				const [row] = await db
					.insert(agents)
					.values({ ...values, roleName })
					.returning();
				return row;
			}
			const [row] = await db
				.insert(weapons)
				.values({ ...values, category })
				.returning();
			return row;
		}

		if (!Number.isSafeInteger(input.revision) || (input.revision ?? 0) < 1)
			throw new SaveError('invalid', 'A valid revision is required.');

		if (input.kind === 'map') {
			const [row] = await db
				.update(maps)
				.set({ ...values, revision: sql`${maps.revision} + 1` })
				.where(and(eq(maps.id, input.id), eq(maps.revision, input.revision!)))
				.returning();
			if (!row)
				throw new SaveError('stale', 'Resource changed or was removed. Reload before saving.');
			return row;
		}

		if (input.kind === 'agent') {
			const [row] = await db
				.update(agents)
				.set({ ...values, roleName, revision: sql`${agents.revision} + 1` })
				.where(and(eq(agents.id, input.id), eq(agents.revision, input.revision!)))
				.returning();
			if (!row)
				throw new SaveError('stale', 'Resource changed or was removed. Reload before saving.');
			return row;
		}

		const [row] = await db
			.update(weapons)
			.set({ ...values, category, revision: sql`${weapons.revision} + 1` })
			.where(and(eq(weapons.id, input.id), eq(weapons.revision, input.revision!)))
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

export async function removeResource(kind: ResourceKind, id: string, revision: number) {
	if (!id || !Number.isSafeInteger(revision) || revision < 1)
		throw new SaveError('invalid', 'A valid resource and revision are required.');

	try {
		const row =
			kind === 'map'
				? (
						await db
							.delete(maps)
							.where(and(eq(maps.id, id), eq(maps.revision, revision)))
							.returning({ id: maps.id })
					)[0]
				: kind === 'agent'
					? (
							await db
								.delete(agents)
								.where(and(eq(agents.id, id), eq(agents.revision, revision)))
								.returning({ id: agents.id })
						)[0]
					: (
							await db
								.delete(weapons)
								.where(and(eq(weapons.id, id), eq(weapons.revision, revision)))
								.returning({ id: weapons.id })
						)[0];

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
	role?: { displayName?: string; displayIcon?: string } | null;
	isPlayableCharacter?: boolean;
	category?: string | null;
	killStreamIcon?: string | null;
	abilities?: Array<{ slot: string; displayName: string; displayIcon: string | null }> | null;
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
		['displayIcon', 'mapUrl', 'splash', 'fullPortrait', 'category', 'killStreamIcon'].every(
			(field) => row[field] == null || typeof row[field] === 'string'
		) &&
		(row.abilities == null ||
			(Array.isArray(row.abilities) &&
				row.abilities.length <= 10 &&
				row.abilities.every((ability: unknown) => {
					if (!ability || typeof ability !== 'object') return false;
					const item = ability as Record<string, unknown>;
					return (
						typeof item.slot === 'string' &&
						typeof item.displayName === 'string' &&
						item.displayName.length <= 100 &&
						(item.displayIcon == null || typeof item.displayIcon === 'string')
					);
				}))) &&
		(row.role == null ||
			(typeof row.role === 'object' &&
				['displayName', 'displayIcon'].every((field) => {
					const roleValue = (row.role as Record<string, unknown>)[field];
					return roleValue == null || typeof roleValue === 'string';
				})))
	);
}

async function report(onProgress: ProgressReporter | undefined, progress: ResourceSyncProgress) {
	await onProgress?.(progress);
}

function isLocalAsset(path: string | null | undefined) {
	return Boolean(path?.startsWith('/assets/'));
}

function normalizedCategory(value: string | null | undefined) {
	const clean = value?.trim();
	if (!clean) return null;
	return clean.split('::').at(-1) || clean;
}

async function assetLocalizer(options: {
	missingUrls: Set<string>;
	onProgress?: ProgressReporter;
	created: string[];
}) {
	const resolved = new Map<string, string>();
	let completed = 0;

	await report(options.onProgress, {
		phase: 'download',
		completed,
		total: options.missingUrls.size,
		message: options.missingUrls.size
			? `Downloading artwork (0/${options.missingUrls.size})`
			: 'Artwork is already cached locally.'
	});

	return async (url: string | null | undefined, old: string | null | undefined, name: string) => {
		if (isLocalAsset(old)) return old!;
		if (!url) return null;
		const cached = resolved.get(url);
		if (cached) return cached;

		const path = await saveCatalogueImage(url);
		options.created.push(path);
		resolved.set(url, path);
		completed += 1;
		await report(options.onProgress, {
			phase: 'download',
			completed,
			total: options.missingUrls.size,
			message: `Downloaded ${name} (${completed}/${options.missingUrls.size})`
		});
		return path;
	};
}

function addMissingUrl(
	set: Set<string>,
	url: string | null | undefined,
	old: string | null | undefined
) {
	if (url && !isLocalAsset(old)) set.add(url);
}

async function syncMaps(onProgress?: ProgressReporter) {
	await report(onProgress, {
		phase: 'fetch',
		completed: 0,
		total: 0,
		message: 'Fetching maps from VALORANT-API…'
	});
	const incoming = await catalogue('maps?language=en-US');
	const rows = incoming.filter(
		(row) =>
			row.displayIcon && row.mapUrl?.startsWith('/Game/Maps/') && !row.mapUrl.includes('/HURM/')
	);
	if (!rows.length || new Set(rows.map((row) => row.uuid)).size !== rows.length)
		throw new SaveError('invalid', 'Catalogue returned an invalid or empty map list.');

	const existing = await db.select().from(maps);
	const oldByUuid = new Map(
		existing.filter((r) => r.valorantApiUuid).map((r) => [r.valorantApiUuid!, r])
	);
	const missingUrls = new Set<string>();
	for (const row of rows) {
		const old = oldByUuid.get(row.uuid);
		addMissingUrl(missingUrls, row.displayIcon, old?.displayIconPath);
		addMissingUrl(missingUrls, row.splash, old?.splashPath);
	}

	const created: string[] = [];
	const local = await assetLocalizer({ missingUrls, onProgress, created });
	try {
		const prepared: (typeof maps.$inferInsert)[] = [];
		for (const row of rows) {
			const old = oldByUuid.get(row.uuid);
			prepared.push({
				valorantApiUuid: row.uuid,
				key: old?.key ?? `catalog-${row.uuid}`,
				displayName: row.displayName.trim(),
				displayIconPath: await local(
					row.displayIcon,
					old?.displayIconPath,
					`${row.displayName} icon`
				),
				splashPath: await local(row.splash, old?.splashPath, `${row.displayName} splash`),
				isActive: old?.isActive ?? true
			});
		}

		await report(onProgress, {
			phase: 'save',
			completed: prepared.length,
			total: prepared.length,
			message: 'Saving maps…'
		});
		await db.transaction(async (tx) => {
			for (const row of prepared) {
				await tx
					.insert(maps)
					.values(row)
					.onConflictDoUpdate({
						target: maps.valorantApiUuid,
						set: {
							displayName: row.displayName,
							displayIconPath: row.displayIconPath,
							splashPath: row.splashPath,
							revision: sql`${maps.revision} + 1`
						}
					});
			}
		});
		return prepared.length;
	} catch (cause) {
		await Promise.all(created.map(removeAsset));
		throw cause;
	}
}

async function syncAgents(onProgress?: ProgressReporter) {
	await report(onProgress, {
		phase: 'fetch',
		completed: 0,
		total: 0,
		message: 'Fetching agents from VALORANT-API…'
	});
	const incoming = await catalogue('agents?isPlayableCharacter=true&language=en-US');
	const rows = incoming.filter((row) => row.isPlayableCharacter);
	if (!rows.length || new Set(rows.map((row) => row.uuid)).size !== rows.length)
		throw new SaveError('invalid', 'Catalogue returned an invalid or empty agent list.');

	const existing = await db.select().from(agents);
	const oldByUuid = new Map(
		existing.filter((r) => r.valorantApiUuid).map((r) => [r.valorantApiUuid!, r])
	);
	const missingUrls = new Set<string>();
	for (const row of rows) {
		const old = oldByUuid.get(row.uuid);
		addMissingUrl(missingUrls, row.displayIcon, old?.displayIconPath);
		addMissingUrl(missingUrls, row.fullPortrait, old?.fullPortraitPath);
		addMissingUrl(missingUrls, row.role?.displayIcon, old?.roleIconPath);
		for (const ability of row.abilities ?? []) {
			const slot = abilitySlot(ability.slot);
			if (slot)
				addMissingUrl(
					missingUrls,
					ability.displayIcon,
					old?.abilities.find((item) => item.slot === slot)?.displayIconPath
				);
		}
	}

	const created: string[] = [];
	const local = await assetLocalizer({ missingUrls, onProgress, created });
	try {
		const prepared: (typeof agents.$inferInsert)[] = [];
		for (const row of rows) {
			const old = oldByUuid.get(row.uuid);
			const abilities: typeof agents.$inferSelect.abilities = [];
			for (const ability of row.abilities ?? []) {
				const slot = abilitySlot(ability.slot);
				if (!slot || abilities.some((item) => item.slot === slot)) continue;
				abilities.push({
					slot,
					displayName: ability.displayName.trim(),
					displayIconPath: await local(
						ability.displayIcon,
						old?.abilities.find((item) => item.slot === slot)?.displayIconPath,
						`${row.displayName} ${ability.displayName}`
					)
				});
			}
			prepared.push({
				valorantApiUuid: row.uuid,
				key: old?.key ?? `catalog-${row.uuid}`,
				displayName: row.displayName.trim(),
				roleName: row.role?.displayName?.trim() || null,
				abilities,
				roleIconPath: await local(
					row.role?.displayIcon,
					old?.roleIconPath,
					`${row.role?.displayName ?? row.displayName} role icon`
				),
				displayIconPath: await local(
					row.displayIcon,
					old?.displayIconPath,
					`${row.displayName} icon`
				),
				fullPortraitPath: await local(
					row.fullPortrait,
					old?.fullPortraitPath,
					`${row.displayName} portrait`
				),
				isActive: old?.isActive ?? true
			});
		}

		await report(onProgress, {
			phase: 'save',
			completed: prepared.length,
			total: prepared.length,
			message: 'Saving agents…'
		});
		await db.transaction(async (tx) => {
			for (const row of prepared) {
				await tx
					.insert(agents)
					.values(row)
					.onConflictDoUpdate({
						target: agents.valorantApiUuid,
						set: {
							displayName: row.displayName,
							roleName: row.roleName,
							abilities: row.abilities,
							roleIconPath: row.roleIconPath,
							displayIconPath: row.displayIconPath,
							fullPortraitPath: row.fullPortraitPath,
							revision: sql`${agents.revision} + 1`
						}
					});
			}
		});
		return prepared.length;
	} catch (cause) {
		await Promise.all(created.map(removeAsset));
		throw cause;
	}
}

function abilitySlot(slot: string): AgentAbilitySlot | null {
	return (
		(
			{
				Grenade: 'grenade',
				Ability1: 'ability1',
				Ability2: 'ability2',
				Ultimate: 'ultimate'
			} as const
		)[slot as 'Grenade' | 'Ability1' | 'Ability2' | 'Ultimate'] ?? null
	);
}

async function syncWeapons(onProgress?: ProgressReporter) {
	await report(onProgress, {
		phase: 'fetch',
		completed: 0,
		total: 0,
		message: 'Fetching weapons from VALORANT-API…'
	});
	const rows = await catalogue('weapons?language=en-US');
	if (!rows.length || new Set(rows.map((row) => row.uuid)).size !== rows.length)
		throw new SaveError('invalid', 'Catalogue returned an invalid or empty weapon list.');

	const existing = await db.select().from(weapons);
	const oldByUuid = new Map(
		existing.filter((r) => r.valorantApiUuid).map((r) => [r.valorantApiUuid!, r])
	);
	const missingUrls = new Set<string>();
	for (const row of rows) {
		const old = oldByUuid.get(row.uuid);
		addMissingUrl(missingUrls, row.displayIcon, old?.displayIconPath);
		addMissingUrl(missingUrls, row.killStreamIcon, old?.killStreamIconPath);
	}

	const created: string[] = [];
	const local = await assetLocalizer({ missingUrls, onProgress, created });
	try {
		const prepared: (typeof weapons.$inferInsert)[] = [];
		for (const row of rows) {
			const old = oldByUuid.get(row.uuid);
			prepared.push({
				valorantApiUuid: row.uuid,
				key: old?.key ?? `catalog-${row.uuid}`,
				displayName: row.displayName.trim(),
				category: normalizedCategory(row.category),
				displayIconPath: await local(
					row.displayIcon,
					old?.displayIconPath,
					`${row.displayName} icon`
				),
				killStreamIconPath: await local(
					row.killStreamIcon,
					old?.killStreamIconPath,
					`${row.displayName} killfeed icon`
				),
				isActive: old?.isActive ?? true
			});
		}

		await report(onProgress, {
			phase: 'save',
			completed: prepared.length,
			total: prepared.length,
			message: 'Saving weapons…'
		});
		await db.transaction(async (tx) => {
			for (const row of prepared) {
				await tx
					.insert(weapons)
					.values(row)
					.onConflictDoUpdate({
						target: weapons.valorantApiUuid,
						set: {
							displayName: row.displayName,
							category: row.category,
							displayIconPath: row.displayIconPath,
							killStreamIconPath: row.killStreamIconPath,
							revision: sql`${weapons.revision} + 1`
						}
					});
			}
		});
		return prepared.length;
	} catch (cause) {
		await Promise.all(created.map(removeAsset));
		throw cause;
	}
}

export async function syncResourceKind(kind: ResourceKind, onProgress?: ProgressReporter) {
	if (kind === 'map') return { kind, count: await syncMaps(onProgress) };
	if (kind === 'agent') return { kind, count: await syncAgents(onProgress) };
	return { kind, count: await syncWeapons(onProgress) };
}

export async function refreshCatalogue() {
	const mapResult = await syncResourceKind('map');
	const agentResult = await syncResourceKind('agent');
	const weaponResult = await syncResourceKind('weapon');
	return {
		maps: mapResult.count,
		agents: agentResult.count,
		weapons: weaponResult.count
	};
}
