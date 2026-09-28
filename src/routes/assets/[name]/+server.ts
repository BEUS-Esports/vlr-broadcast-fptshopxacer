import { error } from '@sveltejs/kit';
import { readAsset } from '#lib/server/assets.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { bytes, mime } = await readAsset(params.name);
		return new Response(bytes, {
			headers: {
				'content-type': mime,
				'cache-control': 'public, max-age=31536000, immutable',
				'x-content-type-options': 'nosniff'
			}
		});
	} catch (cause) {
		if (
			cause instanceof Error &&
			(('code' in cause && cause.code === 'ENOENT') || cause.name === 'SaveError')
		)
			error(404, 'Asset not found.');
		throw cause;
	}
};
