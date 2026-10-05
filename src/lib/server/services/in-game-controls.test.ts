import { expect, it, vi } from 'vitest';
import * as s from '#lib/server/db/schema/index.ts';
import { withTwoConnections } from '#lib/server/testing/management-fixture.ts';

it('owns pause edges, ceremony expiry, stale controllers and held program controls atomically', async () => {
	await withTwoConnections(async ({ db, secondDb }) => {
		await db.insert(s.games).values([
			{ id: 'g', matchId: 'match', number: 1, name: 'Game' },
			{ id: 'g2', matchId: 'match', number: 2, name: 'Next' }
		]);
		const service = await import('./broadcast');
		let state = await service.getBroadcastState();
		expect(state).toMatchObject({ pause: { type: 'none' }, ceremony: null });
		const act = async (action: unknown) => {
			state = await service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				inGameAction: action
			} as Parameters<typeof service.updateBroadcastState>[0]);
			return state;
		};
		const rejects = async (action: unknown) => {
			await expect(act(action)).rejects.toMatchObject({
				code: expect.stringMatching(/invalid|blocked/)
			});
			expect(await service.getBroadcastState()).toEqual(state);
		};
		await rejects({ type: 'request-technical' });
		state = await service.updateBroadcastState({
			expectedRevision: state.controlRevision,
			selectedGameId: 'g'
		});
		for (const action of [
			null,
			{ type: 'set-pause', pause: { type: 'technical' } },
			{ type: 'request-technical', pendingTechnical: false }
		])
			await rejects(action);
		for (const action of [
			{ type: 'finish-tactical' },
			{ type: 'resume-technical' },
			{ type: 'cancel-pending-technical' },
			{ type: 'start-tactical', entryId: 'left' },
			{ type: 'start-tactical', entryId: 'entry-c' }
		])
			await rejects(action);
		await act({ type: 'start-tactical', entryId: 'entry-a' });
		expect(state.pause).toEqual({ type: 'tactical', entryId: 'entry-a', pendingTechnical: false });
		await rejects({ type: 'start-tactical', entryId: 'entry-b' });
		await rejects({ type: 'resume-technical' });
		await rejects({ type: 'cancel-pending-technical' });
		await rejects({ type: 'trigger-ceremony', ceremony: 'clutch', entryId: 'entry-a' });
		await act({ type: 'request-technical' });
		expect(state.pause).toMatchObject({ pendingTechnical: true });
		await rejects({ type: 'request-technical' });
		await act({ type: 'cancel-pending-technical' });
		await act({ type: 'request-technical' });
		const stale = state.controlRevision;
		await act({ type: 'finish-tactical' });
		expect((await secondDb.select().from(s.broadcastState))[0].pause).toEqual({
			type: 'technical'
		});
		await expect(
			service.updateBroadcastState({
				expectedRevision: stale,
				inGameAction: { type: 'start-tactical', entryId: 'entry-b' }
			} as Parameters<typeof service.updateBroadcastState>[0])
		).rejects.toMatchObject({ code: 'stale' });
		for (const action of [
			{ type: 'request-technical' },
			{ type: 'start-tactical', entryId: 'entry-a' },
			{ type: 'finish-tactical' },
			{ type: 'cancel-pending-technical' }
		])
			await rejects(action);
		await act({ type: 'resume-technical' });
		await act({ type: 'start-tactical', entryId: 'entry-b' });
		await act({ type: 'finish-tactical' });
		await act({ type: 'request-technical' });
		await rejects({ type: 'trigger-ceremony', ceremony: 'clutch', entryId: 'entry-b' });
		await act({ type: 'resume-technical' });
		await rejects({ type: 'trigger-ceremony', ceremony: 'ace', entryId: 'entry-a' });
		await rejects({ type: 'trigger-ceremony', ceremony: 'clutch', entryId: 'entry-c' });
		const clock = vi.spyOn(Date, 'now').mockReturnValue(100000);
		try {
			for (const ceremony of ['round-win', 'thrifty', 'clutch', 'team-ace', 'flawless']) {
				await act({ type: 'trigger-ceremony', ceremony, entryId: 'entry-b' });
				expect(state.ceremony).toEqual({
					type: ceremony,
					entryId: 'entry-b',
					triggeredAt: Date.now(),
					sequence: state.controlRevision
				});
				await rejects({ type: 'trigger-ceremony', ceremony, entryId: 'entry-a' });
				clock.mockReturnValue(Date.now() + 6000);
			}
			await act({ type: 'dismiss-ceremony' });
			await act({ type: 'trigger-ceremony', ceremony: 'flawless', entryId: 'entry-a' });
			const sequence = state.ceremony!.sequence;
			await act({ type: 'dismiss-ceremony' });
			await act({ type: 'trigger-ceremony', ceremony: 'flawless', entryId: 'entry-a' });
			expect(state.ceremony!.sequence).toBeGreaterThan(sequence);
			state = await service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				visibility: { 'in-game': true }
			});
			const held = state.publications['in-game'];
			await act({ type: 'start-tactical', entryId: 'entry-a' });
			expect(state.publications['in-game']).toEqual(held);
			const { buildBroadcastSnapshot } = await import('../broadcast/snapshot');
			const { programSnapshot } = await import('#lib/broadcast/selectors.ts');
			expect(
				programSnapshot(await buildBroadcastSnapshot(), 'in-game')?.liveControls.pause
			).toEqual(state.pause);
			state = await service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				visibility: { 'in-game': false },
				selectedGameId: 'g'
			});
			expect(state.pause.type).toBe('tactical');
			state = await service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				selectedGameId: 'g2'
			});
			expect(state).toMatchObject({ pause: { type: 'none' }, ceremony: null });
			await act({ type: 'trigger-ceremony', ceremony: 'clutch', entryId: 'entry-a' });
			state = await service.updateBroadcastState({
				expectedRevision: state.controlRevision,
				selectedGameId: null
			});
			expect(state).toMatchObject({ pause: { type: 'none' }, ceremony: null });
		} finally {
			clock.mockRestore();
		}
	});
});

