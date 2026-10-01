import { expect, test } from '@playwright/test';
import type { BroadcastSnapshot } from '../src/lib/broadcast/types';

test('native EventSource receives a complete snapshot, a committed management update, and reconnect resync', async ({
	page,
	request
}) => {
	await page.goto('/admin');
	const result = await page.evaluate(async () => {
		function next(source: EventSource) {
			return new Promise<BroadcastSnapshot>((resolve, reject) => {
				const timeout = setTimeout(() => {
					source.close();
					reject(new Error('Snapshot timed out'));
				}, 10000);
				source.addEventListener(
					'snapshot',
					(event) => {
						clearTimeout(timeout);
						resolve(JSON.parse(event.data));
					},
					{ once: true }
				);
			});
		}
		const source = new EventSource('/api/broadcast/events');
		const initial = await next(source);
		const publication = next(source);
		const response = await fetch('/admin/teams?/save', {
			method: 'POST',
			body: new URLSearchParams({ name: 'SSE integration team', tag: 'SSE' })
		});
		if (!response.ok) {
			source.close();
			throw new Error('Management save failed');
		}
		const updated = await publication;
		source.close();
		const reconnect = new EventSource('/api/broadcast/events');
		const resync = await next(reconnect);
		reconnect.close();
		return { initial, updated, resync };
	});
	expect(result.initial.version).toBe(1);
	expect(result.updated.revision).toBeGreaterThan(result.initial.revision);
	expect(result.resync.revision).toBeGreaterThanOrEqual(result.updated.revision);
	expect(result.resync.scopes.tournament.statistics.scope).toBe('tournament');
	expect(
		(
			await request.post('/api/broadcast/events', { headers: { origin: 'http://localhost:4173' } })
		).status()
	).toBe(405);
	expect((await request.head('/api/broadcast/events')).headers()['content-type']).toBe(
		'text/event-stream'
	);
});
