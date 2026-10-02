import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';

if (!building && !DATABASE_URL) throw new Error('DATABASE_URL is not set');

// Opening native libSQL in Kit's build worker crashes subsequent Rolldown builds on Windows.
export const db = building
	? drizzle.mock({ schema })
	: drizzle(createClient({ url: DATABASE_URL }), { schema });