it('accepts explicit form commands and rejects malformed, mixed and stale controller requests', async () => {
	await withTwoConnections(async ({ db }) => {
		await db.insert(s.games).values({ id: 'g', matchId: 'match', number: 1, name: 'Game' });
		const service = await import('./broadcast');
		let state = await service.updateBroadcastState({ expectedRevision: 1, selectedGameId: 'g' });
		const { actions } = await import('./graphics-control');
		const submit = async (payload: Record<string, unknown>) => {
			const form = new FormData();
			form.set('payload', JSON.stringify(payload));
			return actions.controls!({
				request: new Request('http://localhost/admin/graphics/in-game?/controls', {
					method: 'POST',
					body: form
				})
			} as Parameters<NonNullable<typeof actions.controls>>[0]);
		};
		for (const fields of [
			{ command: 'set-pause', pause: { type: 'technical' } },
			{ command: 'start-tactical', entryId: 'entry-c' },
			{ command: 'request-technical', swapped: true },
			{ command: 'request-technical', ceremony: 'clutch' }
		]) {
			expect(
				await submit({ expectedRevision: state.controlRevision, intent: 'in-game', ...fields })
			).toMatchObject({ status: 400, data: { code: 'invalid' } });
			expect(await service.getBroadcastState()).toEqual(state);
		}
		const revision = state.controlRevision;
		expect(
			await submit({
				expectedRevision: revision,
				intent: 'in-game',
				command: 'start-tactical',
				entryId: 'entry-b'
			})
		).toEqual({ saved: true });
		state = await service.getBroadcastState();
		expect(state.pause).toEqual({ type: 'tactical', entryId: 'entry-b', pendingTechnical: false });
		expect(
			await submit({ expectedRevision: revision, intent: 'in-game', command: 'request-technical' })
		).toMatchObject({ status: 409, data: { code: 'stale' } });
		expect(await service.getBroadcastState()).toEqual(state);
	});
});
