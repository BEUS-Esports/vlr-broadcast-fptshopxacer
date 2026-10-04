import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadLiveResources } from '#lib/server/live/resources.ts';
export const GET: RequestHandler = async () =>
	json(await loadLiveResources(), { headers: { 'cache-control': 'no-cache' } });
