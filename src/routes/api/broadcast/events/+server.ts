import type { RequestHandler } from './$types';
import { broadcastPublisher, createBroadcastResponse } from '#lib/server/broadcast/publisher.ts';

/** Public, read-only complete snapshots. No upstream provider connection is opened here. */
export const GET: RequestHandler = ({ request }) =>
	createBroadcastResponse(broadcastPublisher, request.signal);

// Avoid creating a live subscription for automatic HEAD requests.
export const HEAD: RequestHandler = () =>
	new Response(null, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }
	});
