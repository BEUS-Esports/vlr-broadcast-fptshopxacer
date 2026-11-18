import type {
	ImportPlayerRow,
	ImportPreview,
	ImportProblem,
	ImportTeamRow,
	LogoVariant
} from '#lib/import/types.ts';
import { imageType } from '#lib/server/assets.ts';
import {
	canonicalRiotId,
	clashMessage,
	PROFILE_LIMITS,
	profileKey,
	riotIdProblem
} from '#lib/server/services/profiles.ts';
import { BUNDLE_LIMITS, type BundleImage, type ParsedBundle, type Sheet } from './bundle.ts';

export type ExistingProfiles = {
	teams: Array<{ name: string; tag: string; archivedAt: Date | null }>;
	players: Array<{ displayName: string; riotId: string | null; archivedAt: Date | null }>;
};

type Owner = { name: string; archivedAt: Date | null };
const VARIANTS: LogoVariant[] = ['normal', 'white', 'black'];
const TEAM_COLUMNS = ['team_name', 'team_tag'];
const PLAYER_COLUMNS = ['display_name', 'full_name', 'riot_id'];

const clean = (value: string | undefined) => (value ?? '').normalize('NFC').trim();
const byKey = (items: Array<[string, Owner]>) =>
	new Map(items.filter(([key]) => key).map(([key, owner]) => [profileKey(key), owner]));

