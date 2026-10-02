import { mkdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { once } from 'node:events';

export default async function setup() {
	await mkdir(process.env.ASSET_DIR!, { recursive: true });
	const client = createClient({ url: process.env.DATABASE_URL! });
	try {
		await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
		const names = ['Alpha', 'Bravo', 'Charlie'];
		await client.batch(
			[
				...names.map((name) => ({
					sql: 'INSERT INTO teams (id, name, tag) VALUES (?, ?, ?)',
					args: [name, name, name.slice(0, 3)]
				})),
				...names.flatMap((name) =>
					Array.from({ length: 6 }, (_, i) => ({
						sql: 'INSERT INTO players (id, display_name) VALUES (?, ?)',
						args: [`${name}-${i + 1}`, `${name} ${i + 1}`]
					}))
				),
				...Array.from({ length: 7 }, (_, i) => ({
					sql: 'INSERT INTO maps (id, key, display_name) VALUES (?, ?, ?)',
					args: [`map-${i + 1}`, `map-${i + 1}`, `Map ${i + 1}`]
				})),
				{
					sql: 'INSERT INTO tournaments (id, name, slug) VALUES (?, ?, ?)',
					args: ['tabs-event', 'Navigation event', 'navigation-event']
				}
			],
			'write'
		);
	} finally {
		client.close();
	}

	process.env.ORIGIN = 'http://localhost:4173';
	// Build separately, then start the same adapter-node entrypoint as `node build`.
	const build = spawn(
		process.execPath,
		[
			fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
			'build',
			'--logLevel',
			'warn'
		],
		{ stdio: ['ignore', 'ignore', 'inherit'] }
	);
	const [code] = await once(build, 'exit');
	if (code !== 0) throw new Error(`Test build failed (${code}).`);

	// Own one app process directly: Windows process-tree shutdown requires permissions
	// unavailable in restricted runners. IPC also closes every app DB handle on exit.
	const app = fork(new URL('./server.mjs', import.meta.url), {
		stdio: ['ignore', 'ignore', 'inherit', 'ipc']
	});
	try {
		await Promise.race([
			once(app, 'message', { signal: AbortSignal.timeout(120_000) }),
			once(app, 'exit').then(([code]) => {
				throw new Error(`Test app exited before ready (${code}).`);
			})
		]);
	} catch (cause) {
		app.kill();
		throw cause;
	}
	return async () => {
		const exited = once(app, 'exit');
		app.send('stop');
		await exited;
		const directory = resolve(process.env.VLR_E2E_DIR!);
		if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('vlr-e2e-'))
			throw new Error('Refusing to remove an unexpected test directory.');
		await rm(directory, { recursive: true, force: true });
	};
}
