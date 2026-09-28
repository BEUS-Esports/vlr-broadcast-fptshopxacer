import { redirect } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { teams } from '#lib/server/db/schema/index.ts';
import { removeAsset, saveUpload } from '#lib/server/assets.ts';
import { field, formError } from '#lib/server/services/form-error.ts';
import { removeProfile, saveTeam } from '#lib/server/services/profiles.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const rows = await db.select().from(teams).orderBy(asc(teams.name));
	return {
		teams: rows,
		selected: rows.find((row) => row.id === url.searchParams.get('edit')) ?? null
	};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const form = await request.formData();
		const uploaded: string[] = [];
		let id: string;
		try {
			async function image(name: string) {
				const path = await saveUpload(form.get(name));
				if (path) uploaded.push(path);
				return path;
			}
			const row = await saveTeam({
				id: field(form, 'id') || undefined,
				revision: Number(field(form, 'revision')),
				name: field(form, 'name'),
				tag: field(form, 'tag'),
				logoPath: await image('logo'),
				logoWhitePath: await image('logoWhite'),
				logoBlackPath: await image('logoBlack')
			});
			id = row.id;
		} catch (cause) {
			await Promise.all(uploaded.map(removeAsset));
			return formError(cause, form);
		}
		redirect(303, `/admin/teams?edit=${encodeURIComponent(id)}`);
	},
	delete: async ({ request }) => {
		const form = await request.formData();
		try {
			await removeProfile('team', field(form, 'id'), Number(field(form, 'revision')));
		} catch (cause) {
			return formError(cause, form);
		}
		redirect(303, '/admin/teams');
	}
};
