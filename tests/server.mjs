import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const client = createClient({ url: process.env.DATABASE_URL });
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
process.env.PORT = '4173';
const { server } = await import('../build/index.js');
await once(server, 'listening');
process.send('ready');
process.on('message', (message) => {
	if (message === 'stop') {
		server.closeAllConnections();
		server.close(() => process.exit(0));
	}
});
