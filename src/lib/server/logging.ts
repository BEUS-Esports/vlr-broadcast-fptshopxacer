import { finished } from 'node:stream/promises';
import { Logger } from 'tslog';
import { createStream } from 'rotating-file-stream';
import { redactDiagnostics } from './redaction';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

export const logger = new Logger<Record<string, unknown>>({
	name: 'VLR',
	type: 'pretty',
	minLevel: 'INFO',
	stack: { capture: 'off' },
	pretty: {
		template: '{{hh}}:{{MM}}:{{ss}}.{{ms}} {{logLevelName}} [{{name}}] ',
		timeZone: 'local',
		inspectOptions: { breakLength: Infinity },
		levelMethod: {
			DEBUG: (...args) => console.debug(...args),
			INFO: (...args) => console.info(...args),
			WARN: (...args) => console.warn(...args),
			ERROR: (...args) => console.error(...args)
		}
	}
});

// Transport errors can contain sockets, headers and response bodies; copy diagnostic fields only.
function errorDetails(value: unknown, depth = 0): unknown {
	if (depth > 4 || value === null || value === undefined) return undefined;
	if (typeof value === 'string') return value;
	if (typeof value !== 'object') return undefined;
	const source = value as Record<string, unknown>;
	const details: Record<string, unknown> = {};
	const sensitiveMessage =
		value instanceof SyntaxError ||
		/sqlite|libsql|query/i.test(String(source.name ?? '') + String(source.code ?? '')) ||
		'query' in source ||
		'sql' in source;
	for (const key of ['name', 'message', 'code', 'type', 'status', 'statusCode']) {
		if (key === 'message' && sensitiveMessage) continue;
		if (typeof source[key] === 'string' || typeof source[key] === 'number')
			details[key] = source[key];
	}
	for (const key of ['cause', 'description', 'context', 'error', 'responseText']) {
		const nested = source[key];
		if (key === 'responseText' && typeof nested !== 'object') continue;
		if (key === 'description' && typeof nested === 'number') details[key] = nested;
		else if (nested !== undefined) details[key] = errorDetails(nested, depth + 1);
	}
	if (value instanceof Error && typeof value.stack === 'string')
		details.stack = value.stack
			.split(/\r?\n/)
			.filter((line) => /^\s+at /.test(line))
			.slice(0, 8);
	if (value instanceof AggregateError && Array.isArray(value.errors))
		details.errors = value.errors.slice(0, 5).map((error) => errorDetails(error, depth + 1));
	return details;
}

/** Pass operation metadata, never request bodies, headers, SQL or match payloads. */
export function logEvent(
	level: Level,
	event: string,
	fields: Fields = {},
	cause?: unknown,
	secrets: string[] = []
) {
	const details = redactDiagnostics({ ...fields, error: errorDetails(cause) }, secrets);
	const bounded = JSON.parse(
		JSON.stringify(details, (_key, value) =>
			typeof value === 'string' ? value.slice(0, 1024) : value
		)
	);
	const requestId = logger.getContext()?.requestId;
	logger[level](event, {
		...bounded,
		...(typeof requestId === 'string' ? { requestId } : {}),
		event
	});
}

/** One process owns each directory. Ending the returned sink flushes its pending writes. */
export function startFileLogging(directory: string): () => Promise<void> {
	const stream = createStream('app.jsonl', {
		path: directory,
		size: '10M',
		maxFiles: 7,
		mode: 0o600
	});
	let overflowReported = false;
	const detach = logger.attachTransport({
		name: 'jsonl',
		format: 'json',
		write(_record, line) {
			if (stream.writableLength + Buffer.byteLength(line) + 1 > 1024 * 1024) {
				if (!overflowReported) {
					overflowReported = true;
					logEvent('warn', 'logging.file.backpressure', {
						reason: 'File records dropped; disk writes are behind.'
					});
				}
				return;
			}
			stream.write(line + '\n');
		}
	});
	stream.on('drain', () => {
		overflowReported = false;
	});
	stream.on('warning', (cause) => logEvent('warn', 'logging.file.warning', {}, cause));
	stream.on('error', (cause) => {
		detach();
		logEvent('error', 'logging.file.failed', {}, cause);
	});
	const closed = finished(stream, { cleanup: true }).catch(() => {});
	let stopping = false;
	return () => {
		if (!stopping) {
			stopping = true;
			detach();
			stream.end();
		}
		return closed;
	};
}
