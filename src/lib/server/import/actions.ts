import { fail, type Action } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { db } from '#lib/server/db/index.ts';
import { players, teams } from '#lib/server/db/schema/index.ts';
import { removeAsset, saveBytes } from '#lib/server/assets.ts';
import { hasDatabaseError, SaveError } from '#lib/server/services/save-error.ts';
import { BUNDLE_LIMITS, readBundle } from './bundle.ts';
import { buildPreview } from './validate.ts';

// Shared by both actions: read, size-check and parse the upload, then preview it against current profiles.
async function load(request: Request) {
	const form = await request.formData();
	const file = form.get('bundle');
	if (!(file instanceof File) || file.size === 0)
		throw new SaveError('invalid', 'Choose a zip bundle.');
	if (file.size > BUNDLE_LIMITS.zipBytes)
		throw new SaveError('invalid', 'The bundle must be 32 MB or smaller.');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const bundle = readBundle(bytes);
	const [existingTeams, existingPlayers] = await Promise.all([
		db.select({ name: teams.name, tag: teams.tag, archivedAt: teams.archivedAt }).from(teams),
		db
			.select({
				displayName: players.displayName,
				riotId: players.riotId,
				archivedAt: players.archivedAt
			})
			.from(players)
	]);
	const preview = buildPreview(
		bundle,
		{ teams: existingTeams, players: existingPlayers },
		createHash('sha256').update(bytes).digest('hex')
	);
	return { form, bundle, preview };
}

// File-level SaveErrors become a page message; never formError, whose values would open the editor.
const fileError = (cause: unknown) => {
	if (cause instanceof SaveError) return fail(400, { importError: cause.message });
	throw cause;
};

const importPreview: Action = async ({ request }) => {
	try {
		return { importPreview: (await load(request)).preview };
	} catch (cause) {
		return fileError(cause);
	}
};

const importCommit: Action = async ({ request }) => {
	let loaded;
	try {
		loaded = await load(request);
	} catch (cause) {
		return fileError(cause);
	}
	const { form, bundle, preview } = loaded;
	if (form.get('hash') !== preview.hash)
		return fail(400, {
			importPreview: preview,
			importError: 'The file changed since the preview. Review the new preview before importing.'
		});
	if (preview.problems.some((problem) => problem.level === 'error'))
		return fail(400, {
			importPreview: preview,
			importError: 'Nothing was imported. Fix the errors below and preview again.'
		});

	const images = new Map(
		[...bundle.portraits, ...Object.values(bundle.logos).flat()].map((image) => [image.path, image])
	);
	const saved: string[] = [];
	const store = async (path: string | null) => {
		if (!path) return null;
		const stored = await saveBytes(images.get(path)!.bytes);
		saved.push(stored);
		return stored;
	};
	try {
		const teamValues: (typeof teams.$inferInsert)[] = [];
		for (const team of preview.teams)
			teamValues.push({
				name: team.name,
				tag: team.tag,
				logoPath: await store(team.logos.normal),
				logoWhitePath: await store(team.logos.white),
				logoBlackPath: await store(team.logos.black)
			});
		const playerValues: (typeof players.$inferInsert)[] = [];
		for (const player of preview.players)
			playerValues.push({
				displayName: player.displayName,
				fullName: player.fullName,
				riotId: player.riotId,
				portraitPath: await store(player.portrait)
			});
		await db.transaction(async (tx) => {
			for (const values of teamValues) await tx.insert(teams).values(values);
			for (const values of playerValues) await tx.insert(players).values(values);
		});
		return { imported: { teams: teamValues.length, players: playerValues.length } };
	} catch (cause) {
		await Promise.all(saved.map(removeAsset));
		if (hasDatabaseError(cause, 'UNIQUE constraint failed'))
			return fail(409, {
				importError: 'Another operator added a matching team or player. Preview again.'
			});
		throw cause;
	}
};

export const bundleImportActions = { importPreview, importCommit };
