import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '#lib/server/db/schema/index.ts';
import { defaultSponsorConfig, type SponsorConfig } from '#lib/broadcast/sponsor.ts';
import { withManagementFixture } from '#lib/server/testing/management-fixture.ts';

const asset = (n: number) => `/assets/00000000-0000-4000-8000-${String(n).padStart(12, '0')}.png`;
const config = (patch: Partial<SponsorConfig> = {}): SponsorConfig => ({
	...structuredClone(defaultSponsorConfig),
	...patch
});

it('loads the seeded defaults without writing', async () => {
	await withManagementFixture(async () => {
		const { loadSponsorSettings } = await import('./sponsors');
		expect(await loadSponsorSettings()).toEqual({ ...defaultSponsorConfig, revision: 1 });
		const { getBroadcastState } = await import('../services/broadcast');
		expect((await getBroadcastState()).dataRevision).toBe(1);
	});
});

it('falls back to defaults when the row is missing and fills missing slots', async () => {
	await withManagementFixture(async ({ db }) => {
		const { loadSponsorSettings } = await import('./sponsors');
		await db.update(s.sponsorSettings).set({ banners: {} as never });
		expect((await loadSponsorSettings()).banners).toEqual(defaultSponsorConfig.banners);
		await db.delete(s.sponsorSettings);
		expect(await loadSponsorSettings()).toEqual({ ...defaultSponsorConfig, revision: 1 });
		expect(await db.select().from(s.sponsorSettings)).toEqual([]);
	});
});

it('saves and bumps the revision', async () => {
	await withManagementFixture(async () => {
		const { saveSponsorSettings, loadSponsorSettings } = await import('./sponsors');
		const next = config({ loopLogos: [asset(1)], loopIntervalMs: 8000 });
		next.banners.default.backgroundPath = asset(2);
		const saved = await saveSponsorSettings(next, 1);
		expect(saved).toEqual({ ...next, revision: 2 });
		expect(await loadSponsorSettings()).toEqual({ ...next, revision: 2 });
	});
});

it('rejects a stale revision and keeps the first save', async () => {
	await withManagementFixture(async () => {
		const { saveSponsorSettings, loadSponsorSettings } = await import('./sponsors');
		const { SaveError } = await import('../services/save-error');
		const first = config({ loopIntervalMs: 8000 });
		await saveSponsorSettings(first, 1);
		const second = saveSponsorSettings(config({ loopIntervalMs: 9000 }), 1);
		await expect(second).rejects.toBeInstanceOf(SaveError);
		await expect(second).rejects.toMatchObject({
			code: 'stale',
			message: 'Sponsor settings changed. Reload before saving.'
		});
		expect(await loadSponsorSettings()).toEqual({ ...first, revision: 2 });
	});
});

it('rejects an invalid expected revision', async () => {
	await withManagementFixture(async () => {
		const { saveSponsorSettings } = await import('./sponsors');
		await expect(saveSponsorSettings(config(), 0)).rejects.toMatchObject({ code: 'invalid' });
	});
});

it.each([
	['interval below minimum', () => config({ loopIntervalMs: 1999 })],
	['interval above maximum', () => config({ loopIntervalMs: 60001 })],
	['non-integer interval', () => config({ loopIntervalMs: 5000.5 })],
	[
		'missing slot',
		() => {
			const next = config();
			delete (next.banners as Record<string, unknown>).tactical;
			return next;
		}
	],
	[
		'extra slot',
		() => {
			const next = config();
			(next.banners as Record<string, unknown>).extra = { backgroundPath: null, logoPath: null };
			return next;
		}
	],
	[
		'extra art key',
		() => {
			const next = config();
			(next.banners.default as Record<string, unknown>).extra = null;
			return next;
		}
	],
	[
		'bad background path',
		() => {
			const next = config();
			next.banners.default.backgroundPath = '/assets/../evil.png';
			return next;
		}
	],
	[
		'bad logo path',
		() => {
			const next = config();
			next.banners.tactical.logoPath = 'https://example.com/a.png';
			return next;
		}
	],
	['bad loop logo path', () => config({ loopLogos: ['/assets/not-a-uuid.png'] })],
	[
		'too many loop logos',
		() => config({ loopLogos: Array.from({ length: 21 }, (_, index) => asset(index)) })
	]
])('rejects invalid config: %s', async (_name, build) => {
	await withManagementFixture(async () => {
		const { saveSponsorSettings, loadSponsorSettings } = await import('./sponsors');
		await expect(saveSponsorSettings(build(), 1)).rejects.toMatchObject({ code: 'invalid' });
		expect((await loadSponsorSettings()).revision).toBe(1);
	});
});

it('reports the interval copy', async () => {
	await withManagementFixture(async () => {
		const { saveSponsorSettings } = await import('./sponsors');
		await expect(saveSponsorSettings(config({ loopIntervalMs: 1999 }), 1)).rejects.toMatchObject({
			message: 'Loop interval must be 2–60 seconds.'
		});
	});
});

it('bumps broadcast dataRevision on save', async () => {
	await withManagementFixture(async ({ db }) => {
		const { getBroadcastState } = await import('../services/broadcast');
		const before = (await getBroadcastState()).dataRevision;
		const { saveSponsorSettings } = await import('./sponsors');
		await saveSponsorSettings(config({ loopIntervalMs: 8000 }), 1);
		expect((await getBroadcastState()).dataRevision).toBeGreaterThanOrEqual(before + 1);
		expect(
			await db.select().from(s.sponsorSettings).where(eq(s.sponsorSettings.id, 1))
		).toHaveLength(1);
	});
});

it('returns copies so mutating a loaded config never touches the shared defaults', async () => {
	await withManagementFixture(async ({ db }) => {
		const { loadSponsorSettings } = await import('./sponsors');
		const loaded = await loadSponsorSettings();
		loaded.banners.default.logoPath = '/assets/changed.png';
		loaded.loopLogos.push('/assets/changed.png');
		expect(defaultSponsorConfig.banners.default.logoPath).toBeNull();
		expect(defaultSponsorConfig.loopLogos).toEqual([]);
		await db.delete(s.sponsorSettings);
		const fallback = await loadSponsorSettings();
		fallback.banners.default.logoPath = '/assets/changed.png';
		fallback.loopLogos.push('/assets/changed.png');
		expect(defaultSponsorConfig.banners.default.logoPath).toBeNull();
		expect(defaultSponsorConfig.loopLogos).toEqual([]);
	});
});
