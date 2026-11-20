import { json } from '@sveltejs/kit';
import { removeAsset, saveStingerStream } from '#lib/server/assets.ts';
import { logEvent } from '#lib/server/logging.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import { createStinger, validateStingerTiming } from '#lib/server/settings/stingers.ts';
import type { RequestHandler } from './$types';

function rejection(cause: unknown) {
	if (cause instanceof SaveError) {
		logEvent('warn', 'stinger.upload.failed', { reason: cause.code });
		return json({ error: cause.message }, { status: 400 });
	}
	logEvent('error', 'stinger.upload.failed', { reason: 'unexpected' }, cause);
	return json({ error: 'The upload failed. Try again.' }, { status: 500 });
}

/** Raw file body; the name and timing travel in the query so the body can stream straight to disk. */
export const POST: RequestHandler = async ({ request, url }) => {
	let timing;
	try {
		timing = validateStingerTiming({
			name: url.searchParams.get('name') ?? '',
			durationMs: Number(url.searchParams.get('durationMs') ?? ''),
			cutPointMs: Number(url.searchParams.get('cutPointMs') ?? '')
		});
	} catch (cause) {
		return rejection(cause);
	}
	if (!request.body) return rejection(new SaveError('invalid', 'Choose a stinger file.'));

	let saved;
	try {
		saved = await saveStingerStream(request.body);
	} catch (cause) {
		return rejection(cause);
	}
	try {
		const stinger = await createStinger({ ...timing, ...saved });
		return json({ id: stinger.id }, { status: 201 });
	} catch (cause) {
		await removeAsset(saved.path);
		return rejection(cause);
	}
};
