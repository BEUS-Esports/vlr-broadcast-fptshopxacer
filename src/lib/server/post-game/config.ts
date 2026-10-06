export type HenrikDevConfig = {
	baseUrl: string;
	apiKey: string;
	affinity: string;
	platform: string;
	timeoutMs: number;
	candidateLimit: number;
};
export type SpectraConfig = {
	baseUrl: string;
	groupCode: string;
	timeoutMs: number;
	pollIntervalMs: number;
	maxAttempts: number;
};
import { loadProviderConfig } from '#lib/server/live/config.ts';

function host(value: string) {
	const url = new URL(value);
	if (
		!['https:', 'http:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== '/'
	)
		throw new Error('Invalid provider host.');
	return url.origin;
}
function integer(value: string | undefined, fallback: number, min: number, max: number) {
	const result = value ? Number(value) : fallback;
	if (!Number.isSafeInteger(result) || result < min || result > max)
		throw new Error('Invalid provider limit.');
	return result;
}
export function normalizePostGameConfig(
	env: Record<string, string | undefined>,
	spectraGroupCode = ''
) {
	let henrikdev: HenrikDevConfig | null = null;
	let spectra: SpectraConfig | null = null;
	const availability = {
		henrikdev: {
			available: false,
			message: 'HenrikDev requires a server API key.' as string | null
		},
		spectra: { available: false, message: 'Spectra requires a group code.' as string | null }
	};
	try {
		const apiKey = env.HENRIKDEV_API_KEY?.trim() ?? '';
		const affinity = (env.HENRIKDEV_AFFINITY || 'ap').toLowerCase();
		const platform = (env.HENRIKDEV_PLATFORM || 'pc').toLowerCase();
		if (
			!['eu', 'na', 'latam', 'br', 'ap', 'kr'].includes(affinity) ||
			!['pc', 'console'].includes(platform) ||
			apiKey.length > 2048 ||
			/[\r\n]/.test(apiKey)
		)
			throw new Error('Invalid settings.');
		const config: HenrikDevConfig = {
			baseUrl: host(env.HENRIKDEV_BASE_URL || 'https://api.henrikdev.xyz'),
			apiKey,
			affinity,
			platform,
			timeoutMs: integer(env.POST_GAME_REQUEST_TIMEOUT_MS, 15000, 1, 30000),
			candidateLimit: integer(env.HENRIKDEV_CANDIDATE_LIMIT, 5, 1, 10)
		};
		Object.defineProperty(config, 'apiKey', { enumerable: false });
		if (apiKey) {
			henrikdev = config;
			availability.henrikdev = { available: true, message: null };
		}
	} catch {
		availability.henrikdev.message = 'HenrikDev server settings are invalid.';
	}
	try {
		const groupCode = (env.SPECTRA_POST_GAME_GROUP_CODE?.trim() || spectraGroupCode).trim();
		if (groupCode.length > 128 || [...groupCode].some((char) => char.charCodeAt(0) < 32))
			throw new Error('Invalid group code.');
		const config: SpectraConfig = {
			baseUrl: host(env.SPECTRA_POST_GAME_BASE_URL || 'https://stats.valospectra.com'),
			groupCode,
			timeoutMs: integer(env.POST_GAME_REQUEST_TIMEOUT_MS, 15000, 1, 30000),
			pollIntervalMs: integer(env.SPECTRA_POST_GAME_POLL_INTERVAL_MS, 15000, 1, 15000),
			maxAttempts: integer(env.SPECTRA_POST_GAME_MAX_ATTEMPTS, 3, 1, 4)
		};
		Object.defineProperty(config, 'groupCode', { enumerable: false });
		// Operators may provide a group code per fetch even when none is configured.
		spectra = config;
		availability.spectra = { available: true, message: null };
	} catch {
		availability.spectra.message = 'Spectra post-game server settings are invalid.';
	}
	return { henrikdev, spectra, availability };
}
export async function loadPostGameConfig() {
	let groupCode = '';
	try {
		groupCode = (await loadProviderConfig()).groupCode;
	} catch {
		/* Live settings must not disable post-game/manual use. */
	}
	const privateEnv = await import('$app/env/private');
	return normalizePostGameConfig(
		Object.fromEntries(
			Object.entries(privateEnv).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string'
			)
		),
		groupCode
	);
}
