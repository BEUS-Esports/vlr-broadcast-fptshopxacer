import { expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { join } from 'node:path';
import * as s from '#lib/server/db/schema/index.ts';
import type { NormalizedPostGameReport } from '#lib/post-game/types.ts';
import {
	withManagementFixture,
	withTwoConnections,
	type ManagementFixture
} from '#lib/server/testing/management-fixture.ts';

export function report(): NormalizedPostGameReport {
	return {
		provider: 'henrikdev',
		externalMatchId: 'report-1',
		startedAt: null,
		completed: true,
		map: { externalId: null, name: 'map-1' },
		teams: [
			{ key: 'red', score: 13, won: true },
			{ key: 'blue', score: 7, won: false }
		],
		players: ['a', 'b'].flatMap((team) =>
			Array.from({ length: 5 }, (_, i) => ({
				externalPlayerId: `${team}${i + 1}`,
				riotId: `${team}${i + 1}#tag`,
				teamKey: team === 'a' ? 'red' : 'blue',
				agentExternalId: null,
				agentName: 'Jett',
				kills: 10,
				deaths: 7,
				assists: 0,
				performanceScore: null,
				trades: null,
				firstBloods: 0,
				plants: 0,
				defuses: null
			}))
		)
	};
}

export async function prepare({ db }: ManagementFixture) {
	await db
		.insert(s.games)
		.values({ id: 'g', matchId: 'match', number: 1, name: 'One', mapId: 'map-1' });
	await db.insert(s.agents).values({ id: 'jett', key: 'jett', displayName: 'Jett' });
	for (const player of report().players)
		await db
			.update(s.players)
			.set({ riotId: player.riotId })
			.where(eq(s.players.id, player.externalPlayerId!));
	await db.insert(s.gameLineups).values(
		['a', 'b'].flatMap((team) =>
			Array.from({ length: 5 }, (_, i) => ({
				gameId: 'g',
				entryId: `entry-${team}`,
				slot: i + 1,
				playerId: `${team}${i + 1}`
			}))
		)
	);
}

it('previews ten exact Riot ID mappings and imports canonical data without changing results', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const { createPostGameReview, importPostGameReport, discardGamePlayerStatistics } =
			await import('./review');
		const review = await createPostGameReview({
			gameId: 'g',
			expectedGameRevision: 1,
			report: report()
		});
		expect(review.canConfirm).toBe(true);
		expect(review.players).toHaveLength(10);
		expect(review.players.every((row) => row.mappingState === 'exact')).toBe(true);
		expect(review.players[0]).toMatchObject({
			playerId: 'a1',
			current: { kills: null },
			proposed: { kills: 10 },
			availability: { kills: true, performanceScore: false }
		});
		await expect(
			importPostGameReport({
				token: review.token,
				gameId: 'g',
				expectedGameRevision: 1,
				resolutions: { a1: { statistics: 'use-provider' } }
			})
		).rejects.toMatchObject({ code: 'invalid' });
		const saved = await importPostGameReport({
			token: review.token,
			gameId: 'g',
			expectedGameRevision: 1
		});
		expect(saved.gameRevision).toBe(2);
		expect(await fixture.db.select().from(s.gamePlayerStatistics)).toHaveLength(10);
		expect((await fixture.db.select().from(s.games))[0]).toMatchObject({
			scoreA: null,
			scoreB: null,
			resultType: null,
			mvpPlayerId: null
		});
		expect((await fixture.db.select().from(s.gameLineups))[0].agentId).toBe('jett');
		await expect(
			discardGamePlayerStatistics({
				gameId: 'g',
				expectedGameRevision: 2,
				playerId: 'a1',
				confirmation: true
			})
		).rejects.toMatchObject({ code: 'blocked' });
		expect((await fixture.db.select().from(s.games))[0].revision).toBe(2);
		const again = await createPostGameReview({
			gameId: 'g',
			expectedGameRevision: 2,
			report: report()
		});
		expect(again.canConfirm).toBe(true);
		expect(
			(await importPostGameReport({ token: again.token, gameId: 'g', expectedGameRevision: 2 }))
				.gameRevision
		).toBe(3);
		expect(await fixture.db.select().from(s.gamePlayerStatistics)).toHaveLength(10);
	});
});

