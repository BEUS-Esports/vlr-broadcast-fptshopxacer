import { fail } from '@sveltejs/kit';
import { hasDatabaseError, SaveError } from './save-error';
import { logEvent } from '../logging';

export function formError(cause: unknown, form?: FormData, draft?: Record<string, unknown>) {
	if (hasDatabaseError(cause, 'SQLITE_BUSY') || hasDatabaseError(cause, 'SQLITE_LOCKED')) {
		cause = new SaveError(
			'stale',
			'Another operator is saving related data. Reload and review before saving again.'
		);
	}
	if (cause instanceof SaveError) {
		const status = cause.code === 'stale' || cause.code === 'blocked' ? 409 : 400;
		logEvent('warn', 'form.rejected', { code: cause.code, status });
		return fail(status, {
			error: cause.message,
			code: cause.code,
			...(cause.details && { details: cause.details }),
			...(draft && { draft }),
			values: Object.fromEntries(
				[...(form?.entries() ?? [])].filter(
					(entry): entry is [string, string] => typeof entry[1] === 'string'
				)
			)
		});
	}
	throw cause;
}

export function readPayload(form: FormData): Record<string, unknown> {
	try {
		const value: unknown = JSON.parse(field(form, 'payload'));
		if (value && typeof value === 'object' && !Array.isArray(value))
			return value as Record<string, unknown>;
	} catch {
		/* Invalid form input is handled below. */
	}
	throw new SaveError('invalid', 'The submitted form is invalid. Reload and try again.');
}

export function field(form: FormData, name: string) {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}
