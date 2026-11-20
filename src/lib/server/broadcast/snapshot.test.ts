import { expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

it('projects axes, saved actors, ordered preparation and every statistics/MVP scope safely', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.agents).values({ id: 'agent', key: 'agent', displayName: 'Agent' });
		await db.insert(s.games).values([
			{
				id: 'g',
				matchId: 'match',
				number: 1,
				name: 'One',
				mapId: 'map-1',
				startingAttackersEntryId: 'entry-a',
				startingDefendersEntryId: 'entry-b'
			},
			{
				id: 'finished',
				matchId: 'match',
				number: 2,
				name: 'Two',
				resultType: 'normal',
				scoreA: 13,
				scoreB: 0,
				winnerEntryId: 'entry-a'
			}
		]);
		await db.insert(s.gameLineups).values([
			{ gameId: 'g', entryId: 'entry-a', slot: 2, playerId: 'a2', agentId: 'agent' },
			{ gameId: 'g', entryId: 'entry-a', slot: 1, playerId: 'a1' },
			{ gameId: 'finished', entryId: 'entry-b', slot: 1, playerId: 'b1' }
		]);
		await db
			.insert(s.gamePlayerStatistics)
			.values({ gameId: 'finished', playerId: 'b1', entryId: 'entry-b', kills: 0 });
		await db.insert(s.gameStatisticsMeta).values({ gameId: 'finished', importSource: 'spectra' });
		await db.insert(s.matchVetoActions).values({
			id: 'v',
			matchId: 'match',
			sequence: 1,
			action: 'pick',
			mapId: 'map-1',
			actingEntryId: 'entry-b',
			gameNumber: 1,
			sideChooserEntryId: 'entry-a',
			sideChoice: 'attack'
		});
		await db.update(s.matches).set({ mvpPlayerId: 'a1' }).where(eq(s.matches.id, 'match'));
		await db
			.update(s.players)
			.set({ archivedAt: new Date(), riotId: 'private-id', fullName: 'Private name' })
			.where(eq(s.players.id, 'a1'));
		await db.update(s.agents).set({ isActive: false }).where(eq(s.agents.id, 'agent'));
		await db.update(s.maps).set({ isActive: false }).where(eq(s.maps.id, 'map-1'));
		const { updateBroadcastState } = await import('../services/broadcast');
		await updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			swapped: true,
			currentAttackersEntryId: 'entry-b'
		});
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const readsOutsideTransaction = vi.spyOn(db, 'select');
		const snapshot = await buildBroadcastSnapshot();
		expect(readsOutsideTransaction).not.toHaveBeenCalled();
		readsOutsideTransaction.mockRestore();
		expect(snapshot.competition).toEqual({ teamAEntryId: 'entry-a', teamBEntryId: 'entry-b' });
		expect(snapshot.presentation).toEqual({ leftEntryId: 'entry-b', rightEntryId: 'entry-a' });
		expect(snapshot.sides).toEqual({
			preparedAttackersEntryId: 'entry-a',
			preparedDefendersEntryId: 'entry-b',
			attackersEntryId: 'entry-b',
			defendersEntryId: 'entry-a',
			source: 'manual'
		});
		expect(snapshot.lineups.map((row) => row.slot)).toEqual([1, 2]);
		expect(snapshot.veto[0]).toMatchObject({
			actingEntryId: 'entry-b',
			sideChooserEntryId: 'entry-a'
		});
		expect(snapshot.scopes.game.statistics.players[0].kills.value).toBeNull();
		expect(snapshot.scopes.match.statistics.players[0].kills.value).toBe(0);
		expect(snapshot.scopes.game.usesSpectra).toBe(false);
		expect(snapshot.scopes.match.usesSpectra).toBe(true);
		expect(snapshot.scopes.tournament.usesSpectra).toBe(true);
		expect(snapshot.scopes.match.candidates.map((row) => row.playerId)).toEqual(['a1', 'a2', 'b1']);
		expect(snapshot.scopes.match.mvpPlayerId).toBe('a1');
		expect(snapshot.scopes.tournament.candidates).toHaveLength(3);
		expect(snapshot.lineups[0].player?.playerId).toBe('a1');
		expect(snapshot.lineups[1].agent?.id).toBe('agent');
		expect(snapshot.game?.map?.id).toBe('map-1');
		expect(JSON.stringify(snapshot)).not.toMatch(
			/riotId|fullName|private-id|Private name|createdAt|valorantApiUuid|importSource/
		);
		const { selectedMvp, presentationTeams, gameplaySide } =
			await import('../../broadcast/selectors');
		expect(
			selectedMvp({ ...snapshot, controls: { ...snapshot.controls, mvpScope: 'match' } })
		).toMatchObject({ player: { playerId: 'a1' }, statistics: null });
		expect(presentationTeams(snapshot).left?.entryId).toBe('entry-b');
		expect(gameplaySide(snapshot, 'entry-b')).toBe('attack');
		const { decodeBroadcastSnapshot } = await import('../../broadcast/types');
		expect(decodeBroadcastSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
	});
});

