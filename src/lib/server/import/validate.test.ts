import { describe, expect, it } from 'vitest';
import type { ImportProblem } from '#lib/import/types.ts';
import { profileKey, riotIdProblem } from '#lib/server/services/profiles.ts';
import { BUNDLE_LIMITS, type BundleImage, type ParsedBundle, type Sheet } from './bundle.ts';
import { buildPreview, type ExistingProfiles } from './validate.ts';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const none: ExistingProfiles = { teams: [], players: [] };

const image = (path: string, bytes: Uint8Array = png): BundleImage => ({
	path,
	key: profileKey(
		path
			.split('/')
			.pop()!
			.replace(/\.[^.]+$/, '')
	),
	bytes
});
const teamSheet = (...rows: Array<[string, string]>): Sheet => ({
	file: 'teams.csv',
	header: ['team_name', 'team_tag'],
	rows: rows.map(([team_name, team_tag], i) => ({ row: i + 2, cells: { team_name, team_tag } }))
});
const playerSheet = (...rows: Array<[string, string, string]>): Sheet => ({
	file: 'players.csv',
	header: ['display_name', 'full_name', 'riot_id'],
	rows: rows.map(([display_name, full_name, riot_id], i) => ({
		row: i + 2,
		cells: { display_name, full_name, riot_id }
	}))
});
const bundle = (patch: Partial<ParsedBundle> = {}): ParsedBundle => ({
	teams: null,
	players: null,
	logos: { normal: [], white: [], black: [] },
	portraits: [],
	problems: [],
	...patch
});
const problems = (b: ParsedBundle, existing = none) => buildPreview(b, existing, 'h').problems;
const err = (file: string, row: number | null, field: string | null, message: string) =>
	({ level: 'error', file, row, field, message }) satisfies ImportProblem;

