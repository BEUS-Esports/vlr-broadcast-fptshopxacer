import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import * as schema from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it('creates only matches with distinct entries from the active tournament and supported formats', () =>
	withManagementFixture(async ({ db }) => {
		const { createMatch } = await import('./matches');
		const input = {
			tournamentId: 't',
			teamAEntryId: 'entry-a',
			teamBEntryId: 'entry-b',
			label: '  Final  ',
			bestOf: 3
		};
		await expect(createMatch(input)).resolves.toMatchObject({
			label: 'Final',
			bestOf: 3,
			revision: 1
		});
		await expect(createMatch({ ...input, teamBEntryId: 'entry-a' })).rejects.toMatchObject({
			code: 'invalid'
		});
		await expect(createMatch({ ...input, teamBEntryId: 'missing' })).rejects.toMatchObject({
			code: 'invalid'
		});
		await expect(createMatch({ ...input, bestOf: 4 })).rejects.toMatchObject({ code: 'invalid' });
		await db
			.update(schema.tournaments)
			.set({ archivedAt: new Date() })
			.where(eq(schema.tournaments.id, 't'));
		await expect(createMatch(input)).rejects.toMatchObject({ code: 'blocked' });
	}));

it('saves label safely while format changes respect games, veto slots, and terminal results', () =>
	withManagementFixture(async ({ db }) => {
		const { saveMatchInfo } = await import('./matches');
		await db.insert(schema.games).values({ id: 'g3', matchId: 'match', number: 3, name: 'Game 3' });
		await expect(
			saveMatchInfo({ matchId: 'match', expectedRevision: 1, label: '  New  ', bestOf: 3 })
		).resolves.toMatchObject({ label: 'New', revision: 2 });
		await expect(
			saveMatchInfo({ matchId: 'match', expectedRevision: 1, label: 'Old', bestOf: 3 })
		).rejects.toMatchObject({ code: 'stale' });
		await expect(
			saveMatchInfo({ matchId: 'match', expectedRevision: 2, label: 'New', bestOf: 1 })
		).rejects.toMatchObject({ code: 'blocked' });
		await db.delete(schema.games).where(eq(schema.games.id, 'g3'));
		await db.insert(schema.matchVetoActions).values({
			matchId: 'match',
			sequence: 1,
			action: 'pick',
			mapId: 'map-1',
			gameNumber: 3,
			actingEntryId: 'entry-a'
		});
		await expect(
			saveMatchInfo({ matchId: 'match', expectedRevision: 2, label: 'New', bestOf: 1 })
		).rejects.toMatchObject({ code: 'blocked' });
		await db.delete(schema.matchVetoActions);
		await db.insert(schema.games).values({
			id: 'g1',
			matchId: 'match',
			number: 1,
			name: 'Game 1',
			mapId: 'map-1',
			scoreA: 13,
			scoreB: 9,
			resultType: 'normal',
			winnerEntryId: 'entry-a'
		});
		await expect(
			saveMatchInfo({ matchId: 'match', expectedRevision: 2, label: 'New', bestOf: 1 })
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(
			saveMatchInfo({ matchId: 'match', expectedRevision: 2, label: 'Result label', bestOf: 3 })
		).resolves.toMatchObject({ label: 'Result label' });
	}));

it('locks participants on even empty draft games, vetoes, and results', () =>
	withManagementFixture(async ({ db }) => {
		const { updateMatchParticipants } = await import('./matches');
		const edit = {
			matchId: 'match',
			expectedRevision: 1,
			teamAEntryId: 'entry-c',
			teamBEntryId: 'entry-b'
		};
		await db.insert(schema.games).values({ matchId: 'match', number: 1, name: 'Draft' });
		await expect(updateMatchParticipants(edit)).rejects.toMatchObject({ code: 'blocked' });
		await db.delete(schema.games);
		await db.insert(schema.matchVetoActions).values({
			matchId: 'match',
			sequence: 1,
			action: 'ban',
			mapId: 'map-1',
			actingEntryId: 'entry-a'
		});
		await expect(updateMatchParticipants(edit)).rejects.toMatchObject({ code: 'blocked' });
		await db.delete(schema.matchVetoActions);
		await db.update(schema.matches).set({ resultType: 'cancelled' });
		await expect(updateMatchParticipants(edit)).rejects.toMatchObject({ code: 'blocked' });
	}));

it('records administrative wins without game scores and clears back to the derived result', () =>
	withManagementFixture(async ({ db }) => {
		const { setMatchOutcome, clearMatchOutcome } = await import('./matches');
		await db.insert(schema.games).values({
			id: 'g1',
			matchId: 'match',
			number: 1,
			name: 'Game 1',
			mapId: 'map-1',
			scoreA: 13,
			scoreB: 9,
			resultType: 'normal',
			winnerEntryId: 'entry-a'
		});
		await expect(
			setMatchOutcome({
				matchId: 'match',
				expectedRevision: 1,
				resultType: 'forfeit',
				winnerEntryId: 'entry-c'
			})
		).rejects.toMatchObject({ code: 'invalid' });
		await expect(
			setMatchOutcome({
				matchId: 'match',
				expectedRevision: 1,
				resultType: 'forfeit',
				winnerEntryId: 'entry-b'
			})
		).resolves.toMatchObject({ resultType: 'forfeit', winnerEntryId: 'entry-b', revision: 2 });
		const [game] = await db.select().from(schema.games).where(eq(schema.games.id, 'g1'));
		expect([game.scoreA, game.scoreB]).toEqual([13, 9]);
		await expect(
			clearMatchOutcome({ matchId: 'match', expectedRevision: 2 })
		).resolves.toMatchObject({ resultType: null, winnerEntryId: null, revision: 3 });
	}));

it('deletes only an empty match at the current revision', () =>
	withManagementFixture(async ({ db }) => {
		const { deleteMatch } = await import('./matches');
		await db.insert(schema.games).values({ matchId: 'match', number: 1, name: 'Draft' });
		await expect(deleteMatch({ matchId: 'match', expectedRevision: 1 })).rejects.toMatchObject({
			code: 'blocked'
		});
		await db.delete(schema.games);
		await expect(deleteMatch({ matchId: 'match', expectedRevision: 2 })).rejects.toMatchObject({
			code: 'stale'
		});
		await expect(deleteMatch({ matchId: 'match', expectedRevision: 1 })).resolves.toBeUndefined();
	}));
