import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@libsql/client';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once, type EventEmitter } from 'node:events';
import { gstackFixture } from '../src/lib/live/fixtures';
import type { LiveGameEnvelope } from '../src/lib/live/types';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

// Reuse the installed Socket.IO transport dependency without adding a production dependency.
const require = createRequire(import.meta.url);
const engineRequire = createRequire(
	createRequire(require.resolve('socket.io-client')).resolve('engine.io-client')
);
type Peer = { send: (message: string) => void; terminate: () => void };
type SocketServer = EventEmitter & { clients: Set<Peer>; close: (done: () => void) => void };
const { WebSocketServer } = engineRequire('ws') as {
	WebSocketServer: new (options: { host: string; port: number }) => SocketServer;
};

async function latestTelemetry(page: Page): Promise<LiveGameEnvelope> {
	return page.evaluate(
		() =>
			new Promise<LiveGameEnvelope>((resolve, reject) => {
				const source = new EventSource('/api/live-game/events');
				const timeout = setTimeout(() => {
					source.close();
					reject(new Error('Live SSE timed out'));
				}, 10_000);
				source.addEventListener(
					'live-game',
					(event) => {
						clearTimeout(timeout);
						source.close();
						resolve(JSON.parse((event as MessageEvent).data));
					},
					{ once: true }
				);
			})
	);
}

