export async function boundedText(
	response: Response,
	signal: AbortSignal,
	maxBytes: number
): Promise<string> {
	const length = response.headers.get('content-length');
	if (length && Number(length) > maxBytes) {
		void response.body?.cancel().catch(() => {});
		throw new Error('Response size limit');
	}
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	// Cancel pending reads without waiting for upstream cleanup to finish.
	const cancel = () => {
		void reader.cancel().catch(() => {});
	};
	signal.addEventListener('abort', cancel, { once: true });
	try {
		while (true) {
			signal.throwIfAborted();
			const { done, value } = await reader.read();
			signal.throwIfAborted();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) throw new Error('Response size limit');
			if (value.byteLength) chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (cause) {
		cancel();
		throw cause;
	} finally {
		signal.removeEventListener('abort', cancel);
		reader.releaseLock();
	}
}
