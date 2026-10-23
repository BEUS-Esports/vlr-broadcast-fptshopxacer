import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { providerSettings } from '#lib/server/db/schema/index.ts';
import {
	defaultConfig as defaultLiveConfig,
	loadLegacyProviderConfig,
	normalizeConfig,
	removeLegacyProviderConfig
} from '#lib/server/live/config.ts';

export const henrikdevAffinities = ['ap', 'br', 'eu', 'kr', 'latam', 'na'] as const;
export const henrikdevPlatforms = ['pc', 'console'] as const;

export type ProviderSettingsValue = {
	revision: number;
	spectraRegion: 'eu' | 'na' | 'custom';
	spectraHost: string;
	spectraAccessKey: string;
	spectraGroupCode: string;
	gstackUrl: string;
	henrikdevBaseUrl: string;
	henrikdevApiKey: string;
	henrikdevAffinity: (typeof henrikdevAffinities)[number];
	henrikdevPlatform: (typeof henrikdevPlatforms)[number];
	henrikdevCandidateLimit: number;
	postGameRequestTimeoutMs: number;
	spectraPostGameBaseUrl: string;
	spectraPostGameGroupCode: string;
	spectraPostGamePollIntervalMs: number;
	spectraPostGameMaxAttempts: number;
};

export const defaultProviderSettings: ProviderSettingsValue = {
	revision: 1,
	spectraRegion: defaultLiveConfig.spectraRegion,
	spectraHost: defaultLiveConfig.spectraHost,
	spectraAccessKey: '',
	spectraGroupCode: '',
	gstackUrl: defaultLiveConfig.gstackUrl,
	henrikdevBaseUrl: 'https://api.henrikdev.xyz',
	henrikdevApiKey: '',
	henrikdevAffinity: 'ap',
	henrikdevPlatform: 'pc',
	henrikdevCandidateLimit: 5,
	postGameRequestTimeoutMs: 15000,
	spectraPostGameBaseUrl: 'https://stats.valospectra.com',
	spectraPostGameGroupCode: '',
	spectraPostGamePollIntervalMs: 15000,
	spectraPostGameMaxAttempts: 3
};

function host(value: unknown, name: string) {
	if (typeof value !== 'string' || value.length > 2048)
		throw new Error(`Enter a valid ${name} host.`);
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error(`Enter a valid ${name} host.`);
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== '/'
	)
		throw new Error(
			`Use an HTTP or HTTPS ${name} host without credentials, query parameters or a path.`
		);
	return url.origin;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, name: string) {
	const result =
		typeof value === 'string' && value.trim() ? Number(value.trim()) : (value ?? fallback);
	if (!Number.isSafeInteger(result) || (result as number) < min || (result as number) > max)
		throw new Error(`${name} must be between ${min} and ${max}.`);
	return result as number;
}

function optionalGroupCode(value: unknown) {
	const result = typeof value === 'string' ? value.trim() : '';
	if (result.length > 128 || [...result].some((char) => char.charCodeAt(0) < 32))
		throw new Error('Enter a valid Spectra post-game group code.');
	return result;
}