it('blocks contradictory provider agent id and name evidence', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		await fixture.db.insert(s.agents).values({
			id: 'sage',
			key: 'sage',
			displayName: 'Sage',
			valorantApiUuid: 'sage-uuid'
		});
		await fixture.db
			.update(s.agents)
			.set({ valorantApiUuid: 'jett-uuid' })
			.where(eq(s.agents.id, 'jett'));
		const data = report();
		data.players[0].agentExternalId = 'jett-uuid';
		data.players[0].agentName = 'Sage';
		const { createPostGameReview } = await import('./review');
		const review = await createPostGameReview({
			gameId: 'g',
			expectedGameRevision: 1,
			report: data
		});
		expect(review.canConfirm).toBe(false);
		expect(review.validation).toContain(
			'Provider player 1 has contradictory agent identity evidence.'
		);
	});
});

it('requires manual mappings for missing or renamed IDs and blocks contradictory identity and map evidence', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const { createPostGameReview, revisePostGameReview } = await import('./review');
		for (const riotId of [null, 'renamed#tag']) {
			const data = report();
			data.players[0].riotId = riotId;
			const review = await createPostGameReview({
				gameId: 'g',
				expectedGameRevision: 1,
				report: data
			});
			expect(review.canConfirm).toBe(false);
			const mapped = await revisePostGameReview({
				token: review.token,
				gameId: 'g',
				mappings: { 0: 'a1' }
			});
			expect(mapped.canConfirm).toBe(true);
			expect(mapped.players[0].mappingState).toBe('manual');
		}
		for (const mutate of [
			(data: NormalizedPostGameReport) => {
				data.players[0].riotId = data.players[1].riotId;
			},
			(data: NormalizedPostGameReport) => {
				data.map.name = 'map-2';
			},
			(data: NormalizedPostGameReport) => {
				data.players[0].teamKey = 'blue';
			}
		]) {
			const data = report();
			mutate(data);
			const review = await createPostGameReview({
				gameId: 'g',
				expectedGameRevision: 1,
				report: data,
				mappings: { 0: 'a1' }
			});
			expect(review.canConfirm).toBe(false);
			expect(review.validation.length).toBeGreaterThan(0);
		}
		const reversed = report();
		reversed.teams.reverse();
		expect(
			(await createPostGameReview({ gameId: 'g', expectedGameRevision: 1, report: reversed }))
				.canConfirm
		).toBe(true);
		await fixture.db
			.update(s.games)
			.set({ resultType: 'normal', winnerEntryId: 'entry-a', scoreA: 13, scoreB: 9 })
			.where(eq(s.games.id, 'g'));
		expect(
			(await createPostGameReview({ gameId: 'g', expectedGameRevision: 1, report: report() }))
				.canConfirm
		).toBe(false);
	});
});

it('preserves manual statistics and agent ownership through later reimports until explicitly replaced', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const { createPostGameReview: review, importPostGameReport: apply } = await import('./review');
		const first = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		await apply({ token: first.token, gameId: 'g', expectedGameRevision: 1 });
		const { saveGameStatistics } = await import('../services/statistics');
		const { saveGameAgents } = await import('../services/lineups');
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 2,
			players: [{ playerId: 'a1', entryId: 'entry-a', ...report().players[0], kills: 99 }]
		});
		await saveGameAgents({
			gameId: 'g',
			expectedGameRevision: 3,
			players: report().players.map((p) => ({
				playerId: p.externalPlayerId!,
				entryId: p.teamKey === 'red' ? 'entry-a' : 'entry-b',
				agentId: p.externalPlayerId === 'a2' ? null : 'jett'
			}))
		});
		for (const revision of [4, 5]) {
			const preview = await review({
				gameId: 'g',
				expectedGameRevision: revision,
				report: report()
			});
			expect(preview.players[0].conflicts).toEqual({ statistics: true, agent: false });
			expect(preview.players[1].conflicts).toEqual({ statistics: false, agent: true });
			await apply({
				token: preview.token,
				gameId: 'g',
				expectedGameRevision: revision,
				resolutions: { a1: { statistics: 'keep-local' }, a2: { agent: 'keep-local' } }
			});
		}
		const preview = await review({ gameId: 'g', expectedGameRevision: 6, report: report() });
		await apply({
			token: preview.token,
			gameId: 'g',
			expectedGameRevision: 6,
			resolutions: { a1: { statistics: 'use-provider' }, a2: { agent: 'use-provider' } }
		});
		const clean = await review({ gameId: 'g', expectedGameRevision: 7, report: report() });
		expect(clean.canConfirm).toBe(true);
		const rows = await fixture.db.select().from(s.gamePlayerStatistics);
		expect(rows.find((row) => row.playerId === 'a1')).toMatchObject({
			kills: 10,
			statisticsManualOverride: false
		});
		expect(rows.find((row) => row.playerId === 'a2')).toMatchObject({
			manuallyEditedAt: null,
			agentManualOverride: false
		});
		expect(rows.find((row) => row.playerId === 'a2')!.agentManuallyEditedAt).toBeInstanceOf(Date);
	});
});

