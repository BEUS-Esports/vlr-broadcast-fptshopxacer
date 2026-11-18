import { expect, it } from 'vitest';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

const emptyLineup = (entryId: string) => ({
	entryId,
	slots: Array.from({ length: 5 }, (_, index) => ({ slot: index + 1, playerId: null }))
});

async function setup(db: Parameters<Parameters<typeof withManagementFixture>[0]>[0]['db']) {
	await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Game' });
	await db
		.insert(s.gameLineups)
		.values({ gameId: 'g', entryId: 'entry-a', slot: 1, playerId: 'a1' });
	const service = await import('../services/broadcast');
	const selected = await service.updateBroadcastState({ expectedRevision: 1, selectedGameId: 'g' });
	return { service, selected };
}

it('takes a graphic live without touching standalone state', async () => {
	await withManagementFixture(async ({ db }) => {
		const { service, selected } = await setup(db);
		const state = await service.updateBroadcastState({
			expectedRevision: selected.controlRevision,
			composite: { mvp: true }
		});
		expect(state.compositeVisibility.mvp).toBe(true);
		expect(state.compositePublications.mvp?.selection?.gameId).toBe('g');
		expect(state.visibility.mvp).toBe(false);
		expect(state.publications.mvp).toBeNull();
	});
});

it('replaces the occupant of the same layer', async () => {
	await withManagementFixture(async ({ db }) => {
		const { service, selected } = await setup(db);
		let state = await service.updateBroadcastState({
			expectedRevision: selected.controlRevision,
			composite: { 'post-game': true }
		});
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			composite: { mvp: true }
		});
		expect(state.compositeVisibility['post-game']).toBe(false);
		expect(state.compositePublications['post-game']).toBeNull();
		expect(state.compositeVisibility.mvp).toBe(true);
	});
});

it('stacks graphics on different layers', async () => {
	await withManagementFixture(async ({ db }) => {
		const { service, selected } = await setup(db);
		let state = selected;
		for (const id of ['in-game', 'post-game', 'agent-select'] as const)
			state = await service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				composite: { [id]: true }
			});
		for (const id of ['in-game', 'post-game', 'agent-select'] as const)
			expect(state.compositeVisibility[id]).toBe(true);
	});
});

it('rejects two graphics on one layer in one update', async () => {
	await withManagementFixture(async ({ db }) => {
		const { service, selected } = await setup(db);
		await expect(
			service.updateBroadcastState({
				expectedRevision: selected.controlRevision,
				composite: { mvp: true, 'post-game': true }
			})
		).rejects.toThrow('Take one graphic per layer.');
		expect(await service.getBroadcastState()).toEqual(selected);
	});
});

it('republishes captured data in place', async () => {
	await withManagementFixture(async ({ db }) => {
		const { service, selected } = await setup(db);
		const { replaceGameLineups } = await import('../services/lineups');
		let state = await service.updateBroadcastState({
			expectedRevision: selected.controlRevision,
			composite: { mvp: true },
			visibility: { mvp: true }
		});
		const before = state.compositePublications.mvp!.dataRevision;
		const beforeStandalone = state.publications.mvp!.dataRevision;
		await replaceGameLineups({
			gameId: 'g',
			expectedGameRevision: 1,
			teams: [emptyLineup('entry-a'), emptyLineup('entry-b')]
		});
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			republish: { composite: ['mvp'] }
		});
		expect(state.compositePublications.mvp!.dataRevision).toBeGreaterThan(before);
		expect(state.compositeVisibility.mvp).toBe(true);
		expect(state.publications.mvp!.dataRevision).toBe(beforeStandalone);
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			republish: { standalone: ['mvp'] }
		});
		expect(state.publications.mvp!.dataRevision).toBeGreaterThan(beforeStandalone);
		expect(state.visibility.mvp).toBe(true);
	});
});

it('rejects republishing an off-air graphic', async () => {
	await withManagementFixture(async ({ db }) => {
		const { service, selected } = await setup(db);
		await expect(
			service.updateBroadcastState({
				expectedRevision: selected.controlRevision,
				republish: { composite: ['mvp'] }
			})
		).rejects.toThrow('Only on-air graphics can be updated.');
	});
});

it('blocks game change while the composite is on air', async () => {
	await withManagementFixture(async ({ db }) => {
		const { service, selected } = await setup(db);
		const state = await service.updateBroadcastState({
			expectedRevision: selected.controlRevision,
			composite: { mvp: true }
		});
		await expect(
			service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				selectedGameId: null
			})
		).rejects.toThrow('Hide all shown graphics before changing or clearing the live selection.');
	});
});

it('validates stats players on composite take', async () => {
	await withManagementFixture(async ({ db }) => {
		const { service, selected } = await setup(db);
		const { replaceGameLineups } = await import('../services/lineups');
		const state = await service.updateBroadcastState({
			expectedRevision: selected.controlRevision,
			playerStats: {
				mode: 'single',
				scope: 'game',
				playerId: 'a1',
				opponentPlayerId: null,
				fields: [...s.statisticFields]
			}
		});
		await replaceGameLineups({
			gameId: 'g',
			expectedGameRevision: 1,
			teams: [emptyLineup('entry-a'), emptyLineup('entry-b')]
		});
		await expect(
			service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				composite: { 'player-stats': true }
			})
		).rejects.toThrow('saved lineup');
	});
});
