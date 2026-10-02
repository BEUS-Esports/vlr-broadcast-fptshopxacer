import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';

it('skips database initialization during builds and validates the runtime connection', async () => {
	vi.doMock('$app/env', () => ({ building: true }));
	vi.doMock('$app/env/private', () => ({ DATABASE_URL: 'invalid:' }));
	try {
		await expect(import('./index')).resolves.toHaveProperty('db.query.teams');

		vi.resetModules();
		vi.doMock('$app/env', () => ({ building: false }));
		vi.doMock('$app/env/private', () => ({ DATABASE_URL: undefined }));
		await expect(import('./index')).rejects.toThrow('DATABASE_URL is not set');

		vi.resetModules();
		vi.doMock('$app/env/private', () => ({ DATABASE_URL: 'file::memory:' }));
		const { db } = await import('./index');
		try {
			await expect(db.get(sql`select 1 as value`)).resolves.toEqual({ value: 1 });
		} finally {
			if (typeof db.$client !== 'string') db.$client.close();
		}
	} finally {
		vi.doUnmock('$app/env');
		vi.doUnmock('$app/env/private');
		vi.resetModules();
	}
});
