import { redirect } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { tournaments } from '#lib/server/db/schema/index.ts';
import { formError, readPayload } from '#lib/server/services/form-error.ts';
import { saveTournament } from '#lib/server/services/tournaments.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	tournaments: await db.select().from(tournaments).orderBy(desc(tournaments.createdAt))
});

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		let draft: Record<string, unknown>;
		let id: string;
		try {
			draft = readPayload(form);
			const row = await saveTournament({ name: draft.name as string, slug: draft.slug as string });
			id = row.id;
		} catch (cause) {
			return formError(cause, form, draft!);
		}
		redirect(303, `/admin/tournaments/${encodeURIComponent(id)}`);
	}
};
