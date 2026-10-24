import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getLiveDiagnostics,
	operateLiveProvider,
	syncLiveBinding
} from '#lib/server/live/runtime.ts';
import { buildBroadcastSnapshot } from '#lib/server/broadcast/snapshot.ts';
import { logEvent } from '#lib/server/logging.ts';

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
	let action = 'invalid';
	try {
		const text = await request.text();
		if (text.length > 16384)
			return json({ error: 'Provider action is too large.' }, { status: 413, headers });
		const input: unknown = JSON.parse(text);
		if (!input || typeof input !== 'object' || Array.isArray(input))
			throw new Error('Invalid provider action.');
		const value = input as Record<string, unknown>;
		if (
			typeof value.action === 'string' &&
			['connect', 'disconnect', 'native', 'external', 'mapping', 'group'].includes(value.action)
		)
			action = value.action;
		syncLiveBinding(await buildBroadcastSnapshot());
		const result = await operateLiveProvider(value);
		logEvent('info', 'live.action.completed', { action });
		return json(result, { headers });
	} catch (cause) {
		logEvent(
			'warn',
			'live.action.failed',
			{ action },
			cause instanceof SyntaxError ? cause : undefined
		);
		return json(
			{ error: cause instanceof Error ? cause.message : 'Could not update the provider session.' },
			{ status: 409, headers }
		);
	}
};