export function normalizeProviderSettings(
	input: Partial<ProviderSettingsValue>
): ProviderSettingsValue {
	const value = { ...defaultProviderSettings, ...input };
	const live = normalizeConfig(
		{
			revision: value.revision,
			spectraRegion: value.spectraRegion,
			spectraHost: value.spectraHost,
			accessKey: value.spectraAccessKey,
			groupCode: value.spectraGroupCode,
			gstackUrl: value.gstackUrl
		},
		false
	);
	if (!henrikdevAffinities.includes(value.henrikdevAffinity))
		throw new Error('Choose a HenrikDev Riot affinity.');
	if (!henrikdevPlatforms.includes(value.henrikdevPlatform))
		throw new Error('Choose a HenrikDev platform.');
	if (
		typeof value.henrikdevApiKey !== 'string' ||
		value.henrikdevApiKey.length > 2048 ||
		/[\r\n]/.test(value.henrikdevApiKey)
	)
		throw new Error('Enter a valid HenrikDev API key.');
	return {
		revision: Number.isSafeInteger(value.revision) && value.revision > 0 ? value.revision : 1,
		spectraRegion: live.spectraRegion,
		spectraHost: live.spectraHost,
		spectraAccessKey: live.accessKey,
		spectraGroupCode: live.groupCode,
		gstackUrl: live.gstackUrl,
		henrikdevBaseUrl: host(value.henrikdevBaseUrl, 'HenrikDev'),
		henrikdevApiKey: value.henrikdevApiKey,
		henrikdevAffinity: value.henrikdevAffinity,
		henrikdevPlatform: value.henrikdevPlatform,
		henrikdevCandidateLimit: boundedInteger(
			value.henrikdevCandidateLimit,
			5,
			1,
			10,
			'HenrikDev candidate count'
		),
		postGameRequestTimeoutMs: boundedInteger(
			value.postGameRequestTimeoutMs,
			15000,
			1,
			30000,
			'Post-game request timeout'
		),
		spectraPostGameBaseUrl: host(value.spectraPostGameBaseUrl, 'Spectra post-game'),
		spectraPostGameGroupCode: optionalGroupCode(value.spectraPostGameGroupCode),
		spectraPostGamePollIntervalMs: boundedInteger(
			value.spectraPostGamePollIntervalMs,
			15000,
			1,
			15000,
			'Spectra poll interval'
		),
		spectraPostGameMaxAttempts: boundedInteger(
			value.spectraPostGameMaxAttempts,
			3,
			1,
			4,
			'Spectra poll attempts'
		)
	};
}

function parseEncryptionKey(value: string) {
	const trimmed = value.trim();
	const key = /^[0-9a-f]{64}$/i.test(trimmed)
		? Buffer.from(trimmed, 'hex')
		: Buffer.from(trimmed, 'base64');
	if (key.length !== 32)
		throw new Error('SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes.');
	return key;
}

let encryptionKey: Promise<Buffer> | undefined;
async function getEncryptionKey() {
	return (encryptionKey ??= (async () => {
		const configured = process.env.SETTINGS_ENCRYPTION_KEY;
		if (configured) return parseEncryptionKey(configured);
		const file = resolve(process.env.SETTINGS_ENCRYPTION_KEY_FILE ?? 'data/settings.key');
		try {
			return parseEncryptionKey(await readFile(file, 'utf8'));
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
		}
		const encoded = randomBytes(32).toString('base64');
		await mkdir(dirname(file), { recursive: true });
		try {
			await writeFile(file, encoded + '\n', { mode: 0o600, flag: 'wx' });
			return parseEncryptionKey(encoded);
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
			return parseEncryptionKey(await readFile(file, 'utf8'));
		}
	})());
}

async function encryptSecret(value: string, purpose: string) {
	if (!value) return null;
	const key = await getEncryptionKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(`provider-settings:${purpose}:v1`));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return ['v1', iv, tag, ciphertext]
		.map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
		.join(':');
}

async function decryptSecret(value: string | null, purpose: string) {
	if (!value) return '';
	const [version, iv, tag, ciphertext, extra] = value.split(':');
	if (version !== 'v1' || !iv || !tag || !ciphertext || extra)
		throw new Error('Encrypted provider setting has an unsupported format.');
	try {
		const key = await getEncryptionKey();
		const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
		decipher.setAAD(Buffer.from(`provider-settings:${purpose}:v1`));
		decipher.setAuthTag(Buffer.from(tag, 'base64url'));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertext, 'base64url')),
			decipher.final()
		]).toString('utf8');
	} catch {
		throw new Error('Could not decrypt provider settings. Check the server encryption key.');
	}
}

