import { ceremonyTypes } from './in-game-controls';

export const sponsorBannerSlots = ['default', ...ceremonyTypes, 'tactical', 'technical'] as const;
export type SponsorBannerSlot = (typeof sponsorBannerSlots)[number];
/** What a shown banner is; `default` is only a fallback slot. */
export type SponsorBannerKind = Exclude<SponsorBannerSlot, 'default'>;

export type SponsorArt = { backgroundPath: string | null; logoPath: string | null };

/** Stored form. */
export type SponsorConfig = {
	banners: Record<SponsorBannerSlot, SponsorArt>;
	loopLogos: string[];
	loopIntervalMs: number;
};

/** Resolved form, carried on the broadcast snapshot. */
export type BroadcastSponsor = {
	banners: Record<SponsorBannerKind, SponsorArt>;
	loop: { logos: string[]; intervalMs: number };
};

export type SponsorSupport = { banners: boolean; loop: boolean };

export const SPONSOR_INTERVAL_MIN_MS = 2000;
export const SPONSOR_INTERVAL_MAX_MS = 60000;
export const SPONSOR_INTERVAL_DEFAULT_MS = 5000;

export const emptyArt: SponsorArt = { backgroundPath: null, logoPath: null };

export const defaultSponsorConfig: SponsorConfig = {
	banners: Object.fromEntries(sponsorBannerSlots.map((slot) => [slot, { ...emptyArt }])) as Record<
		SponsorBannerSlot,
		SponsorArt
	>,
	loopLogos: [],
	loopIntervalMs: SPONSOR_INTERVAL_DEFAULT_MS
};

/** Each art field falls back independently to the `default` slot. */
export function resolveSponsor(config: SponsorConfig): BroadcastSponsor {
	const fallback = config.banners.default;
	const kinds = sponsorBannerSlots.filter((slot): slot is SponsorBannerKind => slot !== 'default');
	const banners = Object.fromEntries(
		kinds.map((kind) => {
			const art = config.banners[kind];
			return [
				kind,
				{
					backgroundPath: art.backgroundPath ?? fallback.backgroundPath,
					logoPath: art.logoPath ?? fallback.logoPath
				}
			];
		})
	) as Record<SponsorBannerKind, SponsorArt>;
	return { banners, loop: { logos: config.loopLogos, intervalMs: config.loopIntervalMs } };
}

export const emptySponsor: BroadcastSponsor = resolveSponsor(defaultSponsorConfig);

export function filterSponsor(
	sponsor: BroadcastSponsor,
	support: SponsorSupport
): BroadcastSponsor {
	if (support.banners && support.loop) return sponsor;
	return {
		banners: support.banners ? sponsor.banners : emptySponsor.banners,
		loop: support.loop ? sponsor.loop : { ...sponsor.loop, logos: [] }
	};
}
