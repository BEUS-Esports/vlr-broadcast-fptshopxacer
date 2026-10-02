import type { Handle } from '@sveltejs/kit/hooks';
import { isBroadcastMutation } from '#lib/server/broadcast/mutations.ts';
import { broadcastPublisher } from '#lib/server/broadcast/publisher.ts';

// Authentication intentionally deferred: management is authorized only by the trusted LAN boundary.
export const handle: Handle = async ({ event, resolve }) => {
	try {
		return await resolve(event);
	} finally {
		// A failed response can follow a committed write; persisted revisions deduplicate rollbacks.
		if (isBroadcastMutation(event.request, event.route.id)) {
			try {
				await broadcastPublisher.publish();
			} catch (cause) {
				console.error(
					'Broadcast publication failed; clients will resynchronize on reconnect.',
					cause
				);
			}
		}
	}
};
