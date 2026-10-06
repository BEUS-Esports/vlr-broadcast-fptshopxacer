import { afterEach, expect, it } from 'vitest';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

afterEach(() => {
	delete process.env.SETTINGS_ENCRYPTION_KEY;
});

it('encrypts provider credentials in SQLite and never exposes them through public settings', async () => {
	await withManagementFixture(async (fixture) => {
		process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
		const { loadProviderSettings, publicProviderSettings, saveProviderSettings } =
			await import('./providers');
		const initial = await loadProviderSettings();
		const saved = await saveProviderSettings(
			{
				spectraAccessKey: 'spectra-private-key',
				spectraGroupCode: 'EVENT',
				henrikdevApiKey: 'henrik-private-key',
				henrikdevAffinity: 'kr',
				henrikdevPlatform: 'pc'
			},
			initial.revision
		);
		const [row] = await fixture.db.select().from(s.providerSettings);
		expect(row.spectraAccessKeyEncrypted).toMatch(/^v1:/);
		expect(row.henrikdevApiKeyEncrypted).toMatch(/^v1:/);
		expect(row.spectraAccessKeyEncrypted).not.toContain('spectra-private-key');
		expect(row.henrikdevApiKeyEncrypted).not.toContain('henrik-private-key');
		expect(await loadProviderSettings()).toMatchObject({
			spectraAccessKey: 'spectra-private-key',
			henrikdevApiKey: 'henrik-private-key',
			henrikdevAffinity: 'kr'
		});
		const publicValue = JSON.stringify(publicProviderSettings(saved));
		expect(publicValue).not.toContain('spectra-private-key');
		expect(publicValue).not.toContain('henrik-private-key');
		expect(publicProviderSettings(saved)).toMatchObject({
			hasAccessKey: true,
			hasHenrikdevApiKey: true
		});
		await expect(
			saveProviderSettings({ spectraGroupCode: 'STALE' }, initial.revision)
		).rejects.toThrow('changed');
	});
});

it('keeps saved credentials unless explicitly cleared', async () => {
	await withManagementFixture(async () => {
		process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
		const { loadProviderSettings, saveProviderSettings } = await import('./providers');
		const initial = await loadProviderSettings();
		const withSecrets = await saveProviderSettings(
			{
				spectraAccessKey: 'spectra-key',
				henrikdevApiKey: 'henrik-key'
			},
			initial.revision
		);
		const kept = await saveProviderSettings(
			{
				spectraAccessKey: '',
				henrikdevApiKey: '',
				henrikdevAffinity: 'latam'
			},
			withSecrets.revision
		);
		expect(kept).toMatchObject({
			spectraAccessKey: 'spectra-key',
			henrikdevApiKey: 'henrik-key',
			henrikdevAffinity: 'latam'
		});
		const cleared = await saveProviderSettings(
			{ clearSpectraAccessKey: true, clearHenrikdevApiKey: true },
			kept.revision
		);
		expect(cleared.spectraAccessKey).toBe('');
		expect(cleared.henrikdevApiKey).toBe('');
		const [row] = await fixture.db.select().from(s.providerSettings);
		expect(row.spectraAccessKeyEncrypted).toBeNull();
		expect(row.henrikdevApiKeyEncrypted).toBeNull();
	});
});
