import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

export type LiveProviderConfig = {
	revision: number;
	spectraRegion: 'eu' | 'na' | 'custom';
	spectraHost: string;
	spectraSocketUrl: string;
	spectraExtrasUrl: string;
	accessKey: string;
	groupCode: string;
	gstackUrl: string;
};
export const defaultConfig: LiveProviderConfig = {
	revision: 1,
	spectraRegion: 'eu',
	spectraHost: 'https://eu.valospectra.com',
	spectraSocketUrl: 'https://eu.valospectra.com:5200/',
	spectraExtrasUrl: 'https://eu.valospectra.com:5101/',
	accessKey: '',
	groupCode: '',
	gstackUrl: 'http://localhost:57780/'
};
function endpoint(value: unknown) {
	if (typeof value !== 'string' || value.length > 2048)
		throw new Error('Enter a valid HTTP or HTTPS provider address.');
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error('Enter a valid HTTP or HTTPS provider address.');
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== '/'
	)
		throw new Error('Use an HTTP or HTTPS host without credentials, query parameters or a path.');
	return url;
}
export function normalizeConfig(input: unknown, requireSpectra = true): LiveProviderConfig {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		throw new Error('Invalid provider settings.');
	const value = input as Record<string, unknown>;
	if (!['eu', 'na', 'custom'].includes(value.spectraRegion as string))
		throw new Error('Choose a Spectra region or custom host.');
	const region = value.spectraRegion as LiveProviderConfig['spectraRegion'];
	const host = endpoint(
		region === 'custom' ? value.spectraHost : `https://${region}.valospectra.com`
	);
	const socket = new URL(host);
	socket.port = '5200';
	const extras = new URL(host);
	extras.port = '5101';
	const groupCode = typeof value.groupCode === 'string' ? value.groupCode.trim() : '';
	if (
		(requireSpectra && !groupCode) ||
		groupCode.length > 128 ||
		[...groupCode].some((char) => char.charCodeAt(0) < 32)
	)
		throw new Error('Enter a Spectra group code (up to 128 characters).');
	if (typeof value.accessKey !== 'string' || value.accessKey.length > 2048)
		throw new Error('Enter a valid access key or leave it blank for a custom server.');
	return {
		revision:
			Number.isSafeInteger(value.revision) && (value.revision as number) > 0
				? (value.revision as number)
				: 1,
		spectraRegion: region,
		spectraHost: host.origin,
		spectraSocketUrl: socket.href,
		spectraExtrasUrl: extras.href,
		accessKey: value.accessKey,
		groupCode,
		gstackUrl: endpoint(value.gstackUrl).href
	};
}
export function publicConfig(config: LiveProviderConfig) {
	const { accessKey, ...safe } = config;
	return { ...safe, hasAccessKey: !!accessKey };
}
const configFile = () =>
	resolve(process.env.LIVE_PROVIDER_CONFIG_FILE ?? 'data/live-provider.json');
export async function loadLegacyProviderConfig(): Promise<LiveProviderConfig> {
	try {
		return normalizeConfig(JSON.parse(await readFile(configFile(), 'utf8')), false);
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { ...defaultConfig };
		// JSON parse errors can contain the credential-bearing source text.
		// eslint-disable-next-line preserve-caught-error
		throw new Error('Could not read live-provider settings. Check the server configuration file.');
	}
}
export async function removeLegacyProviderConfig() {
	try {
		await unlink(configFile());
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
	}
}
