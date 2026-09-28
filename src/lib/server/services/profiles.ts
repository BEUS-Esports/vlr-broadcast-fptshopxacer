import { and, eq, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { players, teams } from '#lib/server/db/schema/index.ts';
import { hasDatabaseError, SaveError } from './save-error';

function required(value: string, label: string, max: number) {
	const clean = value.trim();
	if (!clean || clean.length > max)
		throw new SaveError('invalid', `${label} must be 1–${max} characters.`);
	return clean;
}

function optional(value: string, label: string, max: number) {
	const clean = value.trim();
	if (clean.length > max)
		throw new SaveError('invalid', `${label} must be at most ${max} characters.`);
	return clean || null;
}

export type TeamInput = {
	id?: string;
	revision?: number;
	name: string;
	tag: string;
	logoPath?: string | null;
	logoWhitePath?: string | null;
	logoBlackPath?: string | null;
};

export async function saveTeam(input: TeamInput) {
	const values = {
		name: required(input.name, 'Team name', 100),
		tag: required(input.tag, 'Team tag', 20),
		...(input.logoPath && { logoPath: input.logoPath }),
		...(input.logoWhitePath && { logoWhitePath: input.logoWhitePath }),
		...(input.logoBlackPath && { logoBlackPath: input.logoBlackPath })
	};
	if (!input.id) {
		const [row] = await db.insert(teams).values(values).returning();
		return row;
	}
	if (!Number.isSafeInteger(input.revision) || (input.revision ?? 0) < 1)
		throw new SaveError('invalid', 'A valid revision is required.');
	const [row] = await db
		.update(teams)
		.set({ ...values, revision: sql`${teams.revision} + 1` })
		.where(and(eq(teams.id, input.id), eq(teams.revision, input.revision!)))
		.returning();
	if (!row) throw new SaveError('stale', 'Team changed or was removed. Reload before saving.');
	return row;
}

export type PlayerInput = {
	id?: string;
	revision?: number;
	displayName: string;
	fullName: string;
	riotId: string;
	portraitPath?: string | null;
};

export async function savePlayer(input: PlayerInput) {
	const values = {
		displayName: required(input.displayName, 'Display name', 100),
		fullName: optional(input.fullName, 'Full name', 150),
		riotId: optional(input.riotId, 'Riot ID', 100),
		...(input.portraitPath && { portraitPath: input.portraitPath })
	};
	if (!input.id) {
		const [row] = await db.insert(players).values(values).returning();
		return row;
	}
	if (!Number.isSafeInteger(input.revision) || (input.revision ?? 0) < 1)
		throw new SaveError('invalid', 'A valid revision is required.');
	const [row] = await db
		.update(players)
		.set({ ...values, revision: sql`${players.revision} + 1` })
		.where(and(eq(players.id, input.id), eq(players.revision, input.revision!)))
		.returning();
	if (!row) throw new SaveError('stale', 'Player changed or was removed. Reload before saving.');
	return row;
}

export async function removeProfile(kind: 'team' | 'player', id: string, revision: number) {
	if (!id || !Number.isSafeInteger(revision) || revision < 1)
		throw new SaveError('invalid', 'A valid record and revision are required.');
	try {
		const table = kind === 'team' ? teams : players;
		const [row] = await db
			.delete(table)
			.where(and(eq(table.id, id), eq(table.revision, revision)))
			.returning({ id: table.id });
		if (!row)
			throw new SaveError('stale', 'Record changed or was removed. Reload before deleting.');
	} catch (cause) {
		if (hasDatabaseError(cause, 'FOREIGN KEY constraint failed'))
			throw new SaveError(
				'blocked',
				'This profile is used by a tournament or game and cannot be deleted.'
			);
		throw cause;
	}
}
