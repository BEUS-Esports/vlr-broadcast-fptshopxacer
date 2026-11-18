import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { createClient } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import { graphicIds, type GraphicId } from '../src/lib/broadcast/controls';
import type { BroadcastSnapshot } from '../src/lib/broadcast/types';
import { createGame, createMatch, prepareTournament, save } from './management-helpers';

const longNames = ['9G CHARLINGTON', 'Robo Trái Cây', 'kb zalo voi tao', 'Nguyễn Tấn Hồng Phúc'];

test('Roadshow template renders every graphic inside the canvas', async ({ page, browser }) => {
	test.setTimeout(180_000);
	const tournament = await prepareTournament(page, 'Roadshow visual fixture', [1, 2]);
	const match = await createMatch(page, tournament, 'Roadshow verification', 3);
	const game = await createGame(page, match);
	const gameId = game.split('/').pop()!;
	const matchId = match.split('/').pop()!;
	const tournamentId = tournament.split('/').pop()!;
	const db = createClient({ url: process.env.DATABASE_URL! });
	let output: Page | undefined;
	try {
		const entries = (
			await db.execute({
				sql: 'SELECT team_a_entry_id, team_b_entry_id FROM matches WHERE id = ?',
				args: [matchId]
			})
		).rows[0];
		const teamA = String(entries.team_a_entry_id);
		const teamB = String(entries.team_b_entry_id);
		await db.batch(
			[
				{
					sql: "UPDATE tournaments SET slug = 'predator-roadshow-val-e2e' WHERE id = ?",
					args: [tournamentId]
				},
				{
					sql: "INSERT INTO agents (id, key, display_name, is_active) VALUES ('roadshow-agent', 'roadshow-agent', 'Saved agent', 1)",
					args: []
				},
				...(['Alpha', 'Bravo'] as const).flatMap((team, index) =>
					Array.from({ length: 5 }, (_, slot) => {
						const entryId = index ? teamB : teamA;
						return [
							{
								sql: 'INSERT INTO game_lineups (game_id, entry_id, slot, player_id, agent_id) VALUES (?, ?, ?, ?, ?)',
								args: [gameId, entryId, slot + 1, `${team}-${slot + 1}`, 'roadshow-agent']
							},
							{
								sql: 'INSERT INTO game_player_statistics (game_id, player_id, entry_id, kills, deaths, assists, performance_score, trades, first_bloods, plants, defuses) VALUES (?, ?, ?, ?, 12, 5, 240, 3, 2, 1, 0)',
								args: [gameId, `${team}-${slot + 1}`, entryId, 20 - slot]
							}
						];
					}).flat()
				),
				{
					sql: "UPDATE games SET map_id = 'map-1', starting_attackers_entry_id = ?, starting_defenders_entry_id = ?, score_a = 13, score_b = 7, result_type = 'normal', winner_entry_id = ?, mvp_player_id = 'Alpha-1' WHERE id = ?",
					args: [teamA, teamB, teamA, gameId]
				},
				{
					sql: "INSERT INTO match_veto_actions (id, match_id, sequence, action, map_id, acting_entry_id, game_number) VALUES ('roadshow-veto', ?, 1, 'pick', 'map-1', ?, 1)",
					args: [matchId, teamA]
				}
			],
			'write'
		);
		await page.goto('/admin/graphics');
		await page
			.getByRole('combobox', { name: 'Tournament', exact: true })
			.selectOption(tournamentId);
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
		expect(saved.tournament?.slug).toBe('predator-roadshow-val-e2e');
		saved.controls.playerStats = {
			...saved.controls.playerStats,
			mode: 'single',
			scope: 'game',
			playerId: 'Alpha-1',
			opponentPlayerId: 'Bravo-1'
		};
		output = await browser.newPage({
			viewport: { width: 1920, height: 1080 },
			reducedMotion: 'reduce'
		});
		let fixture = saved;
		await output.route('**/api/broadcast/events', (route) => {
			const capture = { ...fixture };
			Reflect.deleteProperty(capture, 'publications');
			Reflect.deleteProperty(capture, 'sponsor');
			Reflect.deleteProperty(capture, 'composite');
			const snapshot = {
				...fixture,
				controls: {
					...fixture.controls,
					visibility: Object.fromEntries(graphicIds.map((id) => [id, true]))
				},
				publications: Object.fromEntries(graphicIds.map((id) => [id, capture]))
			};
			return route.fulfill({
				contentType: 'text/event-stream',
				body: `event: snapshot\ndata: ${JSON.stringify({ version: 1, stream: { epoch: 'roadshow', sequence: 1 }, snapshot })}\n\n`
			});
		});
		await mkdir('test-results/roadshow', { recursive: true });

		async function capture(
			graphic: GraphicId,
			name: string,
			change?: (snapshot: BroadcastSnapshot) => void
		) {
			fixture = structuredClone(saved);
			change?.(fixture);
			await output!.goto(`/gfx/live/${graphic}`);
			const renderer = output!.locator('[data-graphic]');
			await expect(renderer).toHaveAttribute('data-template', 'predator-roadshow-val');
			await expect(renderer.locator('section').first()).toBeVisible();
			await output!.evaluate(() => document.fonts.ready);
			// Let the fit helper's post-font re-measure settle.
			await output!.waitForTimeout(300);
			const report = await output!.evaluate(() => {
				const fit = [...document.querySelectorAll<HTMLElement>('[data-fit]')];
				const overflowing = fit
					.filter((el) => el.scrollWidth > el.clientWidth + 1)
					.map((el) => el.textContent);
				const sizes: Record<string, string[]> = {};
				for (const el of fit) {
					// Groups are per container: compare sizes within the element that owns this group.
					const owner = el.closest(`[style*="--fit-${el.dataset.fit}"]`) ?? document.body;
					const key = `${el.dataset.fit}@${[...document.querySelectorAll('*')].indexOf(owner)}`;
					(sizes[key] ??= []).push(getComputedStyle(el).fontSize);
				}
				const mixed = Object.entries(sizes)
					.filter(([, list]) => new Set(list).size > 1)
					.map(([key]) => key);
				return {
					overflowing,
					mixed,
					width: document.documentElement.scrollWidth,
					height: document.documentElement.scrollHeight,
					reserved: document.querySelectorAll('[data-attribution-safe-area]').length
				};
			});
			expect(report.overflowing, `${name}: names overflow`).toEqual([]);
			expect(report.mixed, `${name}: one size per fit group`).toEqual([]);
			expect({ width: report.width, height: report.height }).toEqual({ width: 1920, height: 1080 });
			expect(report.reserved, `${name}: data-source area only on In-Game`).toBe(
				graphic === 'in-game' ? 1 : 0
			);
			await output!.screenshot({ path: `test-results/roadshow/${name}.png`, omitBackground: true });
		}

		const longer = (snapshot: BroadcastSnapshot) => {
			snapshot.teams.forEach((team, index) => (team.name = longNames[index % 2]));
			snapshot.lineups.forEach((row, index) => {
				if (row.player) row.player.displayName = longNames[index % longNames.length];
			});
			for (const scope of Object.values(snapshot.scopes))
				for (const candidate of scope.candidates)
					candidate.displayName = longNames[candidate.displayName.length % longNames.length];
		};
		for (const graphic of graphicIds) {
			await capture(graphic, graphic);
			await capture(graphic, `${graphic}-long-names`, longer);
		}
		await capture('player-lineup', 'map-winner', (snapshot) => {
			snapshot.liveControls.lineupTeams = 'winner';
			longer(snapshot);
		});
		await capture('player-lineup', 'lineup-team-a', (snapshot) => {
			snapshot.liveControls.lineupTeams = 'team-a';
			longer(snapshot);
		});
		await capture('player-stats', 'head-to-head', (snapshot) => {
			snapshot.controls.playerStats.mode = 'head-to-head';
			longer(snapshot);
		});
		await save(page, 'Clear live selection');
	} finally {
		await output?.close();
		db.close();
	}
});
