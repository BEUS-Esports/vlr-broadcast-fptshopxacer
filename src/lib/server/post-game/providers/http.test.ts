import { describe, expect, it, vi } from 'vitest';
import { requestJson } from './http';

const maxBytes = 20 * 1024 * 1024;
const url = 'https://provider.test/report?key=test-secret';
const encoder = new TextEncoder();

describe('bounded post-game responses', () => {
	it('rejects a declared oversize body without reading it', async () => {
		const cancel = vi.fn();
		const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
			controller.enqueue(encoder.encode('{}'));
			controller.close();
		});
		const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
		const response = new Response(body, { headers: { 'content-length': String(maxBytes + 1) } });
		const result = requestJson(url, 1000, async () => response);
		await expect(result).rejects.toMatchObject({
			code: 'malformed',
			message: 'The provider returned an invalid report.'
		});
		await expect(result).rejects.not.toHaveProperty('cause');
		expect(pull).not.toHaveBeenCalled();
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(body.locked).toBe(false);
	});

	it.each([undefined, '2'])('counts streamed bytes with content-length %s', async (length) => {
		const cancel = vi.fn();
		const chunk = encoder.encode(' '.repeat(1024 * 1024));
		let reads = 0;
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					if (reads === 0) controller.enqueue(encoder.encode('{}'));
					else if (reads <= maxBytes / chunk.byteLength) controller.enqueue(chunk);
					else controller.close();
					reads++;
				},
				cancel
			},
			{ highWaterMark: 0 }
		);
		const response = new Response(body, {
			headers: length ? { 'content-length': length } : undefined
		});
		await expect(requestJson(url, 1000, async () => response)).rejects.toMatchObject({
			code: 'malformed'
		});
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(body.locked).toBe(false);
	});

	it('accepts valid JSON exactly at the byte limit', async () => {
		const response = new Response('{}' + ' '.repeat(maxBytes - 2));
		await expect(requestJson(url, 1000, async () => response)).resolves.toEqual({});
		expect(response.body?.locked).toBe(false);
	});

	it.each(['cancelled', 'timeout'] as const)(
		'ends a stalled body read on %s even if upstream cancellation never settles',
		async (code) => {
			const started = Promise.withResolvers<void>();
			const cancel = vi.fn(() => new Promise<void>(() => {}));
			const body = new ReadableStream<Uint8Array>(
				{ pull: () => started.resolve(), cancel },
				{ highWaterMark: 0 }
			);
			const controller = new AbortController();
			const result = requestJson(
				url,
				code === 'timeout' ? 20 : 1000,
				async () => new Response(body),
				controller.signal
			);
			const rejected = expect(result).rejects.toMatchObject({ code });
			await started.promise;
			if (code === 'cancelled') controller.abort(new Error('test-secret'));
			await rejected;
			await expect(result).rejects.not.toHaveProperty('cause');
			expect(cancel).toHaveBeenCalledTimes(1);
			expect(body.locked).toBe(false);
		},
		500
	);

	it('cancels HTTP error bodies without reading them or leaking cleanup errors', async () => {
		const pull = vi.fn();
		const cancel = vi.fn(async () => {
			throw new Error('test-secret');
		});
		const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
		const result = requestJson(url, 1000, async () => new Response(body, { status: 429 }));
		await expect(result).rejects.toMatchObject({ code: 'rate-limit' });
		await expect(result).rejects.not.toHaveProperty('cause');
		expect(pull).not.toHaveBeenCalled();
		expect(cancel).toHaveBeenCalledTimes(1);
	});
});