it('keeps scope membership across matches and historical entry transfers', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.matches).values({
			id: 'other-match',
			tournamentId: 't',
			teamAEntryId: 'entry-a',
			teamBEntryId: 'entry-c',
			label: 'Later'
		});
		await db.insert(s.games).values([
			{ id: 'selected', matchId: 'match', number: 1, name: 'Selected' },
			{
				id: 'other-game',
				matchId: 'other-match',
				number: 1,
				name: 'Later',
				resultType: 'normal',
				scoreA: 0,
				scoreB: 13,
				winnerEntryId: 'entry-c'
			}
		]);
		await db.insert(s.gameLineups).values([
			{ gameId: 'selected', entryId: 'entry-a', slot: 1, playerId: 'a1' },
			{ gameId: 'other-game', entryId: 'entry-c', slot: 1, playerId: 'a1' },
			{ gameId: 'other-game', entryId: 'entry-a', slot: 1, playerId: 'a2' }
		]);
		const { updateBroadcastState } = await import('../services/broadcast');
		await updateBroadcastState({ expectedRevision: 1, selectedGameId: 'selected' });
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const snapshot = await buildBroadcastSnapshot();
		expect(snapshot.scopes.game.candidates.map((row) => row.playerId)).toEqual(['a1']);
		expect(snapshot.scopes.match.candidates.map((row) => row.playerId)).toEqual(['a1']);
		expect(snapshot.scopes.tournament.candidates.map((row) => row.playerId)).toEqual(['a1', 'a2']);
		expect(snapshot.scopes.tournament.candidates[0].entryIds).toEqual(['entry-a', 'entry-c']);
		expect(snapshot.scopes.tournament.statistics.gamesContributing).toBe(1);
		expect(snapshot.scopes.tournament.statistics.players[0].kills).toEqual({
			value: null,
			coverage: 'none'
		});
	});
});

it('includes tournament pick branding without changing selected-game ownership or readiness', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.agents).values({ id: 'agent', key: 'agent', displayName: 'Agent' });
		await db.insert(s.players).values({ id: 'c1', displayName: 'Tournament pick' });
		await db.update(s.teams).set({ logoPath: '/saved-c.png' }).where(eq(s.teams.id, 'team-c'));
		await db.insert(s.games).values({
			id: 'selected',
			matchId: 'match',
			number: 1,
			name: 'Selected',
			mapId: 'map-1',
			startingAttackersEntryId: 'entry-a',
			startingDefendersEntryId: 'entry-b'
		});
		await db.insert(s.gameLineups).values(
			['a', 'b'].flatMap((team) =>
				Array.from({ length: 5 }, (_, i) => ({
					gameId: 'selected',
					entryId: `entry-${team}`,
					slot: i + 1,
					playerId: `${team}${i + 1}`,
					agentId: 'agent'
				}))
			)
		);
		const { updateBroadcastState } = await import('../services/broadcast');
		await updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'selected',
			swapped: true,
			currentAttackersEntryId: 'entry-b'
		});
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const before = await buildBroadcastSnapshot();
		expect(before.readiness).toMatchObject({ lineups: true, agents: true });
		await db.insert(s.tournamentEntries).values([
			{ id: 'outside-a', tournamentId: 'other', teamId: 'team-a' },
			{ id: 'outside-c', tournamentId: 'other', teamId: 'team-c' }
		]);
		await db.insert(s.matches).values([
			{
				id: 'later',
				tournamentId: 't',
				teamAEntryId: 'entry-a',
				teamBEntryId: 'entry-c',
				label: 'Later'
			},
			{
				id: 'outside',
				tournamentId: 'other',
				teamAEntryId: 'outside-a',
				teamBEntryId: 'outside-c',
				label: 'Outside'
			}
		]);
		await db.insert(s.games).values([
			{ id: 'later-game', matchId: 'later', number: 1, name: 'Later' },
			{ id: 'outside-game', matchId: 'outside', number: 1, name: 'Outside' }
		]);
		await db.insert(s.gameLineups).values([
			{ gameId: 'later-game', entryId: 'entry-c', slot: 1, playerId: 'c1' },
			{ gameId: 'outside-game', entryId: 'outside-c', slot: 1, playerId: 'a6' }
		]);
		await db.update(s.tournaments).set({ mvpPlayerId: 'c1' }).where(eq(s.tournaments.id, 't'));
		const { getBroadcastState } = await import('../services/broadcast');
		await updateBroadcastState({
			expectedRevision: (await getBroadcastState()).controlRevision,
			mvpScope: 'tournament',
			playerStats: {
				mode: 'head-to-head',
				scope: 'tournament',
				playerId: 'c1',
				opponentPlayerId: 'a1',
				fields: [...s.statisticFields]
			}
		});
		const snapshot = await buildBroadcastSnapshot();
		const { selectedMvp, teamByEntryId, playerInScope } = await import('../../broadcast/selectors');
		expect(snapshot.teams.map((team) => team.entryId)).toEqual(['entry-a', 'entry-b', 'entry-c']);
		expect(
			teamByEntryId(snapshot, playerInScope(snapshot, 'tournament', 'c1').player!.entryIds[0])
		).toMatchObject({ name: 'Team C', logoPath: '/saved-c.png' });
		expect(selectedMvp(snapshot).player).toMatchObject({ playerId: 'c1', entryIds: ['entry-c'] });
		expect(snapshot.scopes.tournament.candidates.map((player) => player.playerId)).not.toContain(
			'a6'
		);
		for (const key of [
			'selection',
			'match',
			'competition',
			'presentation',
			'sides',
			'lineups',
			'readiness'
		] as const)
			expect(snapshot[key]).toEqual(before[key]);
		expect(snapshot.controls.playerStats).toEqual({
			mode: 'head-to-head',
			scope: 'tournament',
			playerId: 'c1',
			opponentPlayerId: 'a1',
			fields: [...s.statisticFields]
		});
		const { decodeBroadcastSnapshot } = await import('../../broadcast/types');
		expect(decodeBroadcastSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
		await expect(
			updateBroadcastState({
				expectedRevision: snapshot.controlRevision,
				currentAttackersEntryId: 'entry-c'
			})
		).rejects.toThrow('selected match participant');
	});
});

