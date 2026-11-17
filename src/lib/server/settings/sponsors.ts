import { and, eq } from 'drizzle-orm';
import {
	defaultSponsorConfig,
	SPONSOR_INTERVAL_MAX_MS,
	SPONSOR_INTERVAL_MIN_MS,
	sponsorBannerSlots,
	type SponsorArt,
	type SponsorConfig
} from '#lib/broadcast/sponsor.ts';
import { db } from '#lib/server/db/index.ts';
import { sponsorSettings } from '#lib/server/db/schema/index.ts';
import { SaveError } from '#lib/server/services/save-error.ts';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SponsorSettings = SponsorConfig & { revision: number };

const MAX_LOOP_LOGOS = 20;
const assetPath =
	/^\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validPath(value: unknown): value is string {
	return typeof value === 'string' && assetPath.test(value);
}

function validArt(value: unknown): value is SponsorArt {
	if (!isRecord(value)) return false;
	const keys = Object.keys(value);
	return (
		keys.length === 2 &&
		(value.backgroundPath === null || validPath(value.backgroundPath)) &&
		(value.logoPath === null || validPath(value.logoPath))
	);
}

function validate(next: SponsorConfig) {
	const { banners, loopLogos, loopIntervalMs } = next ?? {};
	if (
		!Number.isInteger(loopIntervalMs) ||
		loopIntervalMs < SPONSOR_INTERVAL_MIN_MS ||
		loopIntervalMs > SPONSOR_INTERVAL_MAX_MS
	)
		throw new SaveError('invalid', 'Loop interval must be 2–60 seconds.');
	if (
		!isRecord(banners) ||
		Object.keys(banners).length !== sponsorBannerSlots.length ||
		!sponsorBannerSlots.every((slot) => validArt(banners[slot]))
	)
		throw new SaveError('invalid', 'Sponsor banners are invalid.');
	if (!Array.isArray(loopLogos) || loopLogos.length > MAX_LOOP_LOGOS || !loopLogos.every(validPath))
		throw new SaveError('invalid', `Loop logos: up to ${MAX_LOOP_LOGOS} uploaded images.`);
}

function rowToSettings(row: typeof sponsorSettings.$inferSelect): SponsorSettings {
	return {
		revision: row.revision,
		// Merge over defaults so a stored row missing a slot never breaks resolveSponsor.
		banners: { ...structuredClone(defaultSponsorConfig.banners), ...row.banners },
		loopLogos: row.loopLogos,
		loopIntervalMs: row.loopIntervalMs
	};
}

/** Read-only: the migration seeds the row, and a read must not bump the broadcast revision. */
export async function loadSponsorSettings(
	connection: typeof db | Transaction = db
): Promise<SponsorSettings> {
	const [row] = await connection.select().from(sponsorSettings).where(eq(sponsorSettings.id, 1));
	return row ? rowToSettings(row) : { ...structuredClone(defaultSponsorConfig), revision: 1 };
}

export async function saveSponsorSettings(
	next: SponsorConfig,
	expectedRevision: number
): Promise<SponsorSettings> {
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
		throw new SaveError('invalid', 'A valid sponsor settings revision is required.');
	validate(next);
	const [row] = await db
		.update(sponsorSettings)
		.set({
			revision: expectedRevision + 1,
			banners: next.banners,
			loopLogos: next.loopLogos,
			loopIntervalMs: next.loopIntervalMs
		})
		.where(and(eq(sponsorSettings.id, 1), eq(sponsorSettings.revision, expectedRevision)))
		.returning();
	if (!row) throw new SaveError('stale', 'Sponsor settings changed. Reload before saving.');
	return rowToSettings(row);
}