async function bootstrapSettings() {
	const defaults = { ...defaultProviderSettings };
	try {
		const legacy = await loadLegacyProviderConfig();
		Object.assign(defaults, {
			revision: 1,
			spectraRegion: legacy.spectraRegion,
			spectraHost: legacy.spectraHost,
			spectraAccessKey: legacy.accessKey,
			spectraGroupCode: legacy.groupCode,
			gstackUrl: legacy.gstackUrl
		});
	} catch {
		/* Invalid legacy live settings do not prevent the Settings page from recovering. */
	}
	const legacyDefaults = { ...defaults };
	try {
		const env = Object.fromEntries(Object.entries(await import('$app/env/private')));
		const text = (key: string) => {
			const value = env[key];
			return typeof value === 'string' ? value : undefined;
		};
		Object.assign(defaults, {
			henrikdevBaseUrl: text('HENRIKDEV_BASE_URL') || defaults.henrikdevBaseUrl,
			henrikdevApiKey: text('HENRIKDEV_API_KEY')?.trim() || defaults.henrikdevApiKey,
			henrikdevAffinity:
				(text('HENRIKDEV_AFFINITY')?.toLowerCase() as ProviderSettingsValue['henrikdevAffinity']) ||
				defaults.henrikdevAffinity,
			henrikdevPlatform:
				(text('HENRIKDEV_PLATFORM')?.toLowerCase() as ProviderSettingsValue['henrikdevPlatform']) ||
				defaults.henrikdevPlatform,
			henrikdevCandidateLimit:
				text('HENRIKDEV_CANDIDATE_LIMIT') || defaults.henrikdevCandidateLimit,
			postGameRequestTimeoutMs:
				text('POST_GAME_REQUEST_TIMEOUT_MS') || defaults.postGameRequestTimeoutMs,
			spectraPostGameBaseUrl: text('SPECTRA_POST_GAME_BASE_URL') || defaults.spectraPostGameBaseUrl,
			spectraPostGameGroupCode:
				text('SPECTRA_POST_GAME_GROUP_CODE')?.trim() || defaults.spectraPostGameGroupCode,
			spectraPostGamePollIntervalMs:
				text('SPECTRA_POST_GAME_POLL_INTERVAL_MS') || defaults.spectraPostGamePollIntervalMs,
			spectraPostGameMaxAttempts:
				text('SPECTRA_POST_GAME_MAX_ATTEMPTS') || defaults.spectraPostGameMaxAttempts
		});
	} catch {
		/* Environment bootstrap is optional after database settings exist. */
	}
	try {
		return normalizeProviderSettings(defaults);
	} catch {
		return normalizeProviderSettings(legacyDefaults);
	}
}

async function rowToSettings(
	row: typeof providerSettings.$inferSelect
): Promise<ProviderSettingsValue> {
	return normalizeProviderSettings({
		revision: row.revision,
		spectraRegion: row.spectraRegion,
		spectraHost: row.spectraHost,
		spectraAccessKey: await decryptSecret(row.spectraAccessKeyEncrypted, 'spectra-access-key'),
		spectraGroupCode: row.spectraGroupCode,
		gstackUrl: row.gstackUrl,
		henrikdevBaseUrl: row.henrikdevBaseUrl,
		henrikdevApiKey: await decryptSecret(row.henrikdevApiKeyEncrypted, 'henrikdev-api-key'),
		henrikdevAffinity: row.henrikdevAffinity,
		henrikdevPlatform: row.henrikdevPlatform,
		henrikdevCandidateLimit: row.henrikdevCandidateLimit,
		postGameRequestTimeoutMs: row.postGameRequestTimeoutMs,
		spectraPostGameBaseUrl: row.spectraPostGameBaseUrl,
		spectraPostGameGroupCode: row.spectraPostGameGroupCode,
		spectraPostGamePollIntervalMs: row.spectraPostGamePollIntervalMs,
		spectraPostGameMaxAttempts: row.spectraPostGameMaxAttempts
	});
}

async function insertSettings(value: ProviderSettingsValue) {
	await db
		.insert(providerSettings)
		.values({
			id: 1,
			revision: value.revision,
			spectraRegion: value.spectraRegion,
			spectraHost: value.spectraHost,
			spectraAccessKeyEncrypted: await encryptSecret(value.spectraAccessKey, 'spectra-access-key'),
			spectraGroupCode: value.spectraGroupCode,
			gstackUrl: value.gstackUrl,
			henrikdevBaseUrl: value.henrikdevBaseUrl,
			henrikdevApiKeyEncrypted: await encryptSecret(value.henrikdevApiKey, 'henrikdev-api-key'),
			henrikdevAffinity: value.henrikdevAffinity,
			henrikdevPlatform: value.henrikdevPlatform,
			henrikdevCandidateLimit: value.henrikdevCandidateLimit,
			postGameRequestTimeoutMs: value.postGameRequestTimeoutMs,
			spectraPostGameBaseUrl: value.spectraPostGameBaseUrl,
			spectraPostGameGroupCode: value.spectraPostGameGroupCode,
			spectraPostGamePollIntervalMs: value.spectraPostGamePollIntervalMs,
			spectraPostGameMaxAttempts: value.spectraPostGameMaxAttempts
		})
		.onConflictDoNothing();
}

