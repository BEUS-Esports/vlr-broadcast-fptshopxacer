import { mkdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { once } from 'node:events';
import { createServer } from 'node:http';
import {
	completedMatch,
	recentMatches,
	spectraPending
} from '../src/lib/server/post-game/providers/fixtures';

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
		await client.batch(
			[
				{
					sql: "INSERT INTO tournaments (id,name,slug) VALUES ('pg-event','Provider import event','provider-import-event')",
					args: []
				},
				{
					sql: "INSERT INTO maps (id,key,display_name) VALUES ('pg-ascent','ascent','Ascent')",
					args: []
				},
				{
					sql: "INSERT INTO agents (id,key,display_name) VALUES ('pg-sova','sova','Sova')",
					args: []
				},
				...['Alpha', 'Bravo'].map((team, i) => ({
					sql: 'INSERT INTO tournament_entries (id,tournament_id,team_id) VALUES (?,?,?)',
					args: [`pg-entry-${i}`, 'pg-event', team]
				})),
				{
					sql: "INSERT INTO matches (id,tournament_id,team_a_entry_id,team_b_entry_id,label,best_of) VALUES ('pg-match','pg-event','pg-entry-0','pg-entry-1','Provider review',3)",
					args: []
				},
				...['henrik', 'spectra'].map((source, i) => ({
					sql: 'INSERT INTO games (id,match_id,number,name,map_id) VALUES (?,?,?,?,?)',
					args: [`pg-${source}`, 'pg-match', i + 1, `Provider ${source}`, 'pg-ascent']
				})),
				...Array.from({ length: 10 }, (_, i) => ({
					sql: 'INSERT INTO players (id,display_name,riot_id) VALUES (?,?,?)',
					args: [`pg-${i}`, `Player ${i}`, `Player ${i}#EVENT`]
				})),
				...Array.from({ length: 10 }, (_, i) => ({
					sql: 'INSERT INTO tournament_entry_players (entry_id,player_id) VALUES (?,?)',
					args: [`pg-entry-${i < 5 ? 0 : 1}`, `pg-${i}`]
				})),
				...['henrik', 'spectra'].flatMap((source) =>
					Array.from({ length: 10 }, (_, i) => ({
						sql: 'INSERT INTO game_lineups (game_id,entry_id,slot,player_id) VALUES (?,?,?,?)',
						args: [`pg-${source}`, `pg-entry-${i < 5 ? 0 : 1}`, (i % 5) + 1, `pg-${i}`]
					}))
				)
			],
			'write'
		);
	} finally {
		client.close();
	}

	process.env.ORIGIN = 'http://localhost:4173';
	// Override the credential BEFORE routing outbound traffic to the local fixture service.
	process.env.HENRIKDEV_API_KEY = 'synthetic-e2e-key';
	process.env.HENRIKDEV_AFFINITY = 'ap';
	process.env.HENRIKDEV_PLATFORM = 'pc';
	process.env.HENRIKDEV_CANDIDATE_LIMIT = '5';
	process.env.POST_GAME_REQUEST_TIMEOUT_MS = '2000';
	let scenario = 'ready';
	let spectraAttempts = 0;
	const provider = createServer((request, response) => {
		const url = new URL(request.url!, 'http://localhost');
		if (url.pathname === '/scenario') {
			scenario = url.searchParams.get('name') ?? 'ready';
			spectraAttempts = 0;
			response.end('ok');
			return;
		}
		response.setHeader('Content-Type', 'application/json');
		if (scenario === 'rate-limit') {
			response.writeHead(429);
			response.end('{}');
			return;
		}
		if (
			url.pathname.startsWith('/valorant') &&
			request.headers.authorization !== 'synthetic-e2e-key'
		) {
			response.writeHead(401);
			response.end('{}');
			return;
		}
		const payload = url.pathname.includes('/matches/')
			? recentMatches
			: url.pathname === '/getStats' &&
				  (scenario === 'pending' || (scenario === 'pending-ready' && spectraAttempts++ === 0))
				? spectraPending
				: completedMatch;
		const result = structuredClone(payload);
		if (url.pathname === '/getStats' && 'metadata' in result.data)
			result.data.metadata.match_id = 'spectra-event-match';
		if (scenario === 'manual-map' && 'players' in result.data && result.data.players.length) {
			result.data.players[0].name = 'Renamed';
		}
		const send = () => response.end(JSON.stringify(result));
		if (scenario === 'delayed') setTimeout(send, 700);
		else send();
	});
	provider.listen(0, '127.0.0.1');
	await once(provider, 'listening');
	const providerUrl = `http://127.0.0.1:${(provider.address() as import('node:net').AddressInfo).port}`;
	process.env.VLR_E2E_PROVIDER_URL = providerUrl;
	process.env.HENRIKDEV_BASE_URL = providerUrl;
	process.env.SPECTRA_POST_GAME_BASE_URL = providerUrl;
	process.env.SPECTRA_POST_GAME_GROUP_CODE = 'SYNTHETIC';
	process.env.SPECTRA_POST_GAME_POLL_INTERVAL_MS = '150';
	process.env.SPECTRA_POST_GAME_MAX_ATTEMPTS = '3';
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
		provider.closeAllConnections();
		await new Promise<void>((resolve) => provider.close(() => resolve()));
		const directory = resolve(process.env.VLR_E2E_DIR!);
		if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('vlr-e2e-'))
			throw new Error('Refusing to remove an unexpected test directory.');
		await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	};
}