it('requires explicit first-import null and replacement resolutions and rejects unreviewed mappings', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		await fixture.db
			.insert(s.gamePlayerStatistics)
			.values({ gameId: 'g', playerId: 'a1', entryId: 'entry-a', performanceScore: 200 });
		const { createPostGameReview: review, importPostGameReport: apply } = await import('./review');
		const first = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		expect(first.players[0].conflicts.statistics).toBe(true);
		await expect(
			apply({ token: first.token, gameId: 'g', expectedGameRevision: 1 })
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(
			apply({ token: first.token, gameId: 'g', expectedGameRevision: 1, mappings: { 0: 'a2' } })
		).rejects.toMatchObject({ code: 'stale' });
		await apply({
			token: first.token,
			gameId: 'g',
			expectedGameRevision: 1,
			resolutions: { a1: { statistics: 'keep-local' } }
		});
		const data = report();
		data.externalMatchId = 'report-2';
		const replacement = await review({ gameId: 'g', expectedGameRevision: 2, report: data });
		expect(replacement.replacement).toBe(true);
		await expect(
			apply({ token: replacement.token, gameId: 'g', expectedGameRevision: 2 })
		).rejects.toMatchObject({ code: 'blocked' });
		await apply({
			token: replacement.token,
			gameId: 'g',
			expectedGameRevision: 2,
			confirmReplacement: true,
			resolutions: { a1: { statistics: 'keep-local' } }
		});
		expect(
			(
				await fixture.db
					.select()
					.from(s.gamePlayerStatistics)
					.where(eq(s.gamePlayerStatistics.playerId, 'a1'))
			)[0].performanceScore
		).toBe(200);
	});
});

it('rolls back partial import and rejects stale reviews including profile/resource changes without a game edit', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const { createPostGameReview, importPostGameReport } = await import('./review');
		const review = await createPostGameReview({
			gameId: 'g',
			expectedGameRevision: 1,
			report: report()
		});
		await fixture.client.execute(
			"CREATE TRIGGER reject_import BEFORE INSERT ON game_player_statistics WHEN NEW.player_id = 'a2' BEGIN SELECT RAISE(ABORT, 'import failure'); END"
		);
		await expect(
			importPostGameReport({ token: review.token, gameId: 'g', expectedGameRevision: 1 })
		).rejects.toThrow();
		expect(await fixture.db.select().from(s.gamePlayerStatistics)).toHaveLength(0);
		expect((await fixture.db.select().from(s.gameLineups))[0].agentId).toBeNull();
		expect((await fixture.db.select().from(s.games))[0].revision).toBe(1);
		await fixture.client.execute('DROP TRIGGER reject_import');
		await fixture.db.update(s.players).set({ riotId: 'new#tag' }).where(eq(s.players.id, 'a1'));
		await expect(
			importPostGameReport({ token: review.token, gameId: 'g', expectedGameRevision: 1 })
		).rejects.toMatchObject({ code: 'stale' });
		expect((await fixture.db.select().from(s.games))[0].revision).toBe(1);
	});
});

