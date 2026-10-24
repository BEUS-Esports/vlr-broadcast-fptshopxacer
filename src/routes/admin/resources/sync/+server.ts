import type { RequestHandler } from './$types';
import { syncResourceKind, type ResourceKind } from '#lib/server/services/resources.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import { broadcastPublisher } from '#lib/server/broadcast/publisher.ts';
import { logEvent } from '#lib/server/logging.ts';

const encoder = new TextEncoder();

function validKind(value: string | null): value is ResourceKind {
	return value === 'map' || value === 'agent' || value === 'weapon';
}

export const POST: RequestHandler = async ({ url }) => {
	const kind = url.searchParams.get('kind');
	if (!validKind(kind)) {
		return new Response(
			JSON.stringify({ type: 'error', message: 'Invalid resource kind.' }) + '\n',
			{
				status: 400,
				headers: { 'content-type': 'application/x-ndjson; charset=utf-8' }
			}
		);
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const startedAt = performance.now();
			logEvent('info', 'resources.sync.started', { kind });
			const send = (event: object) => {
				controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
			};

			try {
				const result = await syncResourceKind(kind, (progress) =>
					send({ type: 'progress', ...progress })
				);
				try {
					await broadcastPublisher.publish();
				} catch (cause) {
					logEvent('error', 'broadcast.publish.failed', { kind }, cause);
				}
				logEvent('info', 'resources.sync.completed', {
					kind,
					count: result.count,
					durationMs: Math.round(performance.now() - startedAt)
				});
				send({
					type: 'done',
					kind,
					count: result.count,
					message: `Synced ${result.count} ${kind === 'weapon' ? 'weapons' : `${kind}s`}.`
				});
			} catch (cause) {
				logEvent(
					'error',
					'resources.sync.failed',
					{ kind, durationMs: Math.round(performance.now() - startedAt) },
					cause
				);
				send({
					type: 'error',
					message:
						cause instanceof SaveError
							? cause.message
							: 'Catalogue sync failed. Existing resources and downloaded images were kept.'
				});
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'application/x-ndjson; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
};
