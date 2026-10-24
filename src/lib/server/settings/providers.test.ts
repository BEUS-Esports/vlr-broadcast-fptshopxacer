import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as s from '#lib/server/db/schema/index.ts';
import { defaultConfig } from '#lib/server/live/config.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

const legacyConfig = { ...defaultConfig, accessKey: 'legacy-spectra-key', groupCode: 'EVENT' };

afterEach(() => {
	delete process.env.SETTINGS_ENCRYPTION_KEY;
	delete process.env.SETTINGS_ENCRYPTION_KEY_FILE;
	delete process.env.LIVE_PROVIDER_CONFIG_FILE;
});

it('uses one saved group for live and post-game, preserves it on settings saves and clears both together', async () => {
	await withManagementFixture(async (fixture) => {
		process.env.LIVE_PROVIDER_CONFIG_FILE = join(fixture.directory, 'legacy-live-provider.json');
		const { loadProviderSettings, saveProviderSettings } = await import('./providers');
		await loadProviderSettings();
		await fixture.db
			.update(s.providerSettings)
			.set({ spectraGroupCode: '', spectraPostGameGroupCode: 'LEGACY' });
		const legacy = await loadProviderSettings();
		expect(legacy.spectraGroupCode).toBe('LEGACY');
		const saved = await saveProviderSettings({ spectraGroupCode: 'SHARED' }, legacy.revision);
		const { loadPostGameConfig } = await import('../post-game/config');
		expect((await loadPostGameConfig()).spectra?.groupCode).toBe('SHARED');
		const kept = await saveProviderSettings({ henrikdevAffinity: 'kr' }, saved.revision);
		expect(kept.spectraGroupCode).toBe('SHARED');
		await saveProviderSettings({ spectraGroupCode: '' }, kept.revision);
		expect((await loadProviderSettings()).spectraGroupCode).toBe('');
		expect((await loadPostGameConfig()).spectra?.groupCode).toBe('');
	});
});

it.each([
	['invalid provider address', JSON.stringify({ ...legacyConfig, gstackUrl: 'invalid' })],
	['malformed JSON', '{"accessKey":"legacy-spectra-key"']
])('preserves a failed legacy import with %s and allows a corrected retry', async (_, original) => {
	await withManagementFixture(async (fixture) => {
		process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
		const file = join(fixture.directory, 'legacy-live-provider.json');
		process.env.LIVE_PROVIDER_CONFIG_FILE = file;
		await writeFile(file, original);
		const { loadProviderSettings } = await import('./providers');

		await expect(loadProviderSettings()).rejects.toThrow(
			new Error('Could not read live-provider settings. Check the server configuration file.')
		);
		expect(await readFile(file, 'utf8')).toBe(original);
		expect(await fixture.db.select().from(s.providerSettings)).toEqual([]);

		await writeFile(file, JSON.stringify(legacyConfig));
		expect(await loadProviderSettings()).toMatchObject({
			spectraAccessKey: legacyConfig.accessKey,
			spectraGroupCode: legacyConfig.groupCode
		});
		await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
	});
});

it('removes legacy credentials only after saving an encrypted, readable copy', async () => {
	await withManagementFixture(async (fixture) => {
		process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
		const file = join(fixture.directory, 'legacy-live-provider.json');
		process.env.LIVE_PROVIDER_CONFIG_FILE = file;
		await writeFile(file, JSON.stringify(legacyConfig));
		const { loadProviderSettings } = await import('./providers');

		const imported = await loadProviderSettings();
		expect(imported).toMatchObject({
			spectraAccessKey: legacyConfig.accessKey,
			spectraGroupCode: legacyConfig.groupCode,
			gstackUrl: legacyConfig.gstackUrl
		});
		const [row] = await fixture.db.select().from(s.providerSettings);
		expect(row.spectraAccessKeyEncrypted).toMatch(/^v1:/);
		expect(row.spectraAccessKeyEncrypted).not.toContain(legacyConfig.accessKey);
		await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
		expect(await loadProviderSettings()).toEqual(imported);
	});
});

it('preserves the legacy file when saving imported settings fails', async () => {
	await withManagementFixture(async (fixture) => {
		process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
		const file = join(fixture.directory, 'legacy-live-provider.json');
		process.env.LIVE_PROVIDER_CONFIG_FILE = file;
		const original = JSON.stringify(legacyConfig);
		await writeFile(file, original);
		await fixture.client.execute(`
			CREATE TRIGGER fail_settings_insert BEFORE INSERT ON provider_settings
			BEGIN SELECT RAISE(ABORT, 'test write failure'); END
		`);
		const { loadProviderSettings } = await import('./providers');

		await expect(loadProviderSettings()).rejects.toThrow();
		expect(await readFile(file, 'utf8')).toBe(original);
		expect(await fixture.db.select().from(s.providerSettings)).toEqual([]);
	});
});

it.each(['decryption', 'validation'])(
	'preserves legacy credentials when saved settings fail %s',
	async (failure) => {
		await withManagementFixture(async (fixture) => {
			process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
			const file = join(fixture.directory, 'legacy-live-provider.json');
			process.env.LIVE_PROVIDER_CONFIG_FILE = file;
			const original = JSON.stringify(legacyConfig);
			await writeFile(file, original);
			const { loadProviderSettings } = await import('./providers');
			await loadProviderSettings();
			// A previous cleanup failure can leave the original beside the database.
			await writeFile(file, original);

			if (failure === 'decryption') {
				process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
			} else {
				await fixture.db.update(s.providerSettings).set({ gstackUrl: 'invalid' });
			}
			vi.resetModules();
			const reloaded = await import('./providers');
			await expect(reloaded.loadProviderSettings()).rejects.toThrow(
				failure === 'decryption' ? 'Could not decrypt provider settings' : 'valid HTTP or HTTPS'
			);
			expect(await readFile(file, 'utf8')).toBe(original);
		});
	}
);

it('encrypts provider credentials in SQLite and never exposes them through public settings', async () => {
	await withManagementFixture(async (fixture) => {
		process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
		process.env.LIVE_PROVIDER_CONFIG_FILE = join(fixture.directory, 'legacy-live-provider.json');
		process.env.SETTINGS_ENCRYPTION_KEY_FILE = join(fixture.directory, 'settings.key');
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
	await withManagementFixture(async (fixture) => {
		process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
		process.env.LIVE_PROVIDER_CONFIG_FILE = join(fixture.directory, 'legacy-live-provider.json');
		process.env.SETTINGS_ENCRYPTION_KEY_FILE = join(fixture.directory, 'settings.key');
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