it('retains imported all-null rows and discards only one confirmed player transactionally', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const { createPostGameReview, importPostGameReport, discardGamePlayerStatistics } =
			await import('./review');
		const data = report();
		for (const field of s.statisticFields) data.players[0][field] = null;
		const review = await createPostGameReview({
			gameId: 'g',
			expectedGameRevision: 1,
			report: data
		});
		await importPostGameReport({ token: review.token, gameId: 'g', expectedGameRevision: 1 });
		const selected = and(
			eq(s.gamePlayerStatistics.gameId, 'g'),
			eq(s.gamePlayerStatistics.playerId, 'a1')
		);
		expect(await fixture.db.select().from(s.gamePlayerStatistics).where(selected)).toHaveLength(1);
		await expect(
			discardGamePlayerStatistics({
				gameId: 'g',
				expectedGameRevision: 2,
				playerId: 'a1',
				confirmation: false
			})
		).rejects.toMatchObject({ code: 'invalid' });
		await fixture.client.execute(
			"CREATE TRIGGER reject_discard BEFORE DELETE ON game_player_statistics BEGIN SELECT RAISE(ABORT, 'discard failure'); END"
		);
		await expect(
			discardGamePlayerStatistics({
				gameId: 'g',
				expectedGameRevision: 2,
				playerId: 'a1',
				confirmation: true
			})
		).rejects.toThrow();
		expect(await fixture.db.select().from(s.gamePlayerStatistics).where(selected)).toHaveLength(1);
		await fixture.client.execute('DROP TRIGGER reject_discard');
		await expect(
			discardGamePlayerStatistics({
				gameId: 'g',
				expectedGameRevision: 1,
				playerId: 'a1',
				confirmation: true
			})
		).rejects.toMatchObject({ code: 'stale' });
		await discardGamePlayerStatistics({
			gameId: 'g',
			expectedGameRevision: 2,
			playerId: 'a1',
			confirmation: true
		});
		expect(await fixture.db.select().from(s.gamePlayerStatistics)).toHaveLength(9);
		expect(await fixture.db.select().from(s.gameLineups)).toHaveLength(10);
		expect((await fixture.db.select().from(s.gameStatisticsMeta))[0].externalMatchId).toBe(
			'report-1'
		);
		const { replaceGameLineups } = await import('../services/lineups');
		const teams = ['a', 'b'].map((team) => ({
			entryId: `entry-${team}`,
			slots: Array.from({ length: 5 }, (_, i) => ({ slot: i + 1, playerId: `${team}${i + 1}` }))
		}));
		teams[0].slots[0].playerId = 'a6';
		await replaceGameLineups({ gameId: 'g', expectedGameRevision: 3, teams });
		const corrected = await createPostGameReview({
			gameId: 'g',
			expectedGameRevision: 4,
			report: data
		});
		expect(corrected.players[0].mappingState).toBe('unresolved');
		expect(corrected.canConfirm).toBe(false);
	});
});

it('retains ownership when a provider temporarily agrees with an existing manual correction', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		await fixture.db.insert(s.gamePlayerStatistics).values({
			gameId: 'g',
			playerId: 'a1',
			entryId: 'entry-a',
			...Object.fromEntries(s.statisticFields.map((field) => [field, report().players[0][field]])),
			manuallyEditedAt: new Date()
		});
		await fixture.db
			.update(s.gameLineups)
			.set({ agentId: 'jett' })
			.where(eq(s.gameLineups.playerId, 'a1'));
		const { createPostGameReview: review, importPostGameReport: apply } = await import('./review');
		const first = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		expect(first.canConfirm).toBe(true);
		await apply({ token: first.token, gameId: 'g', expectedGameRevision: 1 });
		const agrees = await review({ gameId: 'g', expectedGameRevision: 2, report: report() });
		await apply({ token: agrees.token, gameId: 'g', expectedGameRevision: 2 });
		const changed = report();
		changed.players[0].kills = 12;
		changed.players[0].agentName = null;
		const later = await review({ gameId: 'g', expectedGameRevision: 3, report: changed });
		expect(later.players[0].conflicts).toEqual({ statistics: true, agent: true });
		expect(
			(
				await fixture.db
					.select()
					.from(s.gamePlayerStatistics)
					.where(eq(s.gamePlayerStatistics.playerId, 'a1'))
			)[0]
		).toMatchObject({ statisticsManualOverride: true, agentManualOverride: true });
	});
});

