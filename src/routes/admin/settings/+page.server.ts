import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	configureLiveProvider,
	getLiveSettings,
	syncLiveBinding
} from '#lib/server/live/runtime.ts';
import { buildBroadcastSnapshot } from '#lib/server/broadcast/snapshot.ts';

export const load: PageServerLoad = async () => getLiveSettings();
export const actions: Actions = {
	connect: async ({ request }) => {
		try {
			const form = await request.formData();
			const field = (name: string) =>
				typeof form.get(name) === 'string' ? (form.get(name) as string) : '';
			const provider = field('provider');
			if (provider !== 'spectra' && provider !== 'gstack')
				return fail(400, { error: 'Choose a provider.' });
			syncLiveBinding(await buildBroadcastSnapshot());
			await configureLiveProvider(
				{
					spectraRegion: field('spectraRegion'),
					spectraHost: field('spectraHost'),
					groupCode: field('groupCode'),
					accessKey: field('accessKey'),
					clearKey: field('clearKey') === 'on',
					gstackUrl: field('gstackUrl')
				},
				Number(field('revision')),
				provider
			);
			return { saved: true };
		} catch {
			// Never pass this form to formError: it echoes submitted values, including the access key.
			return fail(400, {
				error:
					'Could not save provider settings. Check the addresses and group code, then reload if another operator changed them.'
			});
		}
	}
};
