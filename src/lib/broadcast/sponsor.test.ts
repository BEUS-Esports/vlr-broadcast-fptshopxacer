import { describe, expect, it } from 'vitest';
import { ceremonyTypes } from './in-game-controls';
import {
	defaultSponsorConfig,
	emptyArt,
	emptySponsor,
	filterSponsor,
	resolveSponsor,
	type SponsorConfig
} from './sponsor';

describe('resolveSponsor', () => {
	it('falls back per field to default', () => {
		const config: SponsorConfig = {
			...defaultSponsorConfig,
			banners: {
				...defaultSponsorConfig.banners,
				default: { backgroundPath: '/assets/d.png', logoPath: '/assets/dl.png' },
				clutch: { backgroundPath: '/assets/c.png', logoPath: null }
			}
		};
		const { banners } = resolveSponsor(config);

		expect(banners.clutch).toEqual({ backgroundPath: '/assets/c.png', logoPath: '/assets/dl.png' });
		expect(banners.tactical).toEqual(config.banners.default);
	});

	it('leaves art null when default is unset', () => {
		expect(resolveSponsor(defaultSponsorConfig).banners['round-win']).toEqual({
			backgroundPath: null,
			logoPath: null
		});
	});

	it('has no default key and maps the loop', () => {
		const config: SponsorConfig = {
			...defaultSponsorConfig,
			loopLogos: ['/assets/a.png', '/assets/b.png'],
			loopIntervalMs: 7000
		};
		const sponsor = resolveSponsor(config);

		expect(Object.keys(sponsor.banners)).toEqual([...ceremonyTypes, 'tactical', 'technical']);
		expect(sponsor.loop).toEqual({ logos: config.loopLogos, intervalMs: config.loopIntervalMs });
	});
});

describe('filterSponsor', () => {
	const sponsor = resolveSponsor({
		...defaultSponsorConfig,
		banners: {
			...defaultSponsorConfig.banners,
			default: { backgroundPath: '/assets/d.png', logoPath: '/assets/dl.png' }
		},
		loopLogos: ['/assets/a.png']
	});

	it('strips unsupported parts', () => {
		const noBanners = filterSponsor(sponsor, { banners: false, loop: true });
		for (const art of Object.values(noBanners.banners)) expect(art).toEqual(emptyArt);
		expect(noBanners.loop.logos).toEqual(['/assets/a.png']);

		const noLoop = filterSponsor(sponsor, { banners: true, loop: false });
		expect(noLoop.loop.logos).toEqual([]);
		expect(noLoop.banners).toEqual(sponsor.banners);

		expect(filterSponsor(sponsor, { banners: true, loop: true })).toBe(sponsor);
	});
});

describe('shared defaults', () => {
	it('are deeply frozen', () => {
		expect(Object.isFrozen(emptySponsor.banners)).toBe(true);
		expect(Object.isFrozen(emptySponsor.banners.flawless)).toBe(true);
		expect(Object.isFrozen(defaultSponsorConfig.banners.default)).toBe(true);
		expect(Object.isFrozen(defaultSponsorConfig.loopLogos)).toBe(true);
	});
});