it('fills blank metrics beside an agreeing manual value on first import without a conflict', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		await fixture.db.insert(s.gamePlayerStatistics).values({
			gameId: 'g',
			playerId: 'a1',
			entryId: 'entry-a',
			kills: 10,
			manuallyEditedAt: new Date()
		});
		const { createPostGameReview: review, importPostGameReport: apply } = await import('./review');
		const first = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		expect(first.players[0].conflicts.statistics).toBe(false);
		expect(first.canConfirm).toBe(true);
		await apply({ token: first.token, gameId: 'g', expectedGameRevision: 1 });
		expect(
			(
				await fixture.db
					.select()
					.from(s.gamePlayerStatistics)
					.where(eq(s.gamePlayerStatistics.playerId, 'a1'))
			)[0]
		).toMatchObject({
			kills: 10,
			deaths: 7,
			assists: 0,
			performanceScore: null,
			statisticsManualOverride: true
		});
		const changed = report();
		changed.players[0].kills = 11;
		const next = await review({ gameId: 'g', expectedGameRevision: 2, report: changed });
		expect(next.players[0].conflicts.statistics).toBe(true);
		await expect(
			apply({ token: next.token, gameId: 'g', expectedGameRevision: 2 })
		).rejects.toMatchObject({ code: 'blocked' });
	});
});

it('keeps manual known values when provider null later becomes available', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		await fixture.db.insert(s.gamePlayerStatistics).values({
			gameId: 'g',
			playerId: 'a1',
			entryId: 'entry-a',
			kills: 10,
			performanceScore: 321
		});
		const { createPostGameReview: review, importPostGameReport: apply } = await import('./review');
		const first = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		await apply({
			token: first.token,
			gameId: 'g',
			expectedGameRevision: 1,
			resolutions: { a1: { statistics: 'keep-local' } }
		});
		const available = report();
		available.players[0].performanceScore = 300;
		const later = await review({ gameId: 'g', expectedGameRevision: 2, report: available });
		expect(later.players[0].conflicts.statistics).toBe(true);
		await apply({
			token: later.token,
			gameId: 'g',
			expectedGameRevision: 2,
			resolutions: { a1: { statistics: 'keep-local' } }
		});
		expect(
			(
				await fixture.db
					.select()
					.from(s.gamePlayerStatistics)
					.where(eq(s.gamePlayerStatistics.playerId, 'a1'))
			)[0].performanceScore
		).toBe(321);
	});
});

it('binds server reports, route game, approved mapping and expiring single-use review tokens', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const {
			createPostGameReview: review,
			revisePostGameReview: revise,
			importPostGameReport: apply
		} = await import('./review');
		const data = report();
		const first = await review({ gameId: 'g', expectedGameRevision: 1, report: data });
		data.players[0].kills = 999;
		await expect(
			apply({ token: first.token, gameId: 'other', expectedGameRevision: 1 })
		).rejects.toMatchObject({ code: 'stale' });
		await expect(
			revise({ token: first.token, gameId: 'other', mappings: {} })
		).rejects.toMatchObject({ code: 'stale' });
		await apply({ token: first.token, gameId: 'g', expectedGameRevision: 1 });
		expect(
			(
				await fixture.db
					.select()
					.from(s.gamePlayerStatistics)
					.where(eq(s.gamePlayerStatistics.playerId, 'a1'))
			)[0].kills
		).toBe(10);
		await expect(
			apply({ token: first.token, gameId: 'g', expectedGameRevision: 2 })
		).rejects.toMatchObject({ code: 'stale' });
		const invalidated = await review({ gameId: 'g', expectedGameRevision: 2, report: report() });
		await expect(
			revise({ token: invalidated.token, gameId: 'g', mappings: { 10: 'a1' } })
		).rejects.toMatchObject({ code: 'invalid' });
		await expect(
			apply({ token: invalidated.token, gameId: 'g', expectedGameRevision: 2 })
		).rejects.toMatchObject({ code: 'stale' });
		const expired = await review({ gameId: 'g', expectedGameRevision: 2, report: report() });
		const now = Date.now();
		const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000);
		try {
			await expect(
				apply({ token: expired.token, gameId: 'g', expectedGameRevision: 2 })
			).rejects.toMatchObject({ code: 'stale' });
		} finally {
			clock.mockRestore();
		}
	});
});

