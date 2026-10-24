import { randomUUID } from 'node:crypto';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { LOG_DIR, LOG_LEVEL } from '$app/env/private';
import { startAssetCleanup } from '#lib/server/asset-cleanup.ts';
import { isBroadcastMutation } from '#lib/server/broadcast/mutations.ts';
import { broadcastPublisher } from '#lib/server/broadcast/publisher.ts';
import { syncLiveBinding } from '#lib/server/live/runtime.ts';
import { logger, logEvent, startFileLogging } from '#lib/server/logging.ts';

export const init: ServerInit = () => {
	if (building) return;
	const levels = { debug: 'DEBUG', info: 'INFO', warn: 'WARN', error: 'ERROR' } as const;
	const level = LOG_LEVEL?.toLowerCase() ?? 'info';
	logger.setMinLevel(Object.hasOwn(levels, level) ? levels[level as keyof typeof levels] : 'INFO');
	const stopLogging = LOG_DIR ? startFileLogging(LOG_DIR) : undefined;
	const stop = startAssetCleanup();
	const shutdown = async () => {
		stop();
		logEvent('info', 'server.stopping');
		await stopLogging?.();
		await logger.flush();
	};
	process.once('sveltekit:shutdown', shutdown);
	import.meta.hot?.dispose(() => {
		process.off('sveltekit:shutdown', shutdown);
		void shutdown();
	});
	logEvent('info', 'server.started', { fileLogging: !!stopLogging });
};

// Authentication intentionally deferred: management is authorized only by the trusted LAN boundary.
export const handle: Handle = ({ event, resolve }) => {
	const requestId = randomUUID();
	event.locals.requestId = requestId;
	return logger.runInContext({ requestId }, async () => {
		const startedAt = performance.now();
		const { method } = event.request;
		const actionKey = [...new URL(event.request.url).searchParams.keys()].find((key) =>
			/^\/[a-zA-Z][\w-]{0,63}$/.test(key)
		);
		const fields = { method, route: event.route.id, action: actionKey?.slice(1) };
		let status = 500;
		try {
			const response = await resolve(event);
			status = response.status;
			return response;
		} finally {
			// A failed response can follow a committed write; persisted revisions deduplicate rollbacks.
			if (isBroadcastMutation(event.request, event.route.id)) {
				try {
					const snapshot = await broadcastPublisher.publish();
					syncLiveBinding(snapshot);
				} catch (cause) {
					logEvent('error', 'broadcast.publish.failed', fields, cause);
				}
			}
			const level =
				status >= 500
					? 'error'
					: status >= 400
						? 'warn'
						: ['GET', 'HEAD', 'OPTIONS'].includes(method)
							? 'debug'
							: 'info';
			logEvent(level, 'http.completed', {
				...fields,
				status,
				durationMs: Math.round(performance.now() - startedAt)
			});
		}
	});
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
	logEvent(
		kind === 'unknown' ? 'error' : 'warn',
		'http.error',
		{
			kind,
			requestId: event.locals.requestId,
			method: event.request.method,
			route: event.route.id
		},
		kind === 'unknown' ? error : undefined
	);
};
