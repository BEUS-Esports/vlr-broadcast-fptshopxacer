import { field, formError } from '#lib/server/services/form-error.ts';
import {
	deleteStinger,
	listStingers,
	loadStingerSettings,
	setActiveStinger,
	updateStinger
} from '#lib/server/settings/stingers.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	stingers: await listStingers(),
	settings: await loadStingerSettings()
});

export const actions: Actions = {
	update: async ({ request }) => {
		const form = await request.formData();
		try {
			await updateStinger(
				field(form, 'id'),
				{
					name: field(form, 'name'),
					durationMs: Number(field(form, 'durationMs')),
					cutPointMs: Number(field(form, 'cutPointMs'))
				},
				Number(field(form, 'revision'))
			);
			return { saved: true };
		} catch (cause) {
			return formError(cause, form);
		}
	},
	// The file stays on disk for the cleanup job, so a stinger that is on air keeps playing.
	remove: async ({ request }) => {
		const form = await request.formData();
		try {
			await deleteStinger(field(form, 'id'));
			return { saved: true };
		} catch (cause) {
			return formError(cause, form);
		}
	},
	activate: async ({ request }) => {
		const form = await request.formData();
		try {
			await setActiveStinger(field(form, 'id') || null, Number(field(form, 'revision')));
			return { saved: true };
		} catch (cause) {
			return formError(cause, form);
		}
	}
};
