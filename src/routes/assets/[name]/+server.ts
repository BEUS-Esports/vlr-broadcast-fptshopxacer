import { error } from '@sveltejs/kit';
import { openAsset } from '#lib/server/assets.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const headers: Record<string, string> = {
		'cache-control': 'public, max-age=31536000, immutable',
		'x-content-type-options': 'nosniff',
		'accept-ranges': 'bytes'
	};
	try {
		const { body, mime, size, start, end, partial } = await openAsset(
			params.name,
			request.headers.get('range')
		);
		headers['content-type'] = mime;
		headers['content-length'] = String(end - start + 1);
		if (partial) headers['content-range'] = `bytes ${start}-${end}/${size}`;
		return new Response(body, { status: partial ? 206 : 200, headers });
	} catch (cause) {
		if (cause instanceof Error && cause.name === 'SaveError' && 'code' in cause) {
			if (cause.code === 'range') {
				const size = (cause as { details?: { size?: number } }).details?.size ?? 0;
				return new Response(null, {
					status: 416,
					headers: { ...headers, 'content-range': `bytes */${size}` }
				});
			}
			error(404, 'Asset not found.');
		}
		if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
			error(404, 'Asset not found.');
		throw cause;
	}
};
