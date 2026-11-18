import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { hasDatabaseError } from './save-error';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

const ONE_HASH = 'Riot ID must contain exactly one #.';
const GAME = 'Riot ID game name must be 3–16 letters, digits, or spaces.';
const TAG = 'Riot ID tagline must be 3–5 letters or digits.';

describe('riotIdProblem', () => {
	it('accepts valid Riot IDs and gives exact messages for bad ones', async () => {
		await withManagementFixture(async () => {
			const { riotIdProblem } = await import('./profiles');
			for (const ok of ['USECRookieNguyen#USEC', 'Hide on bush#KR1', 'Thắng Nguyễn#VN2'])
				expect(riotIdProblem(ok)).toBeNull();
			expect(riotIdProblem('NoHash')).toBe(ONE_HASH);
			expect(riotIdProblem('a#b#c')).toBe(ONE_HASH);
			expect(riotIdProblem('ab#USEC')).toBe(GAME);
			expect(riotIdProblem('Bad_Name#USEC')).toBe(GAME);
			expect(riotIdProblem('ABCDEFGHIJKLMNOPQ#USEC')).toBe(GAME);
			expect(riotIdProblem('Name#AB')).toBe(TAG);
			expect(riotIdProblem('Name#ABCDEF')).toBe(TAG);
		});
	});
});

describe('saveTeam duplicates', () => {
	it('rejects case-insensitive name and tag clashes, archived included', async () => {
		await withManagementFixture(async ({ db }) => {
			const { saveTeam } = await import('./profiles');
			await expect(saveTeam({ name: 'team a', tag: 'Z' })).rejects.toMatchObject({
				name: 'SaveError',
				message: 'Team name "team a" is already used by team "Team A".'
			});
			await expect(saveTeam({ name: 'New', tag: ' b ' })).rejects.toMatchObject({
				message: 'Team tag "b" is already used by team "Team B".'
			});
			await db.update(s.teams).set({ archivedAt: new Date() }).where(eq(s.teams.id, 'team-c'));
			await expect(saveTeam({ name: 'TEAM C', tag: 'Q' })).rejects.toThrow(/\(archived\)\.$/);
		});
	});

	it('excludes itself when editing', async () => {
		await withManagementFixture(async () => {
			const { saveTeam } = await import('./profiles');
			const row = await saveTeam({ id: 'team-a', revision: 1, name: 'Team A', tag: 'A' });
			expect(row.revision).toBe(2);
		});
	});

	it('has a database backstop', async () => {
		await withManagementFixture(async ({ db }) => {
			// Drizzle wraps the driver error, so the SQLite message sits on the cause chain.
			const cause = await db
				.insert(s.teams)
				.values({ name: 'team a', tag: 'X' })
				.then(
					() => null,
					(error: unknown) => error
				);
			expect(hasDatabaseError(cause, 'UNIQUE constraint failed')).toBe(true);
		});
	});
});

describe('savePlayer duplicates and Riot ID', () => {
	it('rejects display name and Riot ID clashes', async () => {
		await withManagementFixture(async ({ db }) => {
			const { savePlayer } = await import('./profiles');
			await expect(
				savePlayer({ displayName: 'player A1', fullName: '', riotId: '' })
			).rejects.toMatchObject({
				message: 'Display name "player A1" is already used by player "Player a1".'
			});
			await db.update(s.players).set({ riotId: 'Taken Name#EUW' }).where(eq(s.players.id, 'a1'));
			await expect(
				savePlayer({ displayName: 'Fresh', fullName: '', riotId: 'taken name#euw' })
			).rejects.toMatchObject({
				message: 'Riot ID "taken name#euw" is already used by player "Player a1".'
			});
		});
	});

	it('checks Riot ID format on create and only when changed on edit', async () => {
		await withManagementFixture(async ({ db }) => {
			const { savePlayer } = await import('./profiles');
			await expect(
				savePlayer({ displayName: 'Fresh', fullName: '', riotId: 'bad' })
			).rejects.toMatchObject({ message: ONE_HASH });
			await db.update(s.players).set({ riotId: 'legacy' }).where(eq(s.players.id, 'a2'));
			const row = await savePlayer({
				id: 'a2',
				revision: 1,
				displayName: 'Player a2',
				fullName: 'New Full',
				riotId: 'legacy'
			});
			expect(row.fullName).toBe('New Full');
			await expect(
				savePlayer({
					id: 'a2',
					revision: 2,
					displayName: 'Player a2',
					fullName: '',
					riotId: 'stillbad'
				})
			).rejects.toMatchObject({ message: ONE_HASH });
		});
	});
});
