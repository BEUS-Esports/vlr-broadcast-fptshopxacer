import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

vi.mock('./transport', () => ({
	startProviderSession: vi.fn(() => () => {}),
	lookupSpectraSupporter: vi.fn(async () => 'required')
}));
afterEach(() => vi.unstubAllEnvs());

it('saves the global group without resetting credentials or reconnecting GStack and rejects stale saves', async () => {
	await withManagementFixture(async (fixture) => {
		vi.stubEnv('LIVE_PROVIDER_CONFIG_FILE', join(fixture.directory, 'legacy.json'));
		vi.stubEnv('SETTINGS_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
		const { getLiveSettings, configureLiveProvider, operateLiveProvider, liveCoordinator } =
			await import('./runtime');
		const { loadProviderSettings } = await import('../settings/providers');
		const initial = await getLiveSettings();
		const configured = await configureLiveProvider(
			{
				groupCode: 'FIRST',
				accessKey: 'synthetic',
				henrikdevApiKey: 'synthetic-henrik',
				henrikdevAffinity: 'kr'
			},
			initial.config.revision,
			'gstack'
		);
		const { actions, loadGraphicsControl } = await import('../services/graphics-control');
		const save = (groupCode: string, revision: number) => {
			const form = new FormData();
			form.set('payload', JSON.stringify({ groupCode, revision }));
			return actions.spectra({
				request: new Request('http://localhost/admin/graphics?/spectra', {
					method: 'POST',
					body: form
				})
			} as Parameters<typeof actions.spectra>[0]);
		};
		expect(await save('SHARED', configured.config.revision)).toEqual({ saved: true });
		expect(liveCoordinator.getStatus().generation).toBe(configured.status.generation);
		expect(await loadProviderSettings()).toMatchObject({
			spectraGroupCode: 'SHARED',
			spectraAccessKey: 'synthetic',
			henrikdevApiKey: 'synthetic-henrik',
			henrikdevAffinity: 'kr'
		});
		const current = await getLiveSettings();
		expect((await loadGraphicsControl()).spectra).toEqual({
			groupCode: 'SHARED',
			revision: current.config.revision
		});
		expect(await save('STALE', configured.config.revision)).toMatchObject({ status: 400 });
		expect(await save('bad\u0001code', current.config.revision)).toMatchObject({ status: 400 });
		expect((await getLiveSettings()).config.groupCode).toBe('SHARED');
		await operateLiveProvider({
			action: 'connect',
			provider: 'spectra',
			generation: current.status.generation
		});
		const connected = liveCoordinator.getStatus();
		const saved = await configureLiveProvider({ groupCode: 'NEXT' }, current.config.revision, null);
		expect(saved.status.generation).toBeGreaterThan(connected.generation);
		expect(saved.status).toMatchObject({
			provider: 'spectra',
			mode: 'native',
			mappingReady: false
		});
		const { loadPostGameConfig } = await import('../post-game/config');
		expect((await loadPostGameConfig()).spectra?.groupCode).toBe('NEXT');
		liveCoordinator.dispose();
	});
});