test('server-owned live provider keeps keys private, shares one upstream, and honors mapping and native fallback', async ({
	page,
	browser,
	request
}, testInfo) => {
	test.setTimeout(150_000);
	const secret = 'phase6-e2e+private&credential';
	const fixture = gstackFixture();
	fixture.TeamLeft[0].Name = 'Observed Alpha';
	fixture.TeamRight[0].Name = 'Observed Bravo';
	fixture.TeamRight[0]['HP%'] = '';
	const payload = {
		...fixture,
		accessKey: secret,
		diagnostics: `GET /getOrgForKey?key=${encodeURIComponent(secret)}`
	};
	let snapshots = 0;
	const http = createServer((req, res) => {
		if (req.url !== '/livenow') {
			res.writeHead(404).end();
			return;
		}
		snapshots++;
		res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
	});
	http.listen(0, '127.0.0.1');
	await once(http, 'listening');
	const address = http.address();
	if (!address || typeof address === 'string') throw new Error('Missing fake provider address');
	const upstream = new WebSocketServer({ host: '127.0.0.1', port: 57770 });
	await once(upstream, 'listening');
	let connections = 0;
	upstream.on('connection', () => {
		connections++;
	});
	const clients: Page[] = [];
	const browserSockets: string[] = [];
	page.on('websocket', (socket) => browserSockets.push(socket.url()));
	const db = createClient({ url: process.env.DATABASE_URL! });
	try {
		const tournament = await prepareTournament(page, 'Phase 6 provider event', [1]);
		const match = await createMatch(page, tournament, 'Phase 6 provider match', 1);
		const game = await createGame(page, match);
		const gameId = game.split('/').pop()!;
		const matchId = match.split('/').pop()!;
		const entries = (
			await db.execute({
				sql: 'SELECT team_a_entry_id, team_b_entry_id FROM matches WHERE id = ?',
				args: [matchId]
			})
		).rows[0];
		await db.batch(
			[
				{ sql: 'UPDATE games SET map_id = ? WHERE id = ?', args: ['map-1', gameId] },
				...['Alpha', 'Bravo'].flatMap((team, index) =>
					Array.from({ length: 5 }, (_, slot) => ({
						sql: 'INSERT INTO game_lineups (game_id, entry_id, slot, player_id) VALUES (?, ?, ?, ?)',
						args: [
							gameId,
							index ? entries.team_b_entry_id : entries.team_a_entry_id,
							slot + 1,
							`${team}-${slot + 1}`
						]
					}))
				)
			],
			'write'
		);
		await page.goto('/admin/graphics');
		await page
			.getByRole('combobox', { name: 'Tournament', exact: true })
			.selectOption(tournament.split('/').pop()!);
		await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption(matchId);
		await page.getByRole('combobox', { name: 'Game', exact: true }).selectOption(gameId);
		await save(page, 'Take game live');
		await page.goto('/admin/graphics/in-game');
		await save(page, 'Show In-Game');

		await page.goto('/admin/settings');
		await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('custom');
		await page.getByLabel('Custom host', { exact: true }).fill('http://127.0.0.1');
		await page.getByLabel('Access key', { exact: true }).fill(secret);
		await page.getByLabel('Group code', { exact: true }).fill('phase6-group');
		await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('gstack');
		await page.getByLabel('Server address', { exact: true }).fill('http://user:password@127.0.0.1');
		let result = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && response.url().includes('/admin/settings')
		);
		await page.getByRole('button', { name: 'Save and connect', exact: true }).click();
		const failed = await result;
		expect(failed.status()).toBe(400);
		expect(await failed.text()).not.toContain(secret);
		await expect(page.getByRole('alert')).toContainText('Could not save provider settings');
		expect(await page.content()).not.toContain(secret);

		// Failed forms must clear the submitted password; enter it again for the valid save.
		await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('spectra');
		await expect(page.getByLabel('Access key', { exact: true })).toHaveValue('');
		await page.getByLabel('Access key', { exact: true }).fill(secret);
		await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('gstack');
		await page
			.getByLabel('Server address', { exact: true })
			.fill(`http://127.0.0.1:${address.port}`);
		result = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && response.url().includes('/admin/settings')
		);
		await page.getByRole('button', { name: 'Save and connect', exact: true }).click();
		const saved = await result;
		expect(saved.ok()).toBe(true);
		expect(await saved.text()).not.toContain(secret);
		expect(await (await request.get('/admin/settings')).text()).not.toContain(secret);
		await page.goto('/admin/graphics/in-game');
		const controls = page.getByRole('region', { name: 'Live provider', exact: true });
		await expect(controls.getByRole('status')).toContainText('ready');
		await expect(
			controls.getByRole('button', { name: 'Enable external HUD', exact: true })
		).toBeDisabled();
		await controls
			.getByRole('combobox', { name: 'Local team for left', exact: true })
			.selectOption(String(entries.team_a_entry_id));
		await controls
			.getByRole('combobox', { name: 'Local team for right', exact: true })
			.selectOption(String(entries.team_b_entry_id));
		await controls
			.getByRole('combobox', { name: /Slot 1 · Observed Alpha/ })
			.selectOption('Alpha-1');
		await controls
			.getByRole('combobox', { name: /Slot 1 · Observed Bravo/ })
			.selectOption('Bravo-1');
		await controls
			.getByRole('button', { name: 'Confirm mapping for selected game', exact: true })
			.click();
		await expect(controls.getByRole('status')).toContainText('Mapping confirmed');

		const other = await browser.newPage();
		clients.push(other);
		await other.goto('/admin/graphics/in-game');
		const outputs = await Promise.all([
			browser.newPage({ viewport: { width: 1920, height: 1080 } }),
			browser.newPage({ viewport: { width: 1920, height: 1080 } })
		]);
		clients.push(...outputs);
		for (const output of outputs) {
			output.on('websocket', (socket) => browserSockets.push(socket.url()));
			await output.goto('/gfx/live/in-game');
		}
		await controls.getByRole('button', { name: 'Enable external HUD', exact: true }).click();
		await expect(
			other.getByRole('region', { name: 'Live provider', exact: true }).getByRole('status')
		).toContainText('External HUD');
		for (const output of outputs) {
			await expect(output.locator('[data-live-hud]')).toBeVisible();
			await expect(output.locator('[data-live-hud] article')).toHaveCount(10);
			await expect(output.locator('[data-player-id="Alpha-1"]')).toContainText('Alpha 1');
			await expect(output.locator('[data-player-id="Alpha-1"] [data-health]')).toHaveText('100 HP');
			await expect(output.locator('[data-player-id="Bravo-1"] [data-health]')).toHaveCount(0);
			await expect(output.locator('[data-ability-charges]')).toHaveCount(0);
			expect(await output.content()).not.toContain(secret);
		}
		expect(connections).toBe(1);
		expect(snapshots).toBe(1);
		expect(browserSockets).toEqual([]);
		const envelope = await latestTelemetry(outputs[0]);
		expect(envelope.status).toMatchObject({
			mode: 'external',
			mappingReady: true,
			selectedGameId: gameId
		});
		expect(JSON.stringify(envelope)).not.toContain(secret);
		expect(JSON.stringify(envelope)).not.toContain('diagnostics');
		expect(JSON.stringify(envelope)).not.toContain('TeamLeft');
		for (const peer of upstream.clients) peer.send('[ExecuteScript]: SetPlayerHP(0,1,73)');
		for (const output of outputs)
			await expect(output.locator('[data-player-id="Alpha-1"] [data-health]')).toHaveText('73 HP');
		await outputs[0].screenshot({ path: testInfo.outputPath('external-hud.png') });

		await controls.getByRole('button', { name: 'View Data', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'View Data', exact: true });
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('pre')).toContainText('selectedGameId');
		await dialog.getByRole('button', { name: 'Raw Provider Data', exact: true }).click();
		await expect(dialog.locator('pre')).toContainText('TeamLeft');
		await expect(dialog.locator('pre')).toContainText('[redacted]');
		expect(await dialog.textContent()).not.toContain(secret);
		expect(await dialog.textContent()).not.toContain(encodeURIComponent(secret));
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		const copy = await dialog.locator('pre').textContent();
		await dialog.getByRole('button', { name: 'Copy JSON', exact: true }).click();
		expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(
			JSON.parse(copy!)
		);
		await dialog.getByRole('button', { name: 'Connection', exact: true }).click();
		await expect(dialog.locator('pre')).toContainText('mappingReady');
		await dialog.getByRole('button', { name: 'Close', exact: true }).click();
		const diagnostics = await (await request.get('/admin/live')).text();
		expect(diagnostics).not.toContain(secret);
		expect(diagnostics).not.toContain(encodeURIComponent(secret));

		await controls.getByRole('button', { name: 'Use native HUD', exact: true }).click();
		for (const output of outputs) await expect(output.locator('[data-live-hud]')).toHaveCount(0);
		for (const peer of upstream.clients) peer.terminate();
		await expect.poll(() => connections).toBe(2);
		await expect(controls.getByRole('status')).toContainText('ready');
		await expect(controls.getByRole('status')).toContainText('Native HUD');
		expect(snapshots).toBe(2);
		for (const output of outputs) await expect(output.locator('[data-live-hud]')).toHaveCount(0);
		await controls.getByRole('button', { name: 'Enable external HUD', exact: true }).click();
		for (const output of outputs) await expect(output.locator('[data-live-hud]')).toBeVisible();
		for (const peer of upstream.clients)
			peer.send("[ExecuteScript]: SetNamePlayer(0,1,'Replacement player')");
		await expect(controls.getByRole('status')).toContainText('Mapping needs review');
		for (const output of outputs) await expect(output.locator('[data-live-hud]')).toHaveCount(0);
		await controls.getByRole('button', { name: 'Disconnect / None', exact: true }).click();
		await expect(controls.getByRole('status')).toContainText('disabled');
		await expect(controls.getByRole('combobox', { name: 'Source', exact: true })).toHaveValue(
			'none'
		);
		expect((await latestTelemetry(outputs[0])).state).toBeNull();
	} finally {
		await request
			.post('/admin/live', {
				headers: { origin: 'http://localhost:4173' },
				data: { action: 'native' }
			})
			.catch(() => {});
		const response = await request.get('/admin/live').catch(() => null);
		if (response?.ok()) {
			const diagnostics = await response.json();
			await request.post('/admin/live', {
				headers: { origin: 'http://localhost:4173' },
				data: { action: 'disconnect', generation: diagnostics.connection.generation }
			});
		}
		for (const client of clients) await client.close();
		db.close();
		for (const peer of upstream.clients) peer.terminate();
		await new Promise<void>((resolve) => upstream.close(resolve));
		http.closeAllConnections();
		await new Promise<void>((resolve) => http.close(() => resolve()));
	}
});
