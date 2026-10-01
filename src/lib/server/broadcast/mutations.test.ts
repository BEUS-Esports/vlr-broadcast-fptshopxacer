import { expect, it } from 'vitest';

it('recognizes successful management writes and controls without publishing failures or navigation', async () => {
	const { successfulBroadcastMutation } = await import('./mutations');
	const request = new Request('http://localhost/admin/teams', { method: 'POST' });
	for (const route of [
		'/admin/teams',
		'/admin/players',
		'/admin/resources',
		'/admin/tournaments/[tournamentId]',
		'/admin/games/[gameId]',
		'/admin/matches/[matchId]'
	]) {
		expect(
			await successfulBroadcastMutation(request, route, new Response('', { status: 303 }))
		).toBe(true);
	}
	const json = (body: unknown) =>
		new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
	for (const type of ['failure', 'error'])
		expect(
			await successfulBroadcastMutation(request, '/admin/games/[gameId]', json({ type }))
		).toBe(false);
	for (const status of [400, 422, 500])
		expect(
			await successfulBroadcastMutation(
				request,
				'/admin/games/[gameId]',
				new Response('', { status })
			)
		).toBe(false);
	for (const type of ['success', 'redirect'])
		expect(
			await successfulBroadcastMutation(request, '/admin/games/[gameId]', json({ type }))
		).toBe(true);
	const get = new Request('http://localhost/admin/teams');
	expect(await successfulBroadcastMutation(get, '/admin/teams', new Response())).toBe(false);
	expect(await successfulBroadcastMutation(request, '/unrelated', new Response())).toBe(false);
	expect(await successfulBroadcastMutation(request, '/admin/resources/sync', new Response())).toBe(
		false
	);
	expect(
		await successfulBroadcastMutation(request, '/admin/graphics', json({ type: 'success' }))
	).toBe(true);
});
