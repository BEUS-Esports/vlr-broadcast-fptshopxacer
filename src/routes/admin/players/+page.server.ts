import { redirect } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { players } from '#lib/server/db/schema/index.ts';
import { removeAsset, saveUpload } from '#lib/server/assets.ts';
import { field, formError } from '#lib/server/services/form-error.ts';
import { removeProfile, savePlayer } from '#lib/server/services/profiles.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const rows = await db.select().from(players).orderBy(asc(players.displayName));
	return {
		players: rows,
		selected: rows.find((row) => row.id === url.searchParams.get('edit')) ?? null
	};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const form = await request.formData();
		let uploaded: string | null = null;
		let id: string;
		try {
			uploaded = await saveUpload(form.get('portrait'));
			const row = await savePlayer({
				id: field(form, 'id') || undefined,
				revision: Number(field(form, 'revision')),
				displayName: field(form, 'displayName'),
				fullName: field(form, 'fullName'),
				riotId: field(form, 'riotId'),
				portraitPath: uploaded
			});
			id = row.id;
		} catch (cause) {
			if (uploaded) await removeAsset(uploaded);
			return formError(cause, form);
		}
		redirect(303, `/admin/players?edit=${encodeURIComponent(id)}`);
	},
	delete: async ({ request }) => {
		const form = await request.formData();
		try {
			await removeProfile('player', field(form, 'id'), Number(field(form, 'revision')));
		} catch (cause) {
			return formError(cause, form);
		}
		redirect(303, '/admin/players');
	}
};
