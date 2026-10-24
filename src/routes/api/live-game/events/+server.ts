import type { RequestHandler } from './$types';
import { livePublisher, createLiveResponse } from '#lib/server/live/publisher.ts';
import { initializeLiveSettings } from '#lib/server/live/runtime.ts';

/** Public, read-only and credential-free. Subscribing never starts an upstream session. */
export const GET: RequestHandler = async ({ request }) => {
	await initializeLiveSettings();
	return createLiveResponse(livePublisher, request.signal);
};
export const HEAD: RequestHandler = () =>
	new Response(null, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }
	});
