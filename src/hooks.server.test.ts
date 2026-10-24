import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import { handle, handleError, init } from './hooks.server';
import { logger, logEvent } from './lib/server/logging';
import { formError } from './lib/server/services/form-error';
import { SaveError } from './lib/server/services/save-error';
import { startAssetCleanup } from './lib/server/asset-cleanup';

vi.mock('$app/env/private', () => ({ LOG_LEVEL: 'debug', LOG_DIR: undefined }));
vi.mock('#lib/server/asset-cleanup.ts', () => ({ startAssetCleanup: vi.fn(() => vi.fn()) }));
vi.mock('#lib/server/broadcast/publisher.ts', () => ({ broadcastPublisher: { publish: vi.fn() } }));
vi.mock('#lib/server/live/runtime.ts', () => ({ syncLiveBinding: vi.fn() }));

let records: Record<string, unknown>[];
let detach: () => void;
beforeEach(() => {
	logger.settings.type = 'hidden';
	logger.setMinLevel('INFO');
	records = [];
	detach = logger.attachTransport({
		format: 'json',
		write: (_record, line) => {
			records.push(JSON.parse(line));
		}
	});
});
afterEach(() => detach());

it('applies declared logging environment settings and closes on adapter shutdown', async () => {
	await init();
	logEvent('debug', 'configured.debug');
	expect(records).toContainEqual(
		expect.objectContaining({ event: 'configured.debug', level: 'DEBUG' })
	);
	const shutdown = getEventListeners(process, 'sveltekit:shutdown').at(-1) as () => Promise<void>;
	try {
		await shutdown();
		expect(vi.mocked(startAssetCleanup).mock.results.at(-1)?.value).toHaveBeenCalledOnce();
		expect(records.at(-1)).toMatchObject({ event: 'server.stopping' });
	} finally {
		process.off('sveltekit:shutdown', shutdown);
	}
});

async function run(method: string, status: number, operation = () => {}) {
	const response = new Response('original', { status });
	const result = await handle({
		event: {
			locals: {},
			route: { id: '/test/[id]' },
			request: new Request('http://localhost/test/private-path?/save&token=private-query', {
				method,
				headers: { authorization: 'private-header' }
			})
		},
		resolve: async () => {
			await Promise.resolve();
			operation();
			return response;
		}
	} as unknown as Parameters<typeof handle>[0]);
	expect(result).toBe(response);
}

it('correlates concurrent operations and logs route patterns, without request content', async () => {
	await Promise.all(
		[201, 202].map((status) =>
			run('POST', status, () => logEvent('info', 'operation.test', { status }))
		)
	);
	for (const status of [201, 202]) {
		const pair = records.filter((record) => record.status === status);
		expect(pair).toHaveLength(2);
		expect(pair[0].requestId).toEqual(expect.any(String));
		expect(pair[0].requestId).toBe(pair[1].requestId);
	}
	expect(records[0].requestId).not.toBe(records[1].requestId);
	expect(records.find((record) => record.event === 'http.completed')).toMatchObject({
		route: '/test/[id]',
		action: 'save',
		durationMs: expect.any(Number)
	});
	expect(JSON.stringify(records)).not.toContain('private-');
});

it('keeps successful reads at debug and logs HTTP and enhanced-form failures', async () => {
	await run('GET', 200);
	expect(records).toHaveLength(0);
	await run('GET', 404);
	await run('POST', 200, () => {
		formError(new SaveError('stale', 'private-draft'));
	});
	expect(records).toContainEqual(
		expect.objectContaining({ event: 'http.completed', level: 'WARN', status: 404 })
	);
	expect(records).toContainEqual(
		expect.objectContaining({ event: 'form.rejected', code: 'stale', status: 409 })
	);
	expect(JSON.stringify(records)).not.toContain('private-draft');
	logger.setMinLevel('DEBUG');
	await run('GET', 200);
	expect(records.at(-1)).toMatchObject({ event: 'http.completed', level: 'DEBUG' });
});

it('logs server errors without overriding framework responses or exposing parse input', () => {
	const event = { request: new Request('http://localhost/'), locals: {}, route: { id: null } };
	expect(
		handleError({ kind: 'unknown', error: new SyntaxError('private-body'), event } as Parameters<
			typeof handleError
		>[0])
	).toBeUndefined();
	expect(records[0]).toMatchObject({
		event: 'http.error',
		level: 'ERROR',
		error: { name: 'SyntaxError' }
	});
	expect(JSON.stringify(records)).not.toContain('private-body');
	expect(
		handleError({
			kind: 'framework',
			error: { status: 404, message: 'Not Found' },
			event
		} as Parameters<typeof handleError>[0])
	).toBeUndefined();
});

it('keeps error correlation after the request hook has unwound', async () => {
	const cause = new Error('unexpected failure');
	const event = { locals: {}, request: new Request('http://localhost/'), route: { id: null } };
	await expect(
		handle({
			event,
			resolve: async () => {
				throw cause;
			}
		} as unknown as Parameters<typeof handle>[0])
	).rejects.toBe(cause);
	handleError({ kind: 'unknown', error: cause, event } as Parameters<typeof handleError>[0]);
	expect(records).toHaveLength(2);
	expect(records[0].requestId).toEqual(expect.any(String));
	expect(records[1].requestId).toBe(records[0].requestId);
});
