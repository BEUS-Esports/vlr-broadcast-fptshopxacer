import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './+server';
import { logger } from '#lib/server/logging.ts';

const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock('#lib/server/services/resources.ts', () => ({ syncResourceKind: sync }));
vi.mock('#lib/server/broadcast/publisher.ts', () => ({ broadcastPublisher: { publish: vi.fn() } }));
afterEach(() => vi.restoreAllMocks());

it('logs sync success and failure explicitly when both responses open with HTTP 200', async () => {
	logger.settings.type = 'hidden';
	const records: Record<string, unknown>[] = [];
	const detach = logger.attachTransport({
		format: 'json',
		write: (_record, line) => {
			records.push(JSON.parse(line));
		}
	});
	try {
		sync.mockResolvedValueOnce({ count: 3 });
		const response = await POST({
			url: new URL('http://localhost/admin/resources/sync?kind=map')
		} as never);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('"type":"done"');
		expect(records).toContainEqual(
			expect.objectContaining({ event: 'resources.sync.completed', kind: 'map', count: 3 })
		);
		sync.mockRejectedValueOnce(new SyntaxError('private-response-body'));
		const failure = await POST({
			url: new URL('http://localhost/admin/resources/sync?kind=map')
		} as never);
		expect(failure.status).toBe(200);
		expect(await failure.text()).toContain('"type":"error"');
		expect(records).toContainEqual(
			expect.objectContaining({ event: 'resources.sync.failed', kind: 'map', level: 'ERROR' })
		);
		expect(records.filter((record) => record.event === 'resources.sync.completed')).toHaveLength(1);
		expect(JSON.stringify(records)).not.toContain('private-response-body');
	} finally {
		detach();
	}
});