async function cleanupLegacyConfig() {
	try {
		await removeLegacyProviderConfig();
	} catch {
		/* Keep encrypted DB settings usable; retry legacy cleanup on the next load. */
	}
}

export async function loadProviderSettings(): Promise<ProviderSettingsValue> {
	let [row] = await db.select().from(providerSettings).where(eq(providerSettings.id, 1));
	if (!row) {
		await insertSettings(await bootstrapSettings());
		[row] = await db.select().from(providerSettings).where(eq(providerSettings.id, 1));
	}
	if (!row) throw new Error('Could not initialize provider settings.');
	await cleanupLegacyConfig();
	return rowToSettings(row);
}

export function publicProviderSettings(value: ProviderSettingsValue) {
	const { spectraAccessKey, henrikdevApiKey, ...safe } = value;
	const live = normalizeConfig(
		{
			revision: value.revision,
			spectraRegion: value.spectraRegion,
			spectraHost: value.spectraHost,
			accessKey: value.spectraAccessKey,
			groupCode: value.spectraGroupCode,
			gstackUrl: value.gstackUrl
		},
		false
	);
	return {
		...safe,
		spectraSocketUrl: live.spectraSocketUrl,
		spectraExtrasUrl: live.spectraExtrasUrl,
		groupCode: value.spectraGroupCode,
		hasAccessKey: !!spectraAccessKey,
		hasHenrikdevApiKey: !!henrikdevApiKey
	};
}

export async function saveProviderSettings(
	input: Partial<ProviderSettingsValue> & {
		spectraAccessKey?: string;
		henrikdevApiKey?: string;
		clearSpectraAccessKey?: boolean;
		clearHenrikdevApiKey?: boolean;
	},
	expectedRevision: number
) {
	return db.transaction(async (tx) => {
		const [row] = await tx.select().from(providerSettings).where(eq(providerSettings.id, 1));
		if (!row) throw new Error('Provider settings are not initialized. Reload Settings.');
		if (row.revision !== expectedRevision)
			throw new Error('Provider settings changed. Reload before saving.');
		const current = await rowToSettings(row);
		const next = normalizeProviderSettings({
			...current,
			...input,
			spectraAccessKey: input.clearSpectraAccessKey
				? ''
				: input.spectraAccessKey || current.spectraAccessKey,
			henrikdevApiKey: input.clearHenrikdevApiKey
				? ''
				: input.henrikdevApiKey || current.henrikdevApiKey,
			revision: current.revision + 1
		});
		const updated = await tx
			.update(providerSettings)
			.set({
				revision: next.revision,
				spectraRegion: next.spectraRegion,
				spectraHost: next.spectraHost,
				spectraAccessKeyEncrypted: await encryptSecret(next.spectraAccessKey, 'spectra-access-key'),
				spectraGroupCode: next.spectraGroupCode,
				gstackUrl: next.gstackUrl,
				henrikdevBaseUrl: next.henrikdevBaseUrl,
				henrikdevApiKeyEncrypted: await encryptSecret(next.henrikdevApiKey, 'henrikdev-api-key'),
				henrikdevAffinity: next.henrikdevAffinity,
				henrikdevPlatform: next.henrikdevPlatform,
				henrikdevCandidateLimit: next.henrikdevCandidateLimit,
				postGameRequestTimeoutMs: next.postGameRequestTimeoutMs,
				spectraPostGameBaseUrl: next.spectraPostGameBaseUrl,
				spectraPostGameGroupCode: next.spectraPostGameGroupCode,
				spectraPostGamePollIntervalMs: next.spectraPostGamePollIntervalMs,
				spectraPostGameMaxAttempts: next.spectraPostGameMaxAttempts
			})
			.where(and(eq(providerSettings.id, 1), eq(providerSettings.revision, expectedRevision)))
			.returning();
		if (!updated.length) throw new Error('Provider settings changed. Reload before saving.');
		return next;
	});
}
