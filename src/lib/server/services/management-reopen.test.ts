import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import * as s from '#lib/server/db/schema/index.ts';

const run = promisify(execFile);
const role = process.env.VLR_PERSIST_ROLE;
const databasePath = process.env.VLR_PERSIST_FILE;
const vitest = join(
	dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
	'vitest.mjs'
);

it.skipIf(role !== 'writer')(
	'persistence writer',
	async () => {
		const client = createClient({ url: `file:${databasePath}` });
		try {
			const db = drizzle(client, { schema: s });
			await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
			vi.resetModules();
			vi.doMock('#lib/server/db/index.ts', () => ({ db }));
			const { saveTournament, replaceTournamentMapPool } = await import('./tournaments');
			const { saveTeam, savePlayer } = await import('./profiles');
			const { saveResource } = await import('./resources');
			const { addTournamentEntry, replaceTournamentRoster } = await import('./tournament-entries');
			const { createMatch } = await import('./matches');
			const { replaceMatchVeto } = await import('./vetoes');
			const { createGame, saveGameResult, saveGameInfo } = await import('./games');
			const { replaceGameLineups, saveGameAgents } = await import('./lineups');
			const { saveGameStatistics } = await import('./statistics');
			const { setGameMvp, setMatchMvp, setTournamentMvp } = await import('./mvp');

			const tournament = await saveTournament({
				name: 'Persistent event',
				slug: 'persistent-event'
			});
			const teams = await Promise.all(
				['A', 'B'].map((tag) => saveTeam({ name: `Persistent ${tag}`, tag }))
			);
			const players = await Promise.all(
				['A', 'B'].map(async (tag) =>
					Promise.all(
						Array.from({ length: 5 }, (_, i) =>
							savePlayer({ displayName: `${tag}${i + 1}`, fullName: '', riotId: '' })
						)
					)
				)
			);
			const map = await saveResource({
				kind: 'map',
				key: 'persistent-map',
				displayName: 'Persistent Map',
				isActive: true
			});
			let tournamentRevision = tournament.revision;
			const entries = [];
			for (const team of teams) {
				const entry = await addTournamentEntry({
					tournamentId: tournament.id,
					expectedTournamentRevision: tournamentRevision,
					teamId: team.id
				});
				entries.push(entry.entryId);
				tournamentRevision = entry.tournamentRevision;
			}
			for (let i = 0; i < entries.length; i++) {
				const saved = await replaceTournamentRoster({
					tournamentId: tournament.id,
					expectedTournamentRevision: tournamentRevision,
					entryId: entries[i],
					playerIds: players[i].map((player) => player.id)
				});
				tournamentRevision = saved.tournamentRevision;
			}
			const pool = await replaceTournamentMapPool({
				tournamentId: tournament.id,
				expectedRevision: tournamentRevision,
				mapIds: [map.id]
			});
			expect(pool.revision).toBe(tournamentRevision + 1);
			const match = await createMatch({
				tournamentId: tournament.id,
				teamAEntryId: entries[0],
				teamBEntryId: entries[1],
				label: 'Persistent final',
				bestOf: 1
			});
			const veto = await replaceMatchVeto({
				matchId: match.id,
				expectedMatchRevision: 1,
				actions: [
					{
						action: 'pick',
						mapId: map.id,
						gameNumber: 1,
						actingEntryId: entries[0],
						sideChooserEntryId: entries[1],
						sideChoice: 'attack'
					}
				]
			});
			const game = await createGame({
				matchId: match.id,
				expectedMatchRevision: veto.matchRevision,
				number: 1,
				name: 'Persistent game'
			});
			await replaceGameLineups({
				gameId: game.gameId,
				expectedGameRevision: 1,
				teams: entries.map((entryId, i) => ({
					entryId,
					slots: players[i].map((player, index) => ({ slot: index + 1, playerId: player.id }))
				}))
			});
			const final = await saveGameResult({
				gameId: game.gameId,
				expectedGameRevision: 2,
				expectedMatchRevision: game.matchRevision,
				result: { mode: 'normal', scoreA: 13, scoreB: 9 }
			});
			expect(final.series).toMatchObject({ state: 'completed', winnerEntryId: entries[0] });
			await db.insert(s.agents).values({ id: 'agent', key: 'agent', displayName: 'Agent' });
			const selectedAgents = await saveGameAgents({
				gameId: game.gameId,
				expectedGameRevision: final.gameRevision,
				players: entries.flatMap((entryId, i) =>
					players[i].map((player) => ({
						playerId: player.id,
						entryId,
						agentId: player.id === players[0][0].id ? 'agent' : null
					}))
				)
			});
			const statistics = await saveGameStatistics({
				gameId: game.gameId,
				expectedGameRevision: selectedAgents.gameRevision,
				players: [
					{
						playerId: players[0][0].id,
						entryId: entries[0],
						kills: 0,
						deaths: 2,
						performanceScore: 200,
						trades: 0
					},
					{ playerId: players[1][0].id, entryId: entries[1], kills: 10 }
				]
			});
			await setGameMvp({
				gameId: game.gameId,
				expectedRevision: statistics.gameRevision,
				playerId: players[0][0].id
			});
			await setMatchMvp({
				matchId: match.id,
				expectedRevision: final.matchRevision,
				playerId: players[0][0].id
			});
			await setTournamentMvp({
				tournamentId: tournament.id,
				expectedRevision: 6,
				playerId: players[0][0].id
			});
			const { updateBroadcastState } = await import('./broadcast');
			await updateBroadcastState({
				expectedRevision: 1,
				selectedGameId: game.gameId,
				visibility: { mvp: true }
			});
			await saveGameInfo({
				gameId: game.gameId,
				expectedGameRevision: 6,
				expectedMatchRevision: 5,
				name: 'Newer saved game',
				mapId: map.id,
				startingAttackersEntryId: entries[1],
				startingDefendersEntryId: entries[0]
			});
		} finally {
			vi.doUnmock('#lib/server/db/index.ts');
			client.close();
		}
	},
	30_000
);

