import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { players, teams } from '#lib/server/db/schema/index.ts';
import { hasDatabaseError, SaveError } from './save-error';

export const PROFILE_LIMITS = {
	teamName: 100,
	teamTag: 20,
	displayName: 100,
	fullName: 150,
	riotId: 100
} as const;

/** Comparison key for names, tags and Riot IDs; SQLite lower() only folds ASCII, so compare in JS. */
export const profileKey = (value: string) => value.normalize('NFC').trim().toLocaleLowerCase();

export function riotIdProblem(value: string): string | null {
	const parts = value.split('#');
	if (parts.length !== 2) return 'Riot ID must contain exactly one #.';
	if (!/^[\p{L}\p{N} ]{3,16}$/u.test(parts[0].trim()))
		return 'Riot ID game name must be 3–16 letters, digits, or spaces.';
	if (!/^[\p{L}\p{N}]{3,5}$/u.test(parts[1].trim()))
		return 'Riot ID tagline must be 3–5 letters or digits.';
	return null;
}

export function clashMessage(
	label: string,
	value: string,
	kind: 'team' | 'player',
	owner: { name: string; archivedAt: Date | null }
) {
	return `${label} "${value}" is already used by ${kind} "${owner.name}"${owner.archivedAt ? ' (archived)' : ''}.`;
}

const RACE = 'Another operator saved a matching profile. Reload and try again.';

async function guardUnique<T>(write: () => Promise<T>) {
	try {
		return await write();
	} catch (cause) {
		if (hasDatabaseError(cause, 'UNIQUE constraint failed')) throw new SaveError('invalid', RACE);
		throw cause;
	}
}

function required(value: string, label: string, max: number) {
	const clean = value.normalize('NFC').trim();
	if (!clean || clean.length > max)
		throw new SaveError('invalid', `${label} must be 1–${max} characters.`);
	return clean;
}

function optional(value: string, label: string, max: number) {
	const clean = value.normalize('NFC').trim();
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
		name: required(input.name, 'Team name', PROFILE_LIMITS.teamName),
		tag: required(input.tag, 'Team tag', PROFILE_LIMITS.teamTag),
		...(input.logoPath && { logoPath: input.logoPath }),
		...(input.logoWhitePath && { logoWhitePath: input.logoWhitePath }),
		...(input.logoBlackPath && { logoBlackPath: input.logoBlackPath })
	};
	const others = await db
		.select({ name: teams.name, tag: teams.tag, archivedAt: teams.archivedAt })
		.from(teams)
		.where(input.id ? ne(teams.id, input.id) : undefined);
	const nameKey = profileKey(values.name);
	const tagKey = profileKey(values.tag);
	const sameName = others.find((other) => profileKey(other.name) === nameKey);
	if (sameName)
		throw new SaveError('invalid', clashMessage('Team name', values.name, 'team', sameName));
	const sameTag = others.find((other) => profileKey(other.tag) === tagKey);
	if (sameTag)
		throw new SaveError('invalid', clashMessage('Team tag', values.tag, 'team', sameTag));
	if (!input.id) {
		const [row] = await guardUnique(() => db.insert(teams).values(values).returning());
		return row;
	}
	if (!Number.isSafeInteger(input.revision) || (input.revision ?? 0) < 1)
		throw new SaveError('invalid', 'A valid revision is required.');
	const [row] = await guardUnique(() =>
		db
			.update(teams)
			.set({ ...values, revision: sql`${teams.revision} + 1` })
			.where(and(eq(teams.id, input.id!), eq(teams.revision, input.revision!)))
			.returning()
	);
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
		displayName: required(input.displayName, 'Display name', PROFILE_LIMITS.displayName),
		fullName: optional(input.fullName, 'Full name', PROFILE_LIMITS.fullName),
		riotId: optional(input.riotId, 'Riot ID', PROFILE_LIMITS.riotId),
		...(input.portraitPath && { portraitPath: input.portraitPath })
	};
	const rows = await db
		.select({
			id: players.id,
			displayName: players.displayName,
			riotId: players.riotId,
			archivedAt: players.archivedAt
		})
		.from(players);
	const others = rows.filter((row) => row.id !== input.id);
	if (values.riotId && values.riotId !== rows.find((row) => row.id === input.id)?.riotId) {
		const problem = riotIdProblem(values.riotId);
		if (problem) throw new SaveError('invalid', problem);
	}
	const nameKey = profileKey(values.displayName);
	const sameName = others.find((other) => profileKey(other.displayName) === nameKey);
	if (sameName)
		throw new SaveError(
			'invalid',
			clashMessage('Display name', values.displayName, 'player', {
				...sameName,
				name: sameName.displayName
			})
		);
	if (values.riotId) {
		const riotKey = profileKey(values.riotId);
		const sameRiot = others.find((other) => other.riotId && profileKey(other.riotId) === riotKey);
		if (sameRiot)
			throw new SaveError(
				'invalid',
				clashMessage('Riot ID', values.riotId, 'player', {
					...sameRiot,
					name: sameRiot.displayName
				})
			);
	}
	if (!input.id) {
		const [row] = await guardUnique(() => db.insert(players).values(values).returning());
		return row;
	}
	if (!Number.isSafeInteger(input.revision) || (input.revision ?? 0) < 1)
		throw new SaveError('invalid', 'A valid revision is required.');
	const [row] = await guardUnique(() =>
		db
			.update(players)
			.set({ ...values, revision: sql`${players.revision} + 1` })
			.where(and(eq(players.id, input.id!), eq(players.revision, input.revision!)))
			.returning()
	);
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
