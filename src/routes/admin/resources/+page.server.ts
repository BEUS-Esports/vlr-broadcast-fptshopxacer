import { fail, redirect } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { agents, maps, weapons } from '#lib/server/db/schema/index.ts';
import { field, formError } from '#lib/server/services/form-error.ts';
import { refreshCatalogue, removeResource, saveResource } from '#lib/server/services/resources.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import { broadcastPublisher } from '#lib/server/broadcast/publisher.ts';
import type { Actions, PageServerLoad } from './$types';

function validKind(kind: string): kind is 'map' | 'agent' | 'weapon' {
	return kind === 'map' || kind === 'agent' || kind === 'weapon';
}

function tabFor(kind: 'map' | 'agent' | 'weapon') {
	return kind === 'map' ? 'maps' : kind === 'agent' ? 'agents' : 'weapons';
}

export const load: PageServerLoad = async ({ url }) => {
	const [mapRows, agentRows, weaponRows] = await Promise.all([
		db.select().from(maps).orderBy(asc(maps.displayName)),
		db.select().from(agents).orderBy(asc(agents.displayName)),
		db.select().from(weapons).orderBy(asc(weapons.displayName))
	]);
	return {
		maps: mapRows,
		agents: agentRows,
		weapons: weaponRows,
		selectedMap: mapRows.find((row) => row.id === url.searchParams.get('map')) ?? null,
		selectedAgent: agentRows.find((row) => row.id === url.searchParams.get('agent')) ?? null,
		selectedWeapon: weaponRows.find((row) => row.id === url.searchParams.get('weapon')) ?? null,
		refreshed: url.searchParams.has('refreshed')
	};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const form = await request.formData();
		const kind = field(form, 'kind');
		if (!validKind(kind))
			return formError(new SaveError('invalid', 'Invalid resource kind.'), form);
		let id: string;
		try {
			const row = await saveResource({
				kind,
				id: field(form, 'id') || undefined,
				revision: Number(field(form, 'revision')),
				key: field(form, 'key'),
				displayName: field(form, 'displayName'),
				roleName: field(form, 'roleName'),
				category: field(form, 'category'),
				isActive: form.has('isActive')
			});
			id = row.id;
		} catch (cause) {
			return formError(cause, form);
		}
		redirect(303, `/admin/resources?tab=${tabFor(kind)}&${kind}=${encodeURIComponent(id)}`);
	},
	delete: async ({ request }) => {
		const form = await request.formData();
		const kind = field(form, 'kind');
		if (!validKind(kind))
			return formError(new SaveError('invalid', 'Invalid resource kind.'), form);
		try {
			await removeResource(kind, field(form, 'id'), Number(field(form, 'revision')));
		} catch (cause) {
			return formError(cause, form);
		}
		redirect(303, `/admin/resources?tab=${tabFor(kind)}`);
	},
	refresh: async () => {
		try {
			await refreshCatalogue();
		} catch (cause) {
			if (cause instanceof SaveError) return formError(cause);
			return fail(502, {
				error: 'Catalogue refresh failed. Saved resources were kept; try again later.'
			});
		} finally {
			// Each resource kind commits separately; a later failure may leave changed on-air data.
			try {
				await broadcastPublisher.publish();
			} catch (cause) {
				console.error(
					'Catalogue refresh broadcast publication failed; clients will resynchronize.',
					cause
				);
			}
		}
		redirect(303, '/admin/resources?refreshed=1');
	}
};
