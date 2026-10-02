import { expect, it } from 'vitest';
import { isBroadcastMutation } from './mutations';

it('recognizes management POST attempts including refresh, excluding navigation and streaming sync', () => {
	const request = new Request('http://localhost/admin/teams', { method: 'POST' });
	for (const route of [
		'/admin/teams',
		'/admin/players',
		'/admin/resources',
		'/admin/graphics',
		'/admin/tournaments/[tournamentId]',
		'/admin/games/[gameId]',
		'/admin/matches/[matchId]'
	])
		expect(isBroadcastMutation(request, route)).toBe(true);
	expect(
		isBroadcastMutation(
			new Request('http://localhost/admin/resources?/refresh', { method: 'POST' }),
			'/admin/resources'
		)
	).toBe(true);
	expect(isBroadcastMutation(new Request('http://localhost/admin/teams'), '/admin/teams')).toBe(
		false
	);
	for (const route of [null, '/unrelated', '/admin/resources/sync', '/admin/teams-extra'])
		expect(isBroadcastMutation(request, route)).toBe(false);
});
