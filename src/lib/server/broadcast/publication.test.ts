import { expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import * as s from '#lib/server/db/schema/index.ts';
import {
	withManagementFixture,
	withTwoConnections
} from '#lib/server/testing/management-fixture.ts';

it('keeps Hide and live axes usable after a selected stats player leaves the saved lineup', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Saved' });
		await db
			.insert(s.gameLineups)
			.values({ gameId: 'g', entryId: 'entry-a', slot: 1, playerId: 'a1' });
		const service = await import('../services/broadcast');
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const stats = {
			mode: 'single' as const,
			scope: 'game' as const,
			playerId: 'a1',
			opponentPlayerId: null
		};
		let state = await service.updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			playerStats: stats,
			visibility: { 'player-stats': true }
		});
		const published = (await buildBroadcastSnapshot()).publications['player-stats'];
		const { replaceGameLineups } = await import('../services/lineups');
		await replaceGameLineups({
			gameId: 'g',
			expectedGameRevision: 1,
			teams: ['entry-a', 'entry-b'].map((entryId) => ({
				entryId,
				slots: Array.from({ length: 5 }, (_, index) => ({ slot: index + 1, playerId: null }))
			}))
		});
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			swapped: true,
			currentAttackersEntryId: 'entry-b'
		});
		expect(state.swapped).toBe(true);
		expect(state.publications['player-stats']).toEqual(published);
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			visibility: { 'player-stats': true, mvp: true }
		});
		expect(state.publications['player-stats']).toEqual(published);
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			visibility: { 'player-stats': false, mvp: false }
		});
		expect(state.visibility['player-stats']).toBe(false);
		expect(state.publications['player-stats']).toBeNull();
		for (const patch of [{ playerStats: stats }, { visibility: { 'player-stats': true } }]) {
			await expect(
				service.updateBroadcastState({ expectedRevision: state.controlRevision, ...patch })
			).rejects.toThrow('saved lineup');
			expect(await service.getBroadcastState()).toEqual(state);
		}
		await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			playerStats: { ...stats, playerId: null },
			visibility: { 'player-stats': true }
		});
		expect(
			(await buildBroadcastSnapshot()).publications['player-stats']?.controls.playerStats.playerId
		).toBeNull();
	});
});

it('fails closed on malformed persisted publication containers and repairs capture slots on Hide', async () => {
	await withManagementFixture(async ({ db, client }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Latest' });
		const service = await import('../services/broadcast');
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const { decodeBroadcastSnapshot } = await import('../../broadcast/types');
		const { programSnapshot } = await import('../../broadcast/selectors');
		let state = await service.updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { mvp: true }
		});
		for (const publications of ['null', 'false', '[]', '{}']) {
			await client.execute({
				sql: 'UPDATE broadcast_state SET publications = ? WHERE id = 1',
				args: [publications]
			});
			const snapshot = await buildBroadcastSnapshot();
			expect(snapshot.game?.name).toBe('Latest');
			expect(Object.values(snapshot.publications)).toEqual(Array(7).fill(null));
			expect(decodeBroadcastSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
			expect(programSnapshot(snapshot, 'mvp')).toBeNull();
			state = await service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				visibility: { mvp: false }
			});
			expect(Object.values(state.publications)).toEqual(Array(7).fill(null));
			state = await service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				visibility: { mvp: true }
			});
		}
	});
});

it('rejects Show without selection and selection changes while any shared graphic is shown', async () => {
	await withTwoConnections(async ({ db, secondDb }) => {
		const service = await import('../services/broadcast');
		await expect(
			service.updateBroadcastState({ expectedRevision: 1, visibility: { mvp: true } })
		).rejects.toMatchObject({ code: 'blocked' });
		await db.insert(s.games).values([
			{ id: 'g1', matchId: 'match', number: 1, name: 'One' },
			{ id: 'g2', matchId: 'match', number: 2, name: 'Two' }
		]);
		const shown = await service.updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g1',
			visibility: { mvp: true }
		});
		for (const selectedGameId of ['g2', null]) {
			await expect(
				service.updateBroadcastState({
					expectedRevision: shown.controlRevision,
					selectedGameId,
					visibility: { mvp: false }
				})
			).rejects.toMatchObject({ code: 'blocked' });
			expect(await service.getBroadcastState()).toEqual(shown);
		}
		expect((await secondDb.select().from(s.broadcastState))[0].visibility.mvp).toBe(true);
		const same = await service.updateBroadcastState({
			expectedRevision: shown.controlRevision,
			selectedGameId: 'g1'
		});
		const hidden = await service.updateBroadcastState({
			expectedRevision: same.controlRevision,
			visibility: { mvp: false }
		});
		expect(
			(
				await service.updateBroadcastState({
					expectedRevision: hidden.controlRevision,
					selectedGameId: 'g2'
				})
			).selectedGameId
		).toBe('g2');
	});
});