it.skipIf(role !== 'reader')(
	'persistence reader',
	async () => {
		const client = createClient({ url: `file:${databasePath}` });
		try {
			const db = drizzle(client, { schema: s });
			const [tournament] = await db.select().from(s.tournaments);
			const teams = await db.select().from(s.teams);
			const players = await db.select().from(s.players);
			const entries = await db.select().from(s.tournamentEntries);
			const roster = await db.select().from(s.tournamentEntryPlayers);
			const pool = await db.select().from(s.tournamentMapPool);
			const [match] = await db.select().from(s.matches);
			const [veto] = await db.select().from(s.matchVetoActions);
			const [game] = await db.select().from(s.games);
			const lineups = await db.select().from(s.gameLineups);
			const statistics = await db.select().from(s.gamePlayerStatistics);
			const [meta] = await db.select().from(s.gameStatisticsMeta);
			vi.resetModules();
			vi.doMock('#lib/server/db/index.ts', () => ({ db }));
			const { getMatchStatistics, getTournamentStatistics } =
				await import('./statistics-aggregation');
			expect(tournament).toMatchObject({
				name: 'Persistent event',
				slug: 'persistent-event',
				revision: 7,
				mvpPlayerId: players[0].id
			});
			expect(teams).toHaveLength(2);
			expect(players).toHaveLength(10);
			expect(entries).toHaveLength(2);
			expect(roster).toHaveLength(10);
			expect(pool).toHaveLength(1);
			expect(match).toMatchObject({
				tournamentId: tournament.id,
				bestOf: 1,
				resultType: 'normal',
				winnerEntryId: entries[0].id,
				revision: 6,
				mvpPlayerId: players[0].id
			});
			expect(veto).toMatchObject({
				matchId: match.id,
				mapId: pool[0].mapId,
				gameNumber: 1,
				sideChooserEntryId: entries[1].id
			});
			expect(game).toMatchObject({
				matchId: match.id,
				mapId: veto.mapId,
				scoreA: 13,
				scoreB: 9,
				resultType: 'normal',
				winnerEntryId: entries[0].id,
				revision: 7,
				mvpPlayerId: players[0].id
			});
			expect(game.startingAttackersEntryId).toBe(entries[1].id);
			const { buildBroadcastSnapshot } = await import('../broadcast/snapshot');
			const { programSnapshot } = await import('../../broadcast/selectors');
			const { updateBroadcastState } = await import('./broadcast');
			const latest = await buildBroadcastSnapshot();
			expect(latest.game?.name).toBe('Newer saved game');
			expect(latest.controls.visibility.mvp).toBe(true);
			expect(programSnapshot(latest, 'mvp')?.game?.name).toBe('Persistent game');
			expect(latest.dataRevision).toBeGreaterThan(latest.publications.mvp!.dataRevision);
			await updateBroadcastState({
				expectedRevision: latest.controlRevision,
				visibility: { mvp: true }
			});
			expect((await buildBroadcastSnapshot()).publications.mvp).toEqual(latest.publications.mvp);
			expect(lineups).toHaveLength(10);
			expect(new Set(lineups.map((row) => row.playerId)).size).toBe(10);
			expect(lineups.find((row) => row.playerId === players[0].id)?.agentId).toBe('agent');
			expect(statistics).toHaveLength(2);
			expect(statistics.find((row) => row.playerId === players[0].id)).toMatchObject({
				kills: 0,
				deaths: 2,
				assists: null,
				performanceScore: 200,
				trades: 0
			});
			expect(meta.lastManualEditAt).toBeInstanceOf(Date);
			expect(
				(await getMatchStatistics(match.id)).players.find((row) => row.playerId === players[0].id)
					?.kills
			).toEqual({ value: 0, coverage: 'complete' });
			expect(
				(await getTournamentStatistics(tournament.id)).players.find(
					(row) => row.playerId === players[0].id
				)?.performanceScore.value
			).toBeNull();
			expect((await client.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0);
		} finally {
			vi.doUnmock('#lib/server/db/index.ts');
			client.close();
		}
	},
	30_000
);

it.skipIf(!!role)(
	'persists complete management data across terminated writer and fresh reader processes',
	async () => {
		const directory = await mkdtemp(join(tmpdir(), 'vlr-reopen-'));
		try {
			const env = { ...process.env, VLR_PERSIST_FILE: join(directory, 'app.db') };
			for (const stage of ['writer', 'reader']) {
				const result = await run(
					process.execPath,
					[
						vitest,
						'run',
						'--project',
						'server',
						'src/lib/server/services/management-reopen.test.ts',
						'-t',
						`persistence ${stage}`
					],
					{ cwd: process.cwd(), env: { ...env, VLR_PERSIST_ROLE: stage }, timeout: 30_000 }
				);
				expect(result.stdout).toContain('1 passed');
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
	70_000
);