it('emits a complete empty snapshot without inventing preparation', async () => {
	await withManagementFixture(async () => {
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const snapshot = await buildBroadcastSnapshot();
		expect(snapshot.selection).toBeNull();
		expect(snapshot.game).toBeNull();
		expect(snapshot.readiness).toEqual({
			selected: false,
			map: false,
			lineups: false,
			agents: false,
			result: false
		});
		expect(snapshot.scopes.tournament.candidates).toEqual([]);
		expect(snapshot.booths).toEqual({ booth1EntryId: null, booth2EntryId: null });
		expect(snapshot.liveControls.boothsSwapped).toBe(false);
	});
});

it('derives booths from Team A/B and the booth flag only', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const { updateBroadcastState } = await import('../services/broadcast');
		const state = await updateBroadcastState({ expectedRevision: 1, selectedGameId: 'g' });
		const before = await buildBroadcastSnapshot();
		expect(before.booths).toEqual({ booth1EntryId: 'entry-a', booth2EntryId: 'entry-b' });
		await updateBroadcastState({ expectedRevision: state.controlRevision, boothsSwapped: true });
		const after = await buildBroadcastSnapshot();
		expect(after.liveControls.boothsSwapped).toBe(true);
		expect(after.booths).toEqual({ booth1EntryId: 'entry-b', booth2EntryId: 'entry-a' });
		expect(after.competition).toEqual(before.competition);
		expect(after.presentation).toEqual(before.presentation);
	});
});

it('upgrades saved v4 captures to v5 instead of dropping them', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'One' });
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const { updateBroadcastState } = await import('../services/broadcast');
		const { validatedPublications } = await import('#lib/broadcast/types.ts');
		await updateBroadcastState({ expectedRevision: 1, selectedGameId: 'g' });
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the live envelope.
		const { publications, composite, sponsor, stinger, ...current } =
			await buildBroadcastSnapshot();
		const { booths, ...rest } = current;
		const { boothsSwapped, ...liveControls } = current.liveControls;
		expect({ booths, boothsSwapped }).toEqual({
			booths: { booth1EntryId: 'entry-a', booth2EntryId: 'entry-b' },
			boothsSwapped: false
		});
		const v4 = { ...rest, version: 4, liveControls };
		expect(validatedPublications({ 'in-game': v4 })['in-game']).toEqual(current);
	});
});

it('includes resolved sponsor', async () => {
	await withManagementFixture(async () => {
		const { defaultSponsorConfig } = await import('#lib/broadcast/sponsor.ts');
		const { saveSponsorSettings } = await import('../settings/sponsors');
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const logo = '/assets/00000000-0000-4000-8000-000000000001.png';
		const next = structuredClone(defaultSponsorConfig);
		next.banners.default.logoPath = logo;
		await saveSponsorSettings(next, 1);
		expect((await buildBroadcastSnapshot()).sponsor.banners.flawless.logoPath).toBe(logo);
	});
});

it('exposes an empty composite on a fresh state', async () => {
	await withManagementFixture(async () => {
		const { defaultVisibility } = await import('#lib/broadcast/controls.ts');
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const { composite } = await buildBroadcastSnapshot();
		expect(composite.visibility).toEqual(defaultVisibility);
		expect(Object.values(composite.publications).every((slot) => slot === null)).toBe(true);
	});
});

it('repairs malformed composite publications', async () => {
	await withManagementFixture(async ({ client }) => {
		const { buildBroadcastSnapshot } = await import('./snapshot');
		await buildBroadcastSnapshot();
		await client.execute({
			sql: 'update broadcast_state set composite_publications = ? where id = 1',
			args: [JSON.stringify({ mvp: { version: 1 }, 'post-game': 'x' })]
		});
		const { composite } = await buildBroadcastSnapshot();
		expect(Object.values(composite.publications).every((slot) => slot === null)).toBe(true);
	});
});
