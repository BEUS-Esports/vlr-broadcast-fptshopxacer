import { boundedText } from '#lib/server/http.ts';

// Discovery can return up to ten full reports, including round and kill events.
const maxResponseBytes = 20 * 1024 * 1024;

export type ProviderErrorCode =
	| 'invalid-input'
	| 'auth'
	| 'not-found'
	| 'rate-limit'
	| 'unavailable'
	| 'malformed'
	| 'timeout'
	| 'cancelled'
	| 'pending'
	| 'identity-mismatch';
const messages: Record<ProviderErrorCode, string> = {
	'invalid-input': 'Enter a valid player Riot ID, report ID, or group code.',
	auth: 'Provider authorization failed. Check the server credentials.',
	'not-found': 'The provider could not find this player or report.',
	'rate-limit': 'Provider rate limit reached. Wait before fetching again.',
	unavailable: 'The provider is unavailable. Try again later or use manual entry.',
	malformed: 'The provider returned an invalid report.',
	timeout: 'The provider request timed out.',
	cancelled: 'The provider request was cancelled.',
	pending: 'The Spectra report is not ready. Fetch again later.',
	'identity-mismatch':
		'The provider returned a different match. Fetch and review the intended report again.'
};
export class PostGameProviderError extends Error {
	constructor(public readonly code: ProviderErrorCode) {
		super(messages[code]);
		this.name = 'PostGameProviderError';
	}
}
export function object(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: {};
}
export function text(value: unknown): string | null {
	return typeof value === 'string' &&
		value.trim().length > 0 &&
		value.length <= 256 &&
		![...value].some((char) => char.charCodeAt(0) < 32)
		? value.trim()
		: null;
}
export function count(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function statusError(status: number): PostGameProviderError {
	return new PostGameProviderError(
		status === 401 || status === 403
			? 'auth'
			: status === 404
				? 'not-found'
				: status === 429
					? 'rate-limit'
					: status >= 500
						? 'unavailable'
						: 'malformed'
	);
}
export function envelope(value: unknown) {
	const body = object(value);
	if (body.status !== 200) throw statusError(count(body.status) ?? 0);
	return body;
}
export async function requestJson(
	url: string,
	timeoutMs: number,
	fetcher: typeof fetch,
	signal?: AbortSignal,
	headers?: Record<string, string>
): Promise<unknown> {
	if (signal?.aborted) throw new PostGameProviderError('cancelled');
	const timeout = AbortSignal.timeout(timeoutMs);
	const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
	try {
		const response = await fetcher(url, { headers, signal: combined, redirect: 'error' });
		if (!response.ok) {
			void response.body?.cancel().catch(() => {});
			throw statusError(response.status);
		}
		try {
			return JSON.parse(await boundedText(response, combined, maxResponseBytes));
		} catch {
			if (combined.aborted)
				throw new PostGameProviderError(signal?.aborted ? 'cancelled' : 'timeout');
			throw new PostGameProviderError('malformed');
		}
	} catch (error) {
		if (signal?.aborted) throw new PostGameProviderError('cancelled');
		if (timeout.aborted) throw new PostGameProviderError('timeout');
		if (error instanceof PostGameProviderError) throw error;
		// Never carry transport errors (which may contain credentials) as a cause.
		throw new PostGameProviderError('unavailable');
	}
}
