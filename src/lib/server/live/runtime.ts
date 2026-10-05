import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import type { LiveProviderId } from '#lib/live/types.ts';
import {
	defaultConfig,
	loadProviderConfig,
	normalizeConfig,
	publicConfig,
	redactDiagnostics,
	saveProviderConfig
} from './config';
import { createLiveCoordinator } from './coordinator';
import { livePublisher } from './publisher';
import { suggestMapping } from './mapping';
import { startProviderSession, lookupSpectraSupporter } from './transport';

let config = { ...defaultConfig };
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
export function initializeLiveSettings() {
	return (initialized ??= loadProviderConfig().then((saved) => {
		config = saved;
	}));
}
function serialize<T>(operation: () => Promise<T>) {
	const next = queue.then(operation);
	queue = next.catch(() => {});
	return next;
}
export async function getLiveSettings() {
	await initializeLiveSettings();
	return { config: publicConfig(config), status: liveCoordinator.getStatus() };
}
export function configureLiveProvider(
	input: unknown,
	expectedRevision: number,
	connect: LiveProviderId | null
) {
	return serialize(async () => {
		await initializeLiveSettings();
		if (expectedRevision !== config.revision)
			throw new Error('Provider settings changed. Reload before saving.');
		const value = input as Record<string, unknown>;
		const next = normalizeConfig(
			{
				...config,
				...value,
				accessKey:
					value.clearKey === true
						? ''
						: typeof value.accessKey === 'string' && value.accessKey
							? value.accessKey
							: config.accessKey,
				revision: config.revision + 1
			},
			connect === 'spectra'
		);
		await saveProviderConfig(next);
		config = next;
		supporter = null;
		// Endpoint-affecting saves invalidate the session even when it is currently native.
		liveCoordinator.disconnect();
		if (connect) liveCoordinator.connect(connect);
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
					const next = normalizeConfig({
						...config,
						groupCode: input.groupCode,
						revision: config.revision + 1
					});
					await saveProviderConfig(next);
					config = next;
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
	const state = liveCoordinator.getState();
	return {
		normalized: state,
		connection: liveCoordinator.getStatus(),
		mapping: liveCoordinator.getMapping(),
		suggestions: state ? suggestMapping(state, binding) : null,
		raw: redactDiagnostics(liveCoordinator.getRaw(), [config.accessKey]),
		config: publicConfig(config)
	};
}