it('validates nested captures and fails closed when publication metadata is missing', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Selected' });
		const { updateBroadcastState } = await import('../services/broadcast');
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const { decodeBroadcastSnapshot } = await import('../../broadcast/types');
		const { programSnapshot } = await import('../../broadcast/selectors');
		await updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { mvp: true }
		});
		const snapshot = await buildBroadcastSnapshot();
		expect(decodeBroadcastSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
		const malformed = [
			{ ...snapshot, publications: undefined },
			{
				...snapshot,
				publications: {
					...snapshot.publications,
					mvp: { ...snapshot.publications.mvp, publications: {} }
				}
			},
			{
				...snapshot,
				publications: {
					...snapshot.publications,
					mvp: { ...snapshot.publications.mvp, selection: null }
				}
			},
			{
				...snapshot,
				publications: {
					...snapshot.publications,
					mvp: { ...snapshot.publications.mvp, lineups: [null] }
				}
			},
			{
				...snapshot,
				publications: {
					...snapshot.publications,
					mvp: { ...snapshot.publications.mvp, controls: { ...snapshot.controls, mvpScope: 'bad' } }
				}
			},
			{ ...snapshot, version: 1 }
		];
		for (const value of malformed)
			expect(decodeBroadcastSnapshot(JSON.stringify(value))).toBeNull();
		expect(
			programSnapshot({ ...snapshot, publications: undefined } as unknown as typeof snapshot, 'mvp')
		).toBeNull();
		expect(
			programSnapshot({ ...snapshot, publications: { ...snapshot.publications, mvp: null } }, 'mvp')
		).toBeNull();
		expect(
			programSnapshot(
				{
					...snapshot,
					publications: {
						...snapshot.publications,
						mvp: { ...snapshot.publications.mvp!, lineups: [null] }
					}
				} as unknown as typeof snapshot,
				'mvp'
			)
		).toBeNull();
	});
});

it('uses the same persisted publication across two clients, reconnect and a fresh service instance', async () => {
	await withTwoConnections(async ({ db, secondDb }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Published' });
		const { updateBroadcastState } = await import('../services/broadcast');
		await updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { mvp: true }
		});
		const { buildBroadcastSnapshot } = await import('./snapshot');
		const published = (await buildBroadcastSnapshot()).publications.mvp;
		await db.update(s.games).set({ name: 'Latest' }).where(eq(s.games.id, 'g'));
		// Fresh modules and a separate DB connection simulate server restart without browser-local capture.
		vi.resetModules();
		vi.doMock('#lib/server/db/index.ts', () => ({ db: secondDb }));
		const restarted = await import('./snapshot');
		const latest = await restarted.buildBroadcastSnapshot();
		expect(latest.publications.mvp).toEqual(published);
		expect(latest.game?.name).toBe('Latest');
		const { createBroadcastClient } = await import('../../broadcast/client');
		const { programSnapshot } = await import('../../broadcast/selectors');
		const sources = [new EventTarget(), new EventTarget()];
		const clients = sources.map((source) =>
			createBroadcastClient({
				eventSource: () => Object.assign(source, { readyState: 0, close() {} })
			})
		);
		for (const client of clients) client.connect();
		for (const epoch of ['before-reconnect', 'after-restart']) {
			for (const source of sources)
				source.dispatchEvent(
					new MessageEvent('snapshot', {
						data: JSON.stringify({ version: 1, stream: { epoch, sequence: 1 }, snapshot: latest })
					})
				);
			for (const client of clients) {
				expect(client.getState().snapshot?.publications.mvp).toEqual(published);
				expect(programSnapshot(client.getState().snapshot!, 'mvp')?.game?.name).toBe('Published');
			}
		}
		for (const client of clients) client.disconnect();
	});
});

