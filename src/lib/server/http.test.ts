import { describe, expect, it, vi } from 'vitest';
import { boundedText } from './http';

describe('bounded response text', () => {
	it.each([4, 5])(
		'counts UTF-8 bytes across chunk boundaries with a %i-byte limit',
		async (limit) => {
			const bytes = new TextEncoder().encode('a🙂');
			const body = new ReadableStream({
				start(controller) {
					controller.enqueue(bytes.slice(0, 3));
					controller.enqueue(bytes.slice(3));
					controller.close();
				}
			});
			const result = boundedText(new Response(body), new AbortController().signal, limit);
			if (limit === 5) await expect(result).resolves.toBe('a🙂');
			else await expect(result).rejects.toThrow('Response size limit');
			expect(body.locked).toBe(false);
		}
	);

	it('rejects malformed UTF-8 and releases the reader', async () => {
		const response = new Response(new Uint8Array([0xff]));
		await expect(boundedText(response, new AbortController().signal, 10)).rejects.toThrow();
		expect(response.body?.locked).toBe(false);
	});

	it('cancels an already-aborted read without pulling body data', async () => {
		const controller = new AbortController();
		controller.abort();
		const cancel = vi.fn();
		const pull = vi.fn();
		const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
		await expect(boundedText(new Response(body), controller.signal, 10)).rejects.toThrow();
		expect(pull).not.toHaveBeenCalled();
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(body.locked).toBe(false);
	});

	it('releases the reader when the stream fails', async () => {
		const failure = new Error('Stream failed');
		const body = new ReadableStream({
			pull(controller) {
				controller.error(failure);
			}
		});
		await expect(boundedText(new Response(body), new AbortController().signal, 10)).rejects.toBe(
			failure
		);
		expect(body.locked).toBe(false);
	});

	it('handles a response with no body', async () => {
		await expect(boundedText(new Response(null), new AbortController().signal, 10)).resolves.toBe(
			''
		);
	});
});
