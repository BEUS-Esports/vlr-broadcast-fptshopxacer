import type { Handle } from '@sveltejs/kit/hooks';
import { successfulBroadcastMutation } from '#lib/server/broadcast/mutations.ts';
import { broadcastPublisher } from '#lib/server/broadcast/publisher.ts';

// Authentication intentionally deferred: management is authorized only by the trusted LAN boundary.
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const mutation = await successfulBroadcastMutation(event.request, event.route.id, response);
	if (mutation) {
		try {
			await broadcastPublisher.publish();
		} catch (cause) {
			console.error(
				'Broadcast publication failed; clients will resynchronize on reconnect.',
				cause
			);
		}
	}
	return response;
};