export function buildPreview(
	bundle: ParsedBundle,
	existing: ExistingProfiles,
	hash: string
): ImportPreview {
	const problems = [...bundle.problems];
	const add = (
		level: ImportProblem['level'],
		file: string,
		row: number | null,
		field: string | null,
		message: string
	) => problems.push({ level, file, row, field, message });

	// Returns false (after reporting) when the sheet's columns are wrong, so its rows are skipped.
	const columnsOk = (sheet: Sheet, expected: string[]) => {
		const before = problems.length;
		for (const column of expected)
			if (!sheet.header.includes(column))
				add('error', sheet.file, 1, column, `Missing column ${column}.`);
		sheet.header.forEach((column, index) => {
			if (!column) return;
			if (!expected.includes(column))
				add('error', sheet.file, 1, column, `Unknown column ${column}.`);
			else if (sheet.header.indexOf(column) !== index)
				add('error', sheet.file, 1, column, `Duplicate column ${column}.`);
		});
		return problems.length === before;
	};

	// One checker per keyed field: remembers the first row per key and consults existing profiles.
	const keyedCheck = (
		file: string,
		field: string,
		label: string,
		kind: 'team' | 'player',
		existingByKey: Map<string, Owner>
	) => {
		const first = new Map<string, number>();
		return (row: number, value: string) => {
			if (!value) return;
			const key = profileKey(value);
			const earlier = first.get(key);
			if (earlier !== undefined) add('error', file, row, field, `Duplicates row ${earlier}.`);
			else first.set(key, row);
			const owner = existingByKey.get(key);
			if (owner) add('error', file, row, field, clashMessage(label, value, kind, owner));
		};
	};

	const teams: ImportTeamRow[] = [];
	const players: ImportPlayerRow[] = [];

	if (bundle.teams && columnsOk(bundle.teams, TEAM_COLUMNS)) {
		const file = bundle.teams.file;
		const checkName = keyedCheck(
			file,
			'team_name',
			'Team name',
			'team',
			byKey(existing.teams.map((t) => [t.name, t]))
		);
		const checkTag = keyedCheck(
			file,
			'team_tag',
			'Team tag',
			'team',
			byKey(existing.teams.map((t) => [t.tag, t]))
		);
		for (const { row, cells } of bundle.teams.rows) {
			const name = clean(cells.team_name);
			const tag = clean(cells.team_tag);
			if (!name || name.length > PROFILE_LIMITS.teamName)
				add(
					'error',
					file,
					row,
					'team_name',
					`Team name must be 1–${PROFILE_LIMITS.teamName} characters.`
				);
			checkName(row, name);
			if (!tag || tag.length > PROFILE_LIMITS.teamTag)
				add(
					'error',
					file,
					row,
					'team_tag',
					`Team tag must be 1–${PROFILE_LIMITS.teamTag} characters.`
				);
			checkTag(row, tag);
			teams.push({ row, name, tag, logos: { normal: null, white: null, black: null } });
		}
	}

	if (bundle.players && columnsOk(bundle.players, PLAYER_COLUMNS)) {
		const file = bundle.players.file;
		const checkName = keyedCheck(
			file,
			'display_name',
			'Display name',
			'player',
			byKey(
				existing.players.map((p) => [
					p.displayName,
					{ name: p.displayName, archivedAt: p.archivedAt }
				])
			)
		);
		const checkRiot = keyedCheck(
			file,
			'riot_id',
			'Riot ID',
			'player',
			byKey(
				existing.players.map((p) => [
					canonicalRiotId(p.riotId ?? ''),
					{ name: p.displayName, archivedAt: p.archivedAt }
				])
			)
		);
		for (const { row, cells } of bundle.players.rows) {
			const displayName = clean(cells.display_name);
			const fullName = clean(cells.full_name);
			const riotId = canonicalRiotId(clean(cells.riot_id));
			if (!displayName || displayName.length > PROFILE_LIMITS.displayName)
				add(
					'error',
					file,
					row,
					'display_name',
					`Display name must be 1–${PROFILE_LIMITS.displayName} characters.`
				);
			checkName(row, displayName);
			if (fullName.length > PROFILE_LIMITS.fullName)
				add(
					'error',
					file,
					row,
					'full_name',
					`Full name must be at most ${PROFILE_LIMITS.fullName} characters.`
				);
			const riotProblem = !riotId
				? 'Riot ID is required.'
				: riotId.length > PROFILE_LIMITS.riotId
					? `Riot ID must be at most ${PROFILE_LIMITS.riotId} characters.`
					: riotIdProblem(riotId);
			if (riotProblem) add('error', file, row, 'riot_id', riotProblem);
			checkRiot(row, riotId);
			players.push({ row, displayName, fullName: fullName || null, riotId, portrait: null });
		}
	}

	const sheetFile = (bundle.teams ?? bundle.players)?.file;
	if (sheetFile && !teams.length && !players.length && !problems.some((p) => p.level === 'error'))
		add('error', sheetFile, null, null, 'The bundle has no rows.');

	// Maps image key -> path for one slot; invalid or contested images are reported and left out.
	const claim = (images: BundleImage[]) => {
		const valid = images.filter(({ path, bytes }) => {
			try {
				if (bytes.length > BUNDLE_LIMITS.imageBytes)
					throw new Error('Images must be 10 MB or smaller.');
				imageType(bytes);
				return true;
			} catch (cause) {
				add('error', path, null, null, cause instanceof Error ? cause.message : String(cause));
				return false;
			}
		});
		const slot = new Map<string, string>();
		for (const { key, path } of valid) {
			const sameKey = valid.filter((image) => image.key === key);
			if (sameKey.length > 1) add('error', path, null, null, 'Another image fills the same slot.');
			else slot.set(key, path);
		}
		return slot;
	};
	const matched = new Set<string>();
	const match = (slot: Map<string, string>, value: string) => {
		const path = slot.get(profileKey(value)) ?? null;
		if (path) matched.add(path);
		return path;
	};
	const warnUnmatched = (slot: Map<string, string>, noun: string) => {
		for (const path of slot.values())
			if (!matched.has(path)) add('warning', path, null, null, `Matched no ${noun}.`);
	};

	for (const variant of VARIANTS) {
		const slot = claim(bundle.logos[variant]);
		for (const team of teams) team.logos[variant] = match(slot, team.tag);
		warnUnmatched(slot, 'team');
	}
	const portraits = claim(bundle.portraits);
	for (const player of players) player.portrait = match(portraits, player.riotId);
	warnUnmatched(portraits, 'player');

	return { hash, teams, players, imageCount: matched.size, problems };
}