it('rejects duplicate association at both DB and command and stale edits made by another connection', async () => {
	await withTwoConnections(async (fixture) => {
		await prepare(fixture);
		await fixture.db.insert(s.games).values({ id: 'g2', matchId: 'match', number: 2, name: 'Two' });
		const { createPostGameReview, importPostGameReport } = await import('./review');
		const review = await createPostGameReview({
			gameId: 'g',
			expectedGameRevision: 1,
			report: report()
		});
		await fixture.secondDb.insert(s.gameStatisticsMeta).values({
			gameId: 'g2',
			importSource: 'henrikdev',
			externalMatchId: 'report-1',
			importedAt: new Date()
		});
		await expect(
			importPostGameReport({ token: review.token, gameId: 'g', expectedGameRevision: 1 })
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(
			fixture.db
				.insert(s.gameStatisticsMeta)
				.values({ gameId: 'g', importSource: 'henrikdev', externalMatchId: 'report-1' })
		).rejects.toThrow();
		await fixture.secondDb
			.delete(s.gameStatisticsMeta)
			.where(eq(s.gameStatisticsMeta.gameId, 'g2'));
		await fixture.secondDb.update(s.games).set({ revision: 2 }).where(eq(s.games.id, 'g'));
		await expect(
			importPostGameReport({ token: review.token, gameId: 'g', expectedGameRevision: 1 })
		).rejects.toMatchObject({ code: 'stale' });
		expect(await fixture.db.select().from(s.gamePlayerStatistics)).toHaveLength(0);
	});
});

it('matches exact resource UUIDs, permits substitute lineups and blocks duplicate local identities', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		await fixture.db
			.update(s.maps)
			.set({ valorantApiUuid: 'uuid-map' })
			.where(eq(s.maps.id, 'map-1'));
		await fixture.db
			.update(s.agents)
			.set({ valorantApiUuid: 'uuid-agent' })
			.where(eq(s.agents.id, 'jett'));
		await fixture.db.update(s.players).set({ riotId: 'sub#tag' }).where(eq(s.players.id, 'a6'));
		await fixture.db
			.update(s.gameLineups)
			.set({ playerId: 'a6' })
			.where(eq(s.gameLineups.playerId, 'a1'));
		const { createPostGameReview } = await import('./review');
		const data = report();
		data.players[0].riotId = ' SUB # TAG ';
		data.players[0].externalPlayerId = 'a6';
		data.map.externalId = 'UUID-MAP';
		data.map.name = 'translated';
		data.players.forEach((row) => {
			row.agentExternalId = 'UUID-AGENT';
			row.agentName = 'translated';
		});
		expect(
			(await createPostGameReview({ gameId: 'g', expectedGameRevision: 1, report: data }))
				.canConfirm
		).toBe(true);
		data.map.externalId = 'wrong-map';
		data.map.name = 'map-1';
		expect(
			(await createPostGameReview({ gameId: 'g', expectedGameRevision: 1, report: data }))
				.canConfirm
		).toBe(false);
		data.map.externalId = 'uuid-map';
		await fixture.db.update(s.players).set({ riotId: 'sub#tag' }).where(eq(s.players.id, 'a2'));
		expect(
			(
				await createPostGameReview({
					gameId: 'g',
					expectedGameRevision: 1,
					report: data,
					mappings: { 0: 'a6', 1: 'a2' }
				})
			).canConfirm
		).toBe(false);
	});
});

