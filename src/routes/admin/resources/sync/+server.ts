import type { RequestHandler } from './$types';
import { syncResourceKind, type ResourceKind } from '#lib/server/services/resources.ts';
import { SaveError } from '#lib/server/services/save-error.ts';

const encoder = new TextEncoder();

function validKind(value: string | null): value is ResourceKind {
	return value === 'map' || value === 'agent' || value === 'weapon';
}

export const POST: RequestHandler = async ({ url }) => {
	const kind = url.searchParams.get('kind');
	if (!validKind(kind)) {
		return new Response(JSON.stringify({ type: 'error', message: 'Invalid resource kind.' }) + '\n', {
			status: 400,
			headers: { 'content-type': 'application/x-ndjson; charset=utf-8' }
		});
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: object) => {
				controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
			};

			try {
				const result = await syncResourceKind(kind, (progress) =>
					send({ type: 'progress', ...progress })
				);
				send({
					type: 'done',
					kind,
					count: result.count,
					message: `Synced ${result.count} ${kind === 'weapon' ? 'weapons' : `${kind}s`}.`
				});
			} catch (cause) {
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