describe('buildPreview', () => {
	it('passes a clean bundle through with rows and logos filled', () => {
		const preview = buildPreview(
			bundle({
				teams: teamSheet(['University', 'USEC']),
				players: playerSheet(['Thang', '', 'Thắng#VN2']),
				logos: { normal: [image('team_logos/normal/USEC.png')], white: [], black: [] },
				portraits: [image('player_images/Thắng#VN2.png')]
			}),
			none,
			'abc'
		);
		expect(preview.problems).toEqual([]);
		expect(preview.hash).toBe('abc');
		expect(preview.teams).toEqual([
			{
				row: 2,
				name: 'University',
				tag: 'USEC',
				logos: { normal: 'team_logos/normal/USEC.png', white: null, black: null }
			}
		]);
		expect(preview.players[0]).toMatchObject({
			fullName: null,
			portrait: 'player_images/Thắng#VN2.png'
		});
		expect(preview.imageCount).toBe(2);
	});

	it('starts with the bundle problems', () => {
		const first = err('x.zip', null, null, 'Boom.');
		expect(problems(bundle({ problems: [first] }))[0]).toEqual(first);
	});

	it('reports missing and unknown columns and skips the rows', () => {
		const sheet: Sheet = {
			file: 'players.csv',
			header: ['display_name', 'full_name', 'riotid'],
			rows: [{ row: 2, cells: { display_name: '', full_name: '', riotid: '' } }]
		};
		const preview = buildPreview(bundle({ players: sheet }), none, 'h');
		expect(preview.problems).toEqual([
			err('players.csv', 1, 'riot_id', 'Missing column riot_id.'),
			err('players.csv', 1, 'riotid', 'Unknown column riotid.')
		]);
		expect(preview.players).toEqual([]);
	});

	it('reports every field problem on a row', () => {
		const b = bundle({
			teams: teamSheet(['', 'x'.repeat(21)]),
			players: playerSheet(
				['', 'y'.repeat(151), ''],
				['Ok', '', 'bad'],
				['Long', '', 'a'.repeat(101)]
			)
		});
		expect(problems(b)).toEqual([
			err('teams.csv', 2, 'team_name', 'Team name must be 1–100 characters.'),
			err('teams.csv', 2, 'team_tag', 'Team tag must be 1–20 characters.'),
			err('players.csv', 2, 'display_name', 'Display name must be 1–100 characters.'),
			err('players.csv', 2, 'full_name', 'Full name must be at most 150 characters.'),
			err('players.csv', 2, 'riot_id', 'Riot ID is required.'),
			err('players.csv', 3, 'riot_id', riotIdProblem('bad')!),
			err('players.csv', 4, 'riot_id', 'Riot ID must be at most 100 characters.')
		]);
	});

	it('flags in-bundle duplicates by case and whitespace', () => {
		const b = bundle({
			teams: teamSheet(['Alpha', 'USEC'], [' alpha ', 'usec']),
			players: playerSheet(['Neo', '', 'Neo#VN1'], [' NEO', '', ' neo#VN1 '])
		});
		expect(problems(b)).toEqual([
			err('teams.csv', 3, 'team_name', 'Duplicates row 2.'),
			err('teams.csv', 3, 'team_tag', 'Duplicates row 2.'),
			err('players.csv', 3, 'display_name', 'Duplicates row 2.'),
			err('players.csv', 3, 'riot_id', 'Duplicates row 2.')
		]);
	});

	it('flags clashes with existing profiles, naming archived owners', () => {
		const existing: ExistingProfiles = {
			teams: [{ name: 'Old', tag: 'USEC', archivedAt: new Date() }],
			players: [{ displayName: 'Neo', riotId: 'Neo#VN1', archivedAt: null }]
		};
		const b = bundle({
			teams: teamSheet(['Fresh', 'USEC'], ['old', 'NEW']),
			players: playerSheet(['neo', '', 'neo#vn1'])
		});
		expect(problems(b, existing)).toEqual([
			err('teams.csv', 2, 'team_tag', 'Team tag "USEC" is already used by team "Old" (archived).'),
			err('teams.csv', 3, 'team_name', 'Team name "old" is already used by team "Old" (archived).'),
			err('players.csv', 2, 'display_name', 'Display name "neo" is already used by player "Neo".'),
			err('players.csv', 2, 'riot_id', 'Riot ID "neo#vn1" is already used by player "Neo".')
		]);
	});

	it('matches an NFD portrait filename to an NFC Riot ID', () => {
		const portrait = image(`player_images/${'Thắng#VN2'.normalize('NFD')}.png`);
		const preview = buildPreview(
			bundle({ players: playerSheet(['Thang', '', 'Thắng#VN2']), portraits: [portrait] }),
			none,
			'h'
		);
		expect(preview.problems).toEqual([]);
		expect(preview.players[0].portrait).toBe(portrait.path);
	});

	it('matches logos per variant and warns about unmatched images', () => {
		const b = bundle({
			teams: teamSheet(['Alpha', 'USEC']),
			players: playerSheet(['Neo', '', 'Neo#VN1']),
			logos: {
				normal: [image('team_logos/normal/USEC.png'), image('team_logos/normal/NOPE.png')],
				white: [],
				black: [image('team_logos/black/usec.png')]
			},
			portraits: [image('player_images/ghost.png')]
		});
		const preview = buildPreview(b, none, 'h');
		expect(preview.teams[0].logos).toEqual({
			normal: 'team_logos/normal/USEC.png',
			white: null,
			black: 'team_logos/black/usec.png'
		});
		expect(preview.imageCount).toBe(2);
		expect(preview.problems).toEqual([
			{
				level: 'warning',
				file: 'team_logos/normal/NOPE.png',
				row: null,
				field: null,
				message: 'Matched no team.'
			},
			{
				level: 'warning',
				file: 'player_images/ghost.png',
				row: null,
				field: null,
				message: 'Matched no player.'
			}
		]);
	});

	it('errors on both images that fill the same slot', () => {
		const b = bundle({
			teams: teamSheet(['Alpha', 'USEC']),
			logos: {
				normal: [image('team_logos/normal/USEC.png'), image('team_logos/normal/usec.jpg')],
				white: [],
				black: []
			}
		});
		const preview = buildPreview(b, none, 'h');
		expect(preview.problems).toEqual([
			err('team_logos/normal/USEC.png', null, null, 'Another image fills the same slot.'),
			err('team_logos/normal/usec.jpg', null, null, 'Another image fills the same slot.')
		]);
		expect(preview.teams[0].logos.normal).toBeNull();
	});

	it('rejects images that are not images or are too large, without a matched-no warning', () => {
		const huge = new Uint8Array(BUNDLE_LIMITS.imageBytes + 1);
		huge.set(png);
		const b = bundle({
			teams: teamSheet(['Alpha', 'USEC']),
			logos: {
				normal: [
					image('team_logos/normal/USEC.png', new TextEncoder().encode('not an image')),
					image('team_logos/normal/BIG.png', huge)
				],
				white: [],
				black: []
			}
		});
		const preview = buildPreview(b, none, 'h');
		expect(preview.problems).toEqual([
			err('team_logos/normal/USEC.png', null, null, 'Use a PNG, JPEG, or WebP image.'),
			err('team_logos/normal/BIG.png', null, null, 'Images must be 10 MB or smaller.')
		]);
		expect(preview.imageCount).toBe(0);
	});
});