it('makes same-millisecond manual edits monotonic and blocks archived writes', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const {
			createPostGameReview: review,
			importPostGameReport: apply,
			discardGamePlayerStatistics
		} = await import('./review');
		const first = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		await apply({ token: first.token, gameId: 'g', expectedGameRevision: 1 });
		const importedAt = (await fixture.db.select().from(s.gameStatisticsMeta))[0].importedAt!;
		const { saveGameStatistics } = await import('../services/statistics');
		const { saveGameAgents } = await import('../services/lineups');
		const clock = vi.spyOn(Date, 'now').mockReturnValue(importedAt.getTime());
		try {
			await saveGameStatistics({
				gameId: 'g',
				expectedGameRevision: 2,
				players: [{ playerId: 'a1', entryId: 'entry-a', ...report().players[0], kills: 99 }]
			});
			await saveGameAgents({
				gameId: 'g',
				expectedGameRevision: 3,
				players: report().players.map((p) => ({
					playerId: p.externalPlayerId!,
					entryId: p.teamKey === 'red' ? 'entry-a' : 'entry-b',
					agentId: null
				}))
			});
		} finally {
			clock.mockRestore();
		}
		const saved = (
			await fixture.db
				.select()
				.from(s.gamePlayerStatistics)
				.where(eq(s.gamePlayerStatistics.playerId, 'a1'))
		)[0];
		expect(saved.manuallyEditedAt!.getTime()).toBeGreaterThan(importedAt.getTime());
		expect(saved.agentManuallyEditedAt!.getTime()).toBeGreaterThan(importedAt.getTime());
		const preview = await review({ gameId: 'g', expectedGameRevision: 4, report: report() });
		await fixture.db
			.update(s.tournaments)
			.set({ archivedAt: new Date() })
			.where(eq(s.tournaments.id, 't'));
		await expect(
			apply({ token: preview.token, gameId: 'g', expectedGameRevision: 4 })
		).rejects.toMatchObject({ code: 'blocked' });
		await expect(
			discardGamePlayerStatistics({
				gameId: 'g',
				expectedGameRevision: 4,
				playerId: 'a1',
				confirmation: true
			})
		).rejects.toMatchObject({ code: 'blocked' });
		expect((await fixture.db.select().from(s.games))[0].revision).toBe(4);
	});
});

it('rejects resource and manual changes after review and rolls back agent provenance writes', async () => {
	await withTwoConnections(async (fixture) => {
		await prepare(fixture);
		const { createPostGameReview: review, importPostGameReport: apply } = await import('./review');
		const initial = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		await fixture.secondDb.update(s.agents).set({ isActive: false }).where(eq(s.agents.id, 'jett'));
		await expect(
			apply({ token: initial.token, gameId: 'g', expectedGameRevision: 1 })
		).rejects.toMatchObject({ code: 'stale' });
		await fixture.secondDb.update(s.agents).set({ isActive: true }).where(eq(s.agents.id, 'jett'));
		const current = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		await apply({ token: current.token, gameId: 'g', expectedGameRevision: 1 });
		const next = await review({ gameId: 'g', expectedGameRevision: 2, report: report() });
		const { saveGameStatistics } = await import('../services/statistics');
		await saveGameStatistics({
			gameId: 'g',
			expectedGameRevision: 2,
			players: [{ ...report().players[0], playerId: 'a1', entryId: 'entry-a', kills: 98 }]
		});
		await expect(
			apply({ token: next.token, gameId: 'g', expectedGameRevision: 2 })
		).rejects.toMatchObject({ code: 'stale' });
		const { saveGameAgents } = await import('../services/lineups');
		const before = await fixture.db.select().from(s.gamePlayerStatistics);
		await fixture.client.execute(
			"CREATE TRIGGER reject_agent_provenance BEFORE UPDATE ON game_player_statistics BEGIN SELECT RAISE(ABORT, 'agent provenance failure'); END"
		);
		await expect(
			saveGameAgents({
				gameId: 'g',
				expectedGameRevision: 3,
				players: report().players.map((row) => ({
					playerId: row.externalPlayerId!,
					entryId: row.teamKey === 'red' ? 'entry-a' : 'entry-b',
					agentId: row.externalPlayerId === 'a1' ? null : 'jett'
				}))
			})
		).rejects.toThrow();
		expect(await fixture.db.select().from(s.gamePlayerStatistics)).toEqual(before);
		expect(
			(await fixture.db.select().from(s.gameLineups).where(eq(s.gameLineups.playerId, 'a1')))[0]
				.agentId
		).toBe('jett');
		expect((await fixture.db.select().from(s.games))[0].revision).toBe(3);
	});
});

