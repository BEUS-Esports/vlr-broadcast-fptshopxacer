import { fail } from '@sveltejs/kit';
import { SaveError } from './save-error';

export function formError(cause: unknown, form?: FormData) {
	if (cause instanceof SaveError)
		return fail(cause.code === 'stale' ? 409 : cause.code === 'blocked' ? 409 : 400, {
			error: cause.message,
			values: Object.fromEntries(
				[...(form?.entries() ?? [])].filter(
					(entry): entry is [string, string] => typeof entry[1] === 'string'
				)
			)
		});
	throw cause;
}

export function field(form: FormData, name: string) {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}
