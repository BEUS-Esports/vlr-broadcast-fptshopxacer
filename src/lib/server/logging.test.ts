import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger, logEvent, startFileLogging } from './logging';

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
afterEach(() => {
	detach();
	vi.restoreAllMocks();
});

it('filters debug records and emits bounded, redacted records through the common pipeline', () => {
	logEvent('debug', 'http.completed', { route: '/admin/live' });
	const cause = Object.assign(new Error('x'.repeat(2000) + 'private&key'), {
		code: 'ETIMEDOUT',
		context: {} as Record<string, unknown>
	});
	cause.context.error = cause;
	cause.context.responseText = 'raw-body';
	logEvent(
		'warn',
		'live.failure',
		{ groupCode: 'private-group', apiKey: 'other-secret', note: 'private%26key' },
		cause,
		['private&key']
	);
	expect(records).toHaveLength(1);
	expect(records[0]).toMatchObject({
		level: 'WARN',
		event: 'live.failure',
		error: { code: 'ETIMEDOUT' }
	});
	const record = records[0] as { error: { message: string } };
	expect(record.error.message).toHaveLength(1024);
	for (const secret of [
		'private-group',
		'other-secret',
		'private&key',
		'private%26key',
		'raw-body'
	])
		expect(JSON.stringify(records)).not.toContain(secret);
});

it('keeps concurrent requests correlated across awaits', async () => {
	await Promise.all(
		['a', 'b'].map((requestId) =>
			logger.runInContext({ requestId }, async () => {
				await Promise.resolve();
				logEvent('info', 'operation.completed', { owner: requestId });
			})
		)
	);
	expect(records).toHaveLength(2);
	for (const record of records) expect(record.requestId).toBe(record.owner);
	logEvent('info', 'background.completed');
	expect(records.at(-1)?.requestId).toBeUndefined();
});

it('prints a readable terminal line and writes the same event as JSONL', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-logging-'));
	const output = vi.spyOn(console, 'info').mockImplementation(() => {});
	logger.settings.type = 'pretty';
	const stop = startFileLogging(directory);
	try {
		logEvent('info', 'broadcast.changed', { selectedGameId: 'game-1' });
		await stop();
		const line = await readFile(join(directory, 'app.jsonl'), 'utf8');
		expect(line.trim().split('\n')).toHaveLength(1);
		expect(JSON.parse(line)).toMatchObject({
			event: 'broadcast.changed',
			level: 'INFO',
			selectedGameId: 'game-1'
		});
		expect(output.mock.calls.flat().join(' ')).toContain('broadcast.changed');
		expect(output.mock.calls.flat().join(' ')).toContain('INFO');
	} finally {
		await stop();
		await rm(directory, { recursive: true, force: true });
	}
});

it('rotates oversized files, retains seven archives and keeps unrelated files', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-log-rotation-'));
	await writeFile(join(directory, 'keep.txt'), 'keep');
	try {
		for (let index = 0; index < 8; index++) {
			await writeFile(join(directory, 'app.jsonl'), ' '.repeat(10 * 1024 * 1024));
			const stop = startFileLogging(directory);
			logEvent('info', 'rotation.check');
			await stop();
		}
		const files = await readdir(directory);
		expect(files).toContain('keep.txt');
		expect(files.filter((name) => name !== 'app.jsonl' && name.endsWith('.jsonl'))).toHaveLength(7);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

it('drops excess file records without blocking the shared logger or growing the queue', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-log-pressure-'));
	const stop = startFileLogging(directory);
	try {
		for (let index = 0; index < 1500; index++)
			logEvent('info', 'pressure.check', { note: 'x'.repeat(1024) });
		await stop();
		expect(records.filter((record) => record.event === 'pressure.check')).toHaveLength(1500);
		expect(records.filter((record) => record.event === 'logging.file.backpressure')).toHaveLength(
			1
		);
		expect(Buffer.byteLength(await readFile(join(directory, 'app.jsonl')))).toBeLessThanOrEqual(
			1024 * 1024
		);
	} finally {
		await stop();
		await rm(directory, { recursive: true, force: true });
	}
});

it('omits parse input and SQL values from error diagnostics', () => {
	logEvent('error', 'parse.failed', {}, new SyntaxError('private-input'));
	logEvent(
		'error',
		'save.failed',
		{},
		Object.assign(new Error('private-query'), {
			name: 'DrizzleQueryError',
			cause: Object.assign(new Error('private-parameter'), { code: 'SQLITE_CONSTRAINT' })
		})
	);
	expect(records[0]).toMatchObject({ error: { name: 'SyntaxError' } });
	expect(records[1]).toMatchObject({
		error: { name: 'DrizzleQueryError', cause: { code: 'SQLITE_CONSTRAINT' } }
	});
	expect(JSON.stringify(records)).not.toContain('private-');
});

it('preserves bounded stack frames and individual cleanup failures without error properties', () => {
	const cause = Object.assign(new Error('Cannot delete asset'), {
		code: 'EACCES',
		request: { headers: { authorization: 'private-header' } }
	});
	cause.stack = 'Error: private-stack-header\n    at cleanup (cleanup.ts:12:3)\nprivate-body';
	logEvent('error', 'assets.cleanup.failed', {}, new AggregateError([cause], 'Cleanup failed'));
	expect(records[0]).toMatchObject({
		error: { errors: [{ code: 'EACCES', stack: ['    at cleanup (cleanup.ts:12:3)'] }] }
	});
	expect(JSON.stringify(records)).not.toContain('private-');
});

it('reports file destination failure while keeping application logging usable', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-log-error-'));
	const invalid = join(directory, 'not-a-directory');
	await writeFile(invalid, 'file');
	const stop = startFileLogging(invalid);
	try {
		logEvent('info', 'operation.before');
		await stop();
		logEvent('info', 'operation.after');
		expect(records.map((record) => record.event)).toContain('logging.file.failed');
		expect(records.map((record) => record.event)).toContain('operation.after');
	} finally {
		await stop();
		await rm(directory, { recursive: true, force: true });
	}
});