it('migrates legacy shown graphics to hidden while preserving live selection', async () => {
	await withManagementFixture(async ({ db, client }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Legacy' });
		await db.insert(s.broadcastState).values({
			id: 1,
			selectedGameId: 'g',
			visibility: {
				'player-lineup': true,
				'player-stats': false,
				'map-veto': false,
				'agent-select': false,
				'in-game': false,
				'post-game': false,
				mvp: true
			}
		});
		await client.execute('ALTER TABLE broadcast_state DROP COLUMN publications');
		await client.executeMultiple(await readFile('drizzle/0007_broadcast_publications.sql', 'utf8'));
		const [state] = await db.select().from(s.broadcastState);
		expect(state.selectedGameId).toBe('g');
		expect(Object.values(state.visibility)).toEqual(Array(7).fill(false));
		expect(Object.values(state.publications)).toEqual(Array(7).fill(null));
		expect(state.controlRevision).toBe(2);
	});
});

it('captures atomically per graphic, holds saved data and content controls, and republishes only after Hide', async () => {
	await withManagementFixture(async ({ db }) => {
		await db.insert(s.games).values({
			id: 'g',
			matchId: 'match',
			number: 1,
			name: 'Before',
			startingAttackersEntryId: 'entry-a',
			startingDefendersEntryId: 'entry-b'
		});
		const service = await import('../services/broadcast');
		const snapshots = await import('./snapshot');
		const { programSnapshot } = await import('../../broadcast/selectors');
		const transactions = vi.spyOn(db, 'transaction');
		const readsOutsideTransaction = vi.spyOn(db, 'select');
		const shown = await service.updateBroadcastState({
			expectedRevision: 1,
			selectedGameId: 'g',
			visibility: { mvp: true },
			mvpScope: 'match'
		});
		expect(transactions).toHaveBeenCalledTimes(1);
		expect(readsOutsideTransaction).not.toHaveBeenCalled();
		transactions.mockRestore();
		readsOutsideTransaction.mockRestore();
		const published = (await snapshots.buildBroadcastSnapshot()).publications.mvp;
		expect(published).toMatchObject({
			selection: { gameId: 'g' },
			game: { name: 'Before' },
			controlRevision: shown.controlRevision,
			controls: { mvpScope: 'match' }
		});
		expect(published).not.toHaveProperty('publications');
		await db
			.update(s.games)
			.set({
				name: 'After',
				startingAttackersEntryId: 'entry-b',
				startingDefendersEntryId: 'entry-a'
			})
			.where(eq(s.games.id, 'g'));
		let state = await service.updateBroadcastState({
			expectedRevision: shown.controlRevision,
			visibility: { mvp: true, 'in-game': true },
			mvpScope: 'tournament',
			swapped: true,
			currentAttackersEntryId: 'entry-b'
		});
		let latest = await snapshots.buildBroadcastSnapshot();
		expect(latest.game?.name).toBe('After');
		expect(latest.publications.mvp).toEqual(published);
		expect(latest.publications['in-game']?.game?.name).toBe('After');
		let program = programSnapshot(latest, 'mvp')!;
		expect(program.game?.name).toBe('Before');
		expect(program.controls.mvpScope).toBe('match');
		expect(program.presentation.leftEntryId).toBe('entry-b');
		expect(program.sides.attackersEntryId).toBe('entry-b');
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			currentAttackersEntryId: null
		});
		latest = await snapshots.buildBroadcastSnapshot();
		program = programSnapshot(latest, 'mvp')!;
		expect(program.sides.attackersEntryId).toBe('entry-a');
		expect(latest.sides.attackersEntryId).toBe('entry-b');
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			visibility: { mvp: false }
		});
		expect(programSnapshot(await snapshots.buildBroadcastSnapshot(), 'mvp')).toBeNull();
		await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			visibility: { mvp: true }
		});
		latest = await snapshots.buildBroadcastSnapshot();
		expect(programSnapshot(latest, 'mvp')?.game?.name).toBe('After');
		expect(programSnapshot(latest, 'mvp')?.controls.mvpScope).toBe('tournament');
	});
});
