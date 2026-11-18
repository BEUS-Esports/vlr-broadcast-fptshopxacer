import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';

// Same key as profileKey in src/lib/server/services/profiles.ts.
const key = (value) => value.normalize('NFC').trim().toLocaleLowerCase();

function groups(label, rows) {
	const byKey = new Map();
	for (const { id, value } of rows) {
		if (!value) continue;
		const k = key(value);
		byKey.set(k, [...(byKey.get(k) ?? []), { id, value }]);
	}
	return [...byKey.values()]
		.filter((group) => group.length > 1)
		.map((group) => `${label}: ${group.map(({ id, value }) => `"${value}" (${id})`).join(' = ')}`);
}

export function findDuplicates({ teams, players }) {
	return [
		...groups(
			'Team name',
			teams.map((r) => ({ id: r.id, value: r.name }))
		),
		...groups(
			'Team tag',
			teams.map((r) => ({ id: r.id, value: r.tag }))
		),
		...groups(
			'Player display name',
			players.map((r) => ({ id: r.id, value: r.display_name }))
		),
		...groups(
			'Player Riot ID',
			players.map((r) => ({ id: r.id, value: r.riot_id }))
		)
	];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set');
	const client = createClient({ url });
	try {
		const [teams, players] = await Promise.all([
			client.execute('SELECT id, name, tag FROM teams'),
			client.execute('SELECT id, display_name, riot_id FROM players')
		]);
		const lines = findDuplicates({ teams: teams.rows, players: players.rows });
		if (lines.length) {
			console.log(lines.join('\n'));
			process.exitCode = 1;
		} else console.log('No duplicate profiles.');
	} finally {
		client.close();
	}
}
