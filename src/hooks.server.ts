import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { startAssetCleanup } from '#lib/server/asset-cleanup.ts';
import { isBroadcastMutation } from '#lib/server/broadcast/mutations.ts';
import { broadcastPublisher } from '#lib/server/broadcast/publisher.ts';
import { syncLiveBinding } from '#lib/server/live/runtime.ts';

export const init: ServerInit = () => {
	if (building) return;
	const stop = startAssetCleanup();
	import.meta.hot?.dispose(stop);
};

// Authentication intentionally deferred: management is authorized only by the trusted LAN boundary.
export const handle: Handle = async ({ event, resolve }) => {
	try {
		return await resolve(event);
	} finally {
		// A failed response can follow a committed write; persisted revisions deduplicate rollbacks.
		if (isBroadcastMutation(event.request, event.route.id)) {
			try {
				const snapshot = await broadcastPublisher.publish();
				syncLiveBinding(snapshot);
			} catch (cause) {
				console.error(
					'Broadcast publication failed; clients will resynchronize on reconnect.',
					cause
				);
			}
		}
	}
};
