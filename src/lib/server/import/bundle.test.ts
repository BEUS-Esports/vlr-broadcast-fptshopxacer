import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { zipSync } from 'fflate';
import { BUNDLE_LIMITS, readBundle } from './bundle.ts';

const enc = (text: string) => new TextEncoder().encode(text);
const zip = (files: Record<string, Uint8Array>) => zipSync(files, { level: 0 });
const png = new Uint8Array([1, 2, 3]);

function workbook(rows: string[][], bookType: 'xlsx' | 'ods') {
	const book = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
	XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['ignored'], ['x']]), 'Sheet2');
	return new Uint8Array(XLSX.write(book, { type: 'buffer', bookType }));
}

const failure = (bytes: Uint8Array) => {
	try {
		readBundle(bytes);
	} catch (error) {
		return error as Error & { code?: string };
	}
	throw new Error('expected readBundle to throw');
};

describe('readBundle sheets', () => {
	it('parses CSV with BOM, CRLF, quoted commas and leading zeros', () => {
		const csv = '﻿team_name,team_tag\r\n"VNUHCM – University of Science, HCM",007\r\n';
		const { teams, players, problems } = readBundle(zip({ 'teams.csv': enc(csv) }));
		expect(teams?.file).toBe('teams.csv');
		expect(teams?.header).toEqual(['team_name', 'team_tag']);
		expect(teams?.rows[0]).toEqual({
			row: 2,
			cells: { team_name: 'VNUHCM – University of Science, HCM', team_tag: '007' }
		});
		expect(players).toBeNull();
		expect(problems).toEqual([]);
	});

	it('reads xlsx and ods like the CSV, first sheet only, skipping blank rows', () => {
		const rows = [
			['display_name', 'riot_id'],
			[' Rookie ', 'Rookie#USEC'],
			['', ''],
			['Ace', 'Ace#USEC']
		];
		const expected = [
			{ row: 2, cells: { display_name: 'Rookie', riot_id: 'Rookie#USEC' } },
			{ row: 4, cells: { display_name: 'Ace', riot_id: 'Ace#USEC' } }
		];
		for (const ext of ['xlsx', 'ods'] as const) {
			const { players } = readBundle(zip({ [`players.${ext}`]: workbook(rows, ext) }));
			expect(players?.header).toEqual(['display_name', 'riot_id']);
			expect(players?.rows).toEqual(expected);
		}
		const csv = 'display_name,riot_id\n Rookie ,Rookie#USEC\n,\nAce,Ace#USEC\n';
		expect(readBundle(zip({ 'Players.CSV': enc(csv) })).players?.rows).toEqual(expected);
	});

	it('treats one top-level folder like the root and ignores macOS junk', () => {
		const csv = enc('team_name,team_tag\nA,B\n');
		const bytes = zip({
			'bundle/teams.csv': csv,
			'bundle/team_logos/normal/B.png': png,
			'__MACOSX/bundle/._teams.csv': png,
			'bundle/.DS_Store': png
		});
		const parsed = readBundle(bytes);
		expect(parsed.teams?.rows).toHaveLength(1);
		expect(parsed.logos.normal.map((image) => image.key)).toEqual(['b']);
		expect(parsed.problems).toEqual([]);
	});

	it('rejects files at both the root and inside a folder', () => {
		const csv = enc('team_name,team_tag\nA,B\n');
		expect(failure(zip({ 'teams.csv': csv, 'bundle/players.csv': csv })).message).toBe(
			'Put the bundle files either at the top of the zip or inside one folder, not both.'
		);
	});

	it('rejects two files for the same sheet or none at all', () => {
		const csv = enc('a\n1\n');
		const both = failure(zip({ 'players.csv': csv, 'players.xlsx': csv }));
		expect(both.message).toBe('Use only one players file (found players.csv and players.xlsx).');
		expect(both.code).toBe('invalid');
		expect(failure(zip({ 'readme.txt': csv })).message).toBe(
			'The bundle needs a teams or players spreadsheet.'
		);
	});
});

describe('readBundle limits and safety', () => {
	it('rejects too many entries', () => {
		const files: Record<string, Uint8Array> = { 'teams.csv': enc('a\n1\n') };
		for (let index = 0; index < BUNDLE_LIMITS.entries; index++) files[`f/${index}.txt`] = png;
		expect(failure(zip(files)).message).toBe('The bundle has more than 500 files.');
	});

	it('rejects bundles that unpack too large', () => {
		const huge = new Uint8Array(101 * 1024 * 1024);
		const bytes = zipSync({ 'teams.csv': enc('a\n1\n'), 'big.bin': huge }, { level: 1 });
		expect(failure(bytes).message).toBe('The bundle unpacks to more than 100 MB.');
	});

	it('rejects unsafe paths', () => {
		const message = 'The bundle contains an unsafe path: ../evil.png';
		expect(failure(zip({ 'teams.csv': enc('a\n1\n'), '../evil.png': png })).message).toBe(message);
	});

	it('rejects non-zip bytes', () => {
		expect(failure(enc('definitely not a zip')).message).toBe('This file is not a valid zip.');
	});
});

describe('readBundle images', () => {
	it('sorts logos and portraits, matching extensions and keys loosely', () => {
		const bytes = zip({
			'teams.csv': enc('team_name,team_tag\nA,B\n'),
			'team_logos/white/USEC.png': png,
			'player_images/USECRookieNguyen#USEC.JPG': png,
			'notes/readme.txt': png
		});
		const parsed = readBundle(bytes);
		expect(parsed.logos.white).toEqual([
			{ path: 'team_logos/white/USEC.png', key: 'usec', bytes: png }
		]);
		expect(parsed.logos.normal).toEqual([]);
		expect(parsed.portraits.map((image) => image.key)).toEqual(['usecrookienguyen#usec']);
		expect(parsed.problems).toEqual([]);
	});

	it('reports unsupported and oversized images', () => {
		const big = new Uint8Array(BUNDLE_LIMITS.imageBytes + 1);
		const parsed = readBundle(
			zip({
				'teams.csv': enc('a\n1\n'),
				'player_images/x.gif': png,
				'team_logos/black/huge.png': big
			})
		);
		expect(parsed.portraits).toEqual([]);
		expect(parsed.logos.black).toEqual([]);
		expect(parsed.problems).toEqual([
			{
				level: 'error',
				file: 'player_images/x.gif',
				row: null,
				field: null,
				message: 'Use a PNG, JPEG, or WebP image.'
			},
			{
				level: 'error',
				file: 'team_logos/black/huge.png',
				row: null,
				field: null,
				message: 'Images must be 10 MB or smaller.'
			}
		]);
	});
});
