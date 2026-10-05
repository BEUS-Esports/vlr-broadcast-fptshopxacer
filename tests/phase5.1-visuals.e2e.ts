import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import { graphicIds, type GraphicId } from '../src/lib/broadcast/controls';
import type { BroadcastSnapshot } from '../src/lib/broadcast/types';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

test('Test GFX v2 renders deterministic complete and edge states inside the native canvas', async ({
	page,
	browser
}) => {
	test.setTimeout(120_000);
	const tournament = await prepareTournament(page, 'Test GFX v2 fixture', [1, 2]);
	const match = await createMatch(page, tournament, 'Visual verification', 3);
	const game = await createGame(page, match);
	const gameId = game.split('/').pop()!;
	const matchId = match.split('/').pop()!;
	const db = createClient({ url: process.env.DATABASE_URL! });
	let output: Page | undefined;
	try {
		const entries = (
			await db.execute({
				sql: 'SELECT team_a_entry_id, team_b_entry_id FROM matches WHERE id = ?',
				args: [matchId]
			})
		).rows[0];
		await db.batch(
			[
				{
					sql: "INSERT INTO agents (id, key, display_name, is_active) VALUES ('visual-agent', 'visual-agent', 'Saved agent', 1)",
					args: []
				},
				...(['Alpha', 'Bravo'] as const)
					.flatMap((team, index) =>
						Array.from({ length: 5 }, (_, slot) => {
							const entryId = String(index ? entries.team_b_entry_id : entries.team_a_entry_id);
							return [
								{
									sql: 'INSERT INTO game_lineups (game_id, entry_id, slot, player_id, agent_id) VALUES (?, ?, ?, ?, ?)',
									args: [gameId, entryId, slot + 1, `${team}-${slot + 1}`, 'visual-agent']
								},
								{
									sql: 'INSERT INTO game_player_statistics (game_id, player_id, entry_id, kills, deaths, assists, performance_score, trades, first_bloods, plants, defuses) VALUES (?, ?, ?, 20, 12, 5, 240, 3, 2, 1, 0)',
									args: [gameId, `${team}-${slot + 1}`, entryId]
								}
							];
						})
					)
					.flat(),
				{
					sql: "UPDATE games SET map_id = 'map-1', starting_attackers_entry_id = ?, starting_defenders_entry_id = ?, score_a = 13, score_b = 7, result_type = 'normal', winner_entry_id = ?, mvp_player_id = 'Alpha-1' WHERE id = ?",
					args: [entries.team_a_entry_id, entries.team_b_entry_id, entries.team_a_entry_id, gameId]
				},
				{
					sql: "INSERT INTO match_veto_actions (id, match_id, sequence, action, map_id, acting_entry_id, game_number) VALUES ('visual-veto', ?, 1, 'pick', 'map-1', ?, 1)",
					args: [matchId, entries.team_a_entry_id]
				}
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
		const saved = await page.evaluate(
			() =>
				new Promise<BroadcastSnapshot>((resolve, reject) => {
					const source = new EventSource('/api/broadcast/events');
					const timeout = setTimeout(() => {
						source.close();
						reject(new Error('Snapshot timed out'));
					}, 10_000);
					source.addEventListener(
						'snapshot',
						(event) => {
							clearTimeout(timeout);
							source.close();
							resolve(JSON.parse((event as MessageEvent).data).snapshot);
						},
						{ once: true }
					);
				})
		);
		saved.liveControls = {
			swapped: false,
			currentAttackersEntryId: null,
			pause: { type: 'none' },
			ceremony: null
		};
		saved.controls.playerStats = {
			mode: 'single',
			scope: 'game',
			playerId: 'Alpha-1',
			opponentPlayerId: null
		};
		output = await browser.newPage({
			viewport: { width: 1920, height: 1080 },
			reducedMotion: 'reduce'
		});
		let fixture = saved;
		await output.route('**/api/broadcast/events', (route) => {
			const prepared = { ...fixture };
			const capture = { ...prepared };
			Reflect.deleteProperty(capture, 'publications');
			const snapshot = {
				...prepared,
				controls: {
					...prepared.controls,
					visibility: Object.fromEntries(graphicIds.map((id) => [id, true]))
				},
				publications: Object.fromEntries(graphicIds.map((id) => [id, capture]))
			};
			return route.fulfill({
				contentType: 'text/event-stream',
				body: `event: snapshot\ndata: ${JSON.stringify({ version: 1, stream: { epoch: 'visual-fixture', sequence: 1 }, snapshot })}\n\n`
			});
		});
		await mkdir('docs/phase-5.1-screenshots', { recursive: true });
		async function capture(
			graphic: GraphicId,
			name: string,
			change?: (snapshot: BroadcastSnapshot) => void
		) {
			fixture = structuredClone(saved);
			change?.(fixture);
			await output!.goto(`/gfx/live/${graphic}`);
			const renderer = output!.locator('[data-graphic]');
			await expect(renderer.locator('section').first()).toBeVisible();
			await expect(renderer).toHaveAttribute('data-render-mode', 'program');
			for (const box of await renderer.locator('[data-slot], [data-sequence]').all()) {
				const bounds = await box.boundingBox();
				expect(bounds && bounds.y + bounds.height).toBeLessThanOrEqual(1000);
			}
			expect(
				await output!.evaluate(() => ({
					width: document.documentElement.scrollWidth,
					height: document.documentElement.scrollHeight
				}))
			).toEqual({ width: 1920, height: 1080 });
			await output!.screenshot({
				path: `docs/phase-5.1-screenshots/${name}.png`,
				omitBackground: true
			});
		}
		for (const graphic of graphicIds) await capture(graphic, `${graphic}-complete`);
		await capture('player-lineup', 'lineup-incomplete-missing-assets', (snapshot) => {
			snapshot.lineups = snapshot.lineups.filter((row) => row.slot <= 2);
		});
		await capture('agent-select', 'agent-select-missing-agents', (snapshot) => {
			snapshot.lineups[0].agent = null;
		});
		await capture('player-lineup', 'lineup-long-names', (snapshot) => {
			for (const team of snapshot.teams)
				team.name = `${team.name} · A deliberately long competition team name`;
			for (const row of snapshot.lineups)
				if (row.player) row.player.displayName += ' · A deliberately long player display name';
		});
		await capture('player-lineup', 'lineup-swapped', (snapshot) => {
			snapshot.liveControls.swapped = true;
		});
		for (const [name, attackers] of [
			['a', entries.team_a_entry_id],
			['b', entries.team_b_entry_id]
		] as const) {
			await capture('in-game', `in-game-attackers-${name}`, (snapshot) => {
				snapshot.liveControls.currentAttackersEntryId = String(attackers);
			});
		}
		await capture('player-stats', 'player-stats-head-to-head', (snapshot) => {
			snapshot.controls.playerStats = {
				mode: 'head-to-head',
				scope: 'game',
				playerId: 'Alpha-1',
				opponentPlayerId: 'Bravo-1'
			};
		});
		await capture('player-stats', 'player-stats-match-scope', (snapshot) => {
			snapshot.controls.playerStats.scope = 'match';
		});
		await capture('player-lineup', 'attribution-area-empty');
		// QA annotation proves the production footer's reserved geometry; provider attribution remains Phase 6.
		await output.locator('[data-attribution-safe-area]').evaluate((element) => {
			element.textContent = 'Attribution test area';
			(element as HTMLElement).style.outline = '1px solid #54c5c0';
		});
		await output.screenshot({
			path: 'docs/phase-5.1-screenshots/attribution-area-qa.png',
			omitBackground: true
		});
		await save(page, 'Clear live selection');
		await page.goto('/admin/graphics/player-lineup');
		await page.getByRole('button', { name: 'Large Preview', exact: true }).click();
		await expect(
			page.getByRole('dialog').getByText('No game selected', { exact: true })
		).toBeVisible();
		await page
			.getByRole('dialog')
			.screenshot({ path: 'docs/phase-5.1-screenshots/no-selection-preview.png' });
		await page.keyboard.press('Escape');
	} finally {
		db.close();
		await output?.close();
	}
});