it('bounds cached reviews and blocks malformed reports and ambiguous lineups', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const { createPostGameReview: review, importPostGameReport: apply } = await import('./review');
		const oldest = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		for (let i = 0; i < 100; i++)
			await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		await expect(
			apply({ token: oldest.token, gameId: 'g', expectedGameRevision: 1 })
		).rejects.toMatchObject({ code: 'stale' });
		const invalid = report();
		invalid.players[0].kills = -1;
		await expect(
			review({ gameId: 'g', expectedGameRevision: 1, report: invalid })
		).rejects.toMatchObject({ code: 'invalid' });
		await fixture.db
			.update(s.gameLineups)
			.set({ playerId: null })
			.where(eq(s.gameLineups.playerId, 'a1'));
		expect(
			(await review({ gameId: 'g', expectedGameRevision: 1, report: report() })).canConfirm
		).toBe(false);
	});
});

it('upgrades legacy imported rows with persistent stat and conservative agent ownership', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		const importedAt = new Date('2026-09-01T00:00:00Z');
		await fixture.db.insert(s.gameStatisticsMeta).values({
			gameId: 'g',
			importSource: 'henrikdev',
			externalMatchId: 'old-report',
			importedAt
		});
		await fixture.db.insert(s.gamePlayerStatistics).values([
			{
				gameId: 'g',
				playerId: 'a1',
				entryId: 'entry-a',
				kills: 7,
				manuallyEditedAt: new Date(importedAt.getTime() + 1)
			},
			{ gameId: 'g', playerId: 'a2', entryId: 'entry-a', kills: 10 }
		]);
		await fixture.client.execute('DROP INDEX game_statistics_meta_source_match_unique');
		for (const column of [
			'agent_manually_edited_at',
			'statistics_manual_override',
			'agent_manual_override'
		])
			await fixture.client.execute(`ALTER TABLE game_player_statistics DROP COLUMN ${column}`);
		await fixture.client.execute(
			'DELETE FROM __drizzle_migrations WHERE created_at IN (SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 3)'
		);
		await migrate(fixture.db, { migrationsFolder: join(process.cwd(), 'drizzle') });
		const rows = await fixture.db.select().from(s.gamePlayerStatistics);
		expect(rows.find((row) => row.playerId === 'a1')).toMatchObject({
			statisticsManualOverride: true,
			agentManualOverride: true,
			agentManuallyEditedAt: null
		});
		expect(rows.find((row) => row.playerId === 'a2')).toMatchObject({
			statisticsManualOverride: false,
			agentManualOverride: true
		});
		expect(rows.find((row) => row.playerId === 'a3')).toMatchObject({
			kills: null,
			agentManualOverride: true,
			manuallyEditedAt: null,
			agentManuallyEditedAt: null
		});
		expect(rows).toHaveLength(10);
	});
});

it('protects a known saved agent on same-report reimport when its statistics row was discarded', async () => {
	await withManagementFixture(async (fixture) => {
		await prepare(fixture);
		await fixture.db.insert(s.agents).values({ id: 'sage', key: 'sage', displayName: 'Sage' });
		const {
			createPostGameReview: review,
			importPostGameReport: apply,
			discardGamePlayerStatistics
		} = await import('./review');
		const initial = await review({ gameId: 'g', expectedGameRevision: 1, report: report() });
		await apply({ token: initial.token, gameId: 'g', expectedGameRevision: 1 });
		await discardGamePlayerStatistics({
			gameId: 'g',
			expectedGameRevision: 2,
			playerId: 'a1',
			confirmation: true
		});
		const agreeing = await review({ gameId: 'g', expectedGameRevision: 3, report: report() });
		await apply({ token: agreeing.token, gameId: 'g', expectedGameRevision: 3 });
		const changed = report();
		changed.players[0].agentName = 'Sage';
		const preview = await review({ gameId: 'g', expectedGameRevision: 4, report: changed });
		expect(preview.players[0].conflicts).toEqual({ statistics: false, agent: true });
		await expect(
			apply({ token: preview.token, gameId: 'g', expectedGameRevision: 4 })
		).rejects.toMatchObject({ code: 'blocked' });
		await apply({
			token: preview.token,
			gameId: 'g',
			expectedGameRevision: 4,
			resolutions: { a1: { agent: 'keep-local' } }
		});
		const again = await review({ gameId: 'g', expectedGameRevision: 5, report: changed });
		expect(again.players[0].conflicts.agent).toBe(true);
	});
});
