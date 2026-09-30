import { expect, it } from 'vitest';
import { formError, readPayload } from './form-error';
import { SaveError } from './save-error';

it('preserves explicit ordered collection drafts and classifies conflicts without flattening', () => {
	const form = new FormData();
	form.set('payload', JSON.stringify({ playerIds: ['b', 'a'], expectedRevision: 2 }));
	const draft = readPayload(form);
	expect(formError(new SaveError('stale', 'Reload first.'), form, draft)).toMatchObject({
		status: 409,
		data: { code: 'stale', draft: { playerIds: ['b', 'a'], expectedRevision: 2 } }
	});
	for (const value of ['null', '[]', 'bad']) {
		form.set('payload', value);
		expect(() => readPayload(form)).toThrow(SaveError);
	}
	expect(formError(new Error('SQLITE_BUSY: database is locked'), form)).toMatchObject({
		status: 409,
		data: { code: 'stale' }
	});
});
