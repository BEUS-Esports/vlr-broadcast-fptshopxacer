import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getLiveDiagnostics,
	operateLiveProvider,
	syncLiveBinding
} from '#lib/server/live/runtime.ts';
import { buildBroadcastSnapshot } from '#lib/server/broadcast/snapshot.ts';

const headers = { 'cache-control': 'no-store' };
/** Admin diagnostics follow the application's existing trusted-LAN management boundary. */
export const GET: RequestHandler = async () => json(await getLiveDiagnostics(), { headers });
export const POST: RequestHandler = async ({ request, url }) => {
	if (
		request.headers.get('origin') !== url.origin ||
		!request.headers.get('content-type')?.startsWith('application/json')
	)
		return json(
			{ error: 'Use the local controller to change the live session.' },
			{ status: 403, headers }
		);
	try {
		const text = await request.text();
		if (text.length > 16384)
			return json({ error: 'Provider action is too large.' }, { status: 413, headers });
		const input: unknown = JSON.parse(text);
		if (!input || typeof input !== 'object' || Array.isArray(input))
			throw new Error('Invalid provider action.');
		syncLiveBinding(await buildBroadcastSnapshot());
		return json(await operateLiveProvider(input as Record<string, unknown>), { headers });
	} catch (cause) {
		return json(
			{ error: cause instanceof Error ? cause.message : 'Could not update the provider session.' },
			{ status: 409, headers }
		);
	}
};
