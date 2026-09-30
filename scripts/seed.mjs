import { createClient } from '@libsql/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = createClient({ url });
const names = ['Alpha', 'Bravo', 'Charlie'];

try {
	await client.batch(
		[
			...names.map((name) => ({
				sql: 'INSERT INTO teams (id, name, tag) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING',
				args: [`seed-team-${name.toLowerCase()}`, `Demo ${name}`, name.slice(0, 3).toUpperCase()]
			})),
			...names.flatMap((name) =>
				Array.from({ length: 6 }, (_, index) => ({
					sql: 'INSERT INTO players (id, display_name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING',
					args: [`seed-player-${name.toLowerCase()}-${index + 1}`, `${name} ${index + 1}`]
				}))
			)
		],
		'write'
	);
	console.log('Seeded 3 demo teams and 18 players; existing seed records were preserved.');
} finally {
	client.close();
}
