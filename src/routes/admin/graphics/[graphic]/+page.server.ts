import { error } from '@sveltejs/kit';
import { graphicIds, type GraphicId } from '#lib/broadcast/controls.ts';
import type { PageServerLoad } from './$types';
export { actions } from '#lib/server/services/graphics-control.ts';

export const load: PageServerLoad = ({ params }) => {
	if (!graphicIds.includes(params.graphic as GraphicId)) error(404, 'Graphic not found.');
	return { graphic: params.graphic as GraphicId };
};
