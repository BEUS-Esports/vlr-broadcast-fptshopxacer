import { error } from '@sveltejs/kit';
import { graphicIds, type GraphicId } from '#lib/broadcast/controls.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (!graphicIds.includes(params.graphic as GraphicId)) error(404, 'Unknown graphic');
	return { graphic: params.graphic as GraphicId };
};
