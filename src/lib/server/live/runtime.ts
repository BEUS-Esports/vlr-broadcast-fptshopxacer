import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import type { LiveProviderId } from '#lib/live/types.ts';
import { defaultConfig, normalizeConfig, redactDiagnostics } from './config';
import {
	loadProviderSettings,
	publicProviderSettings,
	saveProviderSettings,
	type ProviderSettingsValue
} from '#lib/server/settings/providers.ts';
import { createLiveCoordinator } from './coordinator';
import { livePublisher } from './publisher';
import { suggestMapping } from './mapping';
import { startProviderSession, lookupSpectraSupporter } from './transport';

let config = { ...defaultConfig };
let settings: ProviderSettingsValue | null = null;
let initialized: Promise<void> | undefined;
let queue: Promise<unknown> = Promise.resolve();
let binding: BroadcastPreparedSnapshot | null = null;
let supporter: { revision: number; result: ReturnType<typeof lookupSpectraSupporter> } | null =
	null;
export const liveCoordinator = createLiveCoordinator({
	publish: (state, status, urgent) => livePublisher.publish(state, status, urgent),
	start(provider, callbacks, generation) {
		if (provider === 'spectra') {
			if (supporter?.revision !== config.revision)
				supporter = { revision: config.revision, result: lookupSpectraSupporter(config) };
			void supporter.result.then((value) => liveCoordinator.setAttribution(value, generation));
		} else liveCoordinator.setAttribution('required', generation);
		return startProviderSession({
			provider,
			config,
			generation,
			selectedGameId: binding?.selection?.gameId ?? null,
			callbacks
		});
	}
});
export function syncLiveBinding(snapshot: BroadcastPreparedSnapshot) {
	binding = snapshot;
	liveCoordinator.bind(snapshot);
}
function liveConfig(value: ProviderSettingsValue) {
	return normalizeConfig(
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
}
export function initializeLiveSettings() {
	return (initialized ??= loadProviderSettings().then((saved) => {
		settings = saved;
		config = liveConfig(saved);
	}));
}
function serialize<T>(operation: () => Promise<T>) {
	const next = queue.then(operation);
	queue = next.catch(() => {});
	return next;
}
export async function getLiveSettings() {
	await initializeLiveSettings();
	if (!settings) throw new Error('Provider settings are not initialized.');
	return { config: publicProviderSettings(settings), status: liveCoordinator.getStatus() };
}
export function configureLiveProvider(
	input: unknown,
	expectedRevision: number,
	connect: LiveProviderId | null
) {
	return serialize(async () => {
		await initializeLiveSettings();
		if (!settings || expectedRevision !== settings.revision)
			throw new Error('Provider settings changed. Reload before saving.');
		const value = input as Record<string, unknown>;
		const previous = settings;
		const activeProvider = liveCoordinator.getStatus().provider;
		const submittedGroup =
			typeof value.groupCode === 'string' ? value.groupCode.trim() : settings.spectraGroupCode;
		if (connect === 'spectra' && !submittedGroup)
			throw new Error('Set a Spectra group code before connecting.');
		const next = await saveProviderSettings(
			{
				...value,
				spectraRegion: value.spectraRegion as ProviderSettingsValue['spectraRegion'],
				spectraHost: value.spectraHost as string,
				spectraGroupCode: value.groupCode as string,
				spectraAccessKey: value.accessKey as string,
				clearSpectraAccessKey: value.clearKey === true,
				gstackUrl: value.gstackUrl as string,
				henrikdevBaseUrl: value.henrikdevBaseUrl as string,
				henrikdevApiKey: value.henrikdevApiKey as string,
				clearHenrikdevApiKey: value.clearHenrikdevApiKey === true,
				henrikdevAffinity: value.henrikdevAffinity as ProviderSettingsValue['henrikdevAffinity'],
				henrikdevPlatform: value.henrikdevPlatform as ProviderSettingsValue['henrikdevPlatform'],
				henrikdevCandidateLimit: value.henrikdevCandidateLimit as number,
				postGameRequestTimeoutMs: value.postGameRequestTimeoutMs as number,
				spectraPostGameBaseUrl: value.spectraPostGameBaseUrl as string,
				spectraPostGameGroupCode: value.spectraPostGameGroupCode as string,
				spectraPostGamePollIntervalMs: value.spectraPostGamePollIntervalMs as number,
				spectraPostGameMaxAttempts: value.spectraPostGameMaxAttempts as number
			},
			expectedRevision
		);
		const liveChanged =
			previous.spectraRegion !== next.spectraRegion ||
			previous.spectraHost !== next.spectraHost ||
			previous.spectraAccessKey !== next.spectraAccessKey ||
			previous.spectraGroupCode !== next.spectraGroupCode ||
			previous.gstackUrl !== next.gstackUrl;
		settings = next;
		config = liveConfig(next);
		if (liveChanged) supporter = null;
		if (connect || liveChanged) {
			liveCoordinator.disconnect();
			const target = connect ?? activeProvider;
			if (target) liveCoordinator.connect(target);
		}
		return getLiveSettings();
	});
}
export function operateLiveProvider(input: Record<string, unknown>) {
	return serialize(async () => {
		await initializeLiveSettings();
		if (input.action !== 'native' && input.generation !== liveCoordinator.getStatus().generation)
			throw new Error('Provider session changed. Review the current state and try again.');
		switch (input.action) {
			case 'connect':
				if (input.provider !== 'spectra' && input.provider !== 'gstack')
					throw new Error('Choose ValoSpectra or GStack.');
				if (input.provider === 'spectra' && !config.groupCode)
					throw new Error('Set a Spectra group code in Settings before connecting.');
				liveCoordinator.connect(input.provider);
				break;
			case 'disconnect':
				liveCoordinator.disconnect();
				break;
			case 'native':
				liveCoordinator.useNative();
				break;
			case 'external':
				liveCoordinator.enableExternal();
				break;
			case 'mapping':
				liveCoordinator.confirmMapping(input.mapping, input.generation as number);
				break;
			case 'group':
				if (
					typeof input.groupCode !== 'string' ||
					!input.groupCode.trim() ||
					input.groupCode.length > 128
				)
					throw new Error('Enter a Spectra group code.');
				if (input.configRevision !== config.revision)
					throw new Error('Provider settings changed. Reload before changing the group.');
				{
					if (!settings) throw new Error('Provider settings are not initialized.');
					const next = await saveProviderSettings(
						{ spectraGroupCode: input.groupCode as string },
						config.revision
					);
					settings = next;
					config = liveConfig(next);
					if (liveCoordinator.getStatus().provider === 'spectra')
						liveCoordinator.connect('spectra');
				}
				break;
			default:
				throw new Error('Choose a valid provider action.');
		}
		return getLiveSettings();
	});
}
export async function getLiveDiagnostics() {
	await initializeLiveSettings();
	if (!settings) throw new Error('Provider settings are not initialized.');
	const state = liveCoordinator.getState();
	return {
		normalized: state,
		connection: liveCoordinator.getStatus(),
		mapping: liveCoordinator.getMapping(),
		suggestions: state ? suggestMapping(state, binding) : null,
		raw: redactDiagnostics(liveCoordinator.getRaw(), [config.accessKey]),
		config: publicProviderSettings(settings)
	};
}
