import { afterEach, beforeEach, expect, it } from 'vitest';
import * as s from '#lib/server/db/schema/index.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

beforeEach(() => {
	process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});
afterEach(() => {
	delete process.env.SETTINGS_ENCRYPTION_KEY;
});

it('initializes once with an empty room and a generated password', async () => {
	await withManagementFixture(async ({ db }) => {
		const { loadCameraSettings } = await import('./cameras');
		const [first, second] = await Promise.all([loadCameraSettings(), loadCameraSettings()]);
		expect(first).toEqual(second);
		expect(first.room).toBe('');
		expect(first.password).toMatch(/^[0-9a-f]{24}$/);
		const rows = await db.select().from(s.cameraSettings);
		expect(rows).toHaveLength(1);
		expect(rows[0].passwordEncrypted).toMatch(/^v1:/);
		expect(rows[0].passwordEncrypted).not.toContain(first.password);
	});
});

it('saves a valid room and password and rejects stale revisions', async () => {
	await withManagementFixture(async () => {
		const { loadCameraSettings, saveCameraSettings } = await import('./cameras');
		const initial = await loadCameraSettings();
		const saved = await saveCameraSettings(
			{ room: ' event_1 ', password: 'abcd1234' },
			initial.revision
		);
		expect(saved).toEqual({ revision: 2, room: 'event_1', password: 'abcd1234' });
		expect(await loadCameraSettings()).toEqual(saved);
		await expect(
			saveCameraSettings({ room: 'other', password: 'abcd1234' }, initial.revision)
		).rejects.toMatchObject({ code: 'stale' });
		expect(await loadCameraSettings()).toEqual(saved);
	});
});

it.each([
	{ room: '', password: 'abcd1234' },
	{ room: 'a b', password: 'abcd1234' },
	{ room: 'a&b', password: 'abcd1234' },
	{ room: 'x'.repeat(33), password: 'abcd1234' },
	{ room: 'event', password: 'short' },
	{ room: 'event', password: 'has space1' },
	{ room: 'event', password: 'x'.repeat(33) },
	{ room: 'event', password: 42 }
])('rejects unsafe room and password values %o', async (input) => {
	await withManagementFixture(async () => {
		const { loadCameraSettings, saveCameraSettings } = await import('./cameras');
		const initial = await loadCameraSettings();
		await expect(saveCameraSettings(input, initial.revision)).rejects.toMatchObject({
			code: 'invalid'
		});
		expect(await loadCameraSettings()).toEqual(initial);
	});
});

it('rejects a missing revision as invalid input', async () => {
	await withManagementFixture(async () => {
		const { loadCameraSettings, saveCameraSettings } = await import('./cameras');
		const initial = await loadCameraSettings();
		await expect(
			saveCameraSettings({ room: 'event', password: 'abcd1234' }, undefined as unknown as number)
		).rejects.toMatchObject({ code: 'invalid' });
		expect(await loadCameraSettings()).toEqual(initial);
	});
});
