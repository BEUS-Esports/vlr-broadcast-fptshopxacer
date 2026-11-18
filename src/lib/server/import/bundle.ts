import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';
import type { ImportProblem, LogoVariant } from '#lib/import/types.ts';
import { profileKey } from '#lib/server/services/profiles.ts';
import { SaveError } from '#lib/server/services/save-error.ts';

export const BUNDLE_LIMITS = {
	zipBytes: 32 * 1024 * 1024,
	entries: 500,
	expandedBytes: 100 * 1024 * 1024,
	imageBytes: 10 * 1024 * 1024
} as const;

export type SheetRow = { row: number; cells: Record<string, string> }; // row = spreadsheet row, header = 1
export type Sheet = { file: string; header: string[]; rows: SheetRow[] };
export type BundleImage = { path: string; key: string; bytes: Uint8Array }; // key = profileKey(basename without extension)
export type ParsedBundle = {
	teams: Sheet | null;
	players: Sheet | null;
	logos: Record<LogoVariant, BundleImage[]>;
	portraits: BundleImage[];
	problems: ImportProblem[];
};

const invalid = (message: string) => new SaveError('invalid', message);
const SHEET = /^(teams|players)\.(csv|xlsx|ods)$/i;
const IMAGE = /\.(png|jpe?g|webp)$/i;
const IMAGE_DIRS = new Set(['team_logos', 'player_images']);
const isJunk = (name: string) =>
	name.endsWith('/') || name.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(name);
const isUnsafe = (name: string) =>
	name.startsWith('/') ||
	name.includes('\\') ||
	/^[a-z]:/i.test(name) ||
	name.split('/').includes('..');

function unzip(bytes: Uint8Array) {
	let count = 0;
	let total = 0;
	try {
		return unzipSync(bytes, {
			filter: ({ name, originalSize }) => {
				if (isUnsafe(name)) throw invalid(`The bundle contains an unsafe path: ${name}`);
				if (++count > BUNDLE_LIMITS.entries) throw invalid('The bundle has more than 500 files.');
				total += originalSize;
				if (total > BUNDLE_LIMITS.expandedBytes)
					throw invalid('The bundle unpacks to more than 100 MB.');
				return !isJunk(name);
			}
		});
	} catch (error) {
		throw error instanceof SaveError ? error : invalid('This file is not a valid zip.');
	}
}

function parseSheet(file: string, bytes: Uint8Array): Sheet {
	let rows: unknown[][];
	let offset = 0;
	try {
		const book = file.toLowerCase().endsWith('.csv')
			? XLSX.read(new TextDecoder().decode(bytes), { type: 'string', raw: true })
			: XLSX.read(bytes, { type: 'buffer' });
		const sheet = book.Sheets[book.SheetNames[0]];
		if (sheet['!ref']) offset = XLSX.utils.decode_range(sheet['!ref']).s.r;
		rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
			header: 1,
			raw: false,
			defval: '',
			blankrows: true
		});
	} catch {
		throw invalid(`Could not read ${file}.`);
	}
	const text = (value: unknown) => String(value ?? '').trim();
	const header = (rows[0] ?? []).map(text);
	const parsed: SheetRow[] = [];
	rows.slice(1).forEach((values, index) => {
		const cells: Record<string, string> = {};
		header.forEach((name, column) => {
			if (name) cells[name] = text(values[column]);
		});
		if (Object.values(cells).some(Boolean) || values.some((value) => text(value)))
			parsed.push({ row: index + 2 + offset, cells });
	});
	return { file, header, rows: parsed };
}

// Strips a single wrapper folder (e.g. `bundle/`); throws when sheets sit both inside and outside one.
function stripWrapper(names: string[]) {
	const split = names.map((name) => name.split('/'));
	const first = split[0]?.[0] ?? '';
	if (!IMAGE_DIRS.has(first.toLowerCase()) && split.every((s) => s.length > 1 && s[0] === first))
		return (name: string) => name.slice(first.length + 1);
	const sheetInFolder = split.some(
		(s) => s.length === 2 && !IMAGE_DIRS.has(s[0].toLowerCase()) && SHEET.test(s[1])
	);
	if (sheetInFolder)
		throw invalid(
			'Put the bundle files either at the top of the zip or inside one folder, not both.'
		);
	return (name: string) => name;
}

export function readBundle(bytes: Uint8Array): ParsedBundle {
	const files = unzip(bytes);
	const names = Object.keys(files);
	const relative = stripWrapper(names);
	const sheets: Record<'teams' | 'players', string[]> = { teams: [], players: [] };
	const found: Record<'teams' | 'players', Sheet | null> = { teams: null, players: null };
	const result: ParsedBundle = {
		teams: null,
		players: null,
		logos: { normal: [], white: [], black: [] },
		portraits: [],
		problems: []
	};

	for (const name of names) {
		const rel = relative(name);
		const sheet = SHEET.exec(rel);
		if (sheet) {
			sheets[sheet[1].toLowerCase() as 'teams' | 'players'].push(name);
			continue;
		}
		const segments = rel.split('/');
		const variant =
			segments[0].toLowerCase() === 'team_logos' &&
			segments.length === 3 &&
			segments[1].toLowerCase();
		const isPortrait = segments[0].toLowerCase() === 'player_images' && segments.length === 2;
		if (!isPortrait && !(variant && variant in result.logos)) continue;
		const base = segments[segments.length - 1];
		const problem = (message: string) =>
			result.problems.push({ level: 'error', file: name, row: null, field: null, message });
		if (!IMAGE.test(base)) problem('Use a PNG, JPEG, or WebP image.');
		else if (files[name].length > BUNDLE_LIMITS.imageBytes)
			problem('Images must be 10 MB or smaller.');
		else {
			const image = {
				path: name,
				key: profileKey(base.replace(/\.[^.]+$/, '')),
				bytes: files[name]
			};
			if (isPortrait) result.portraits.push(image);
			else result.logos[variant as LogoVariant].push(image);
		}
	}

	for (const kind of ['teams', 'players'] as const) {
		const paths = sheets[kind];
		if (paths.length > 1)
			throw invalid(
				`Use only one ${kind} file (found ${paths.map((path) => relative(path)).join(' and ')}).`
			);
		if (paths.length) found[kind] = parseSheet(relative(paths[0]), files[paths[0]]);
	}
	if (!found.teams && !found.players)
		throw invalid('The bundle needs a teams or players spreadsheet.');
	return { ...result, ...found };
}
