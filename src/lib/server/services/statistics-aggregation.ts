import { and, eq, inArray } from 'drizzle-orm';
import {
	gameLineups,
	gamePlayerStatistics,
	games,
	matches,
	players,
	statisticFields
} from '#lib/server/db/schema/index.ts';

export type Metric = { value: number | null; coverage: 'complete' | 'partial' | 'none' };
export type StatisticValues = Pick<
	typeof gamePlayerStatistics.$inferSelect,
	| 'kills'
	| 'deaths'
	| 'assists'
	| 'performanceScore'
	| 'trades'
	| 'firstBloods'
	| 'plants'
	| 'defuses'
>;
export type StatisticsGame = {
	id: string;
	resultType: typeof games.$inferSelect.resultType;
	appearances: Array<{
		playerId: string;
		entryId: string;
		displayName: string;
		statistics: StatisticValues | null;
	}>;
};
export type PlayerStatisticsView = {
	playerId: string;
	displayName: string;
	entryIds: string[];
	gamesPlayed: number;
	gamesWithStatistics: number;
} & Record<keyof StatisticValues, Metric>;
export type StatisticsView = {
	scope: 'game' | 'match' | 'tournament';
	gamesTotal: number;
	gamesContributing: number;
	players: PlayerStatisticsView[];
};

const countFields = [
	'kills',
	'deaths',
	'assists',
	'trades',
	'firstBloods',
	'plants',
	'defuses'
] as const;

export function aggregateStatistics(
	scope: StatisticsView['scope'],
	gamesInput: StatisticsGame[]
): StatisticsView {
	const contributors =
		scope === 'game' ? gamesInput : gamesInput.filter((game) => game.resultType === 'normal');
	const playersById = new Map<string, PlayerStatisticsView>();
	const knownByPlayer = new Map<
		string,
		Record<(typeof countFields)[number] | 'performanceScore', number>
	>();
	for (const game of contributors) {
		for (const appearance of game.appearances) {
			let player = playersById.get(appearance.playerId);
			if (!player) {
				const empty: Metric = { value: null, coverage: 'none' };
				player = {
					playerId: appearance.playerId,
					displayName: appearance.displayName,
					entryIds: [],
					gamesPlayed: 0,
					gamesWithStatistics: 0,
					kills: { ...empty },
					deaths: { ...empty },
					assists: { ...empty },
					trades: { ...empty },
					firstBloods: { ...empty },
					plants: { ...empty },
					defuses: { ...empty },
					performanceScore: { ...empty }
				};
				playersById.set(appearance.playerId, player);
				knownByPlayer.set(appearance.playerId, {
					kills: 0,
					deaths: 0,
					assists: 0,
					trades: 0,
					firstBloods: 0,
					plants: 0,
					defuses: 0,
					performanceScore: 0
				});
			}
			player.gamesPlayed++;
			if (!player.entryIds.includes(appearance.entryId)) player.entryIds.push(appearance.entryId);
			if (
				appearance.statistics &&
				statisticFields.some((field) => appearance.statistics?.[field] != null)
			)
				player.gamesWithStatistics++;
			const fields =
				scope === 'game' ? ([...countFields, 'performanceScore'] as const) : countFields;
			for (const field of fields) {
				const value = appearance.statistics?.[field];
				if (value === null || value === undefined) continue;
				const metric = player[field];
				metric.value = (metric.value ?? 0) + value;
				knownByPlayer.get(appearance.playerId)![field]++;
			}
		}
	}
	for (const player of playersById.values()) {
		const known = knownByPlayer.get(player.playerId)!;
		for (const field of [...countFields, 'performanceScore'] as const) {
			player[field].coverage =
				known[field] === 0 ? 'none' : known[field] === player.gamesPlayed ? 'complete' : 'partial';
		}
	}
	return {
		scope,
		gamesTotal: gamesInput.length,
		gamesContributing: contributors.length,
		players: [...playersById.values()]
	};
}

async function loadStatisticsGames(
	gameRows: Array<Pick<typeof games.$inferSelect, 'id' | 'resultType'>>
) {
	if (!gameRows.length) return [];
	const { db } = await import('#lib/server/db/index.ts');
	const rows = await db
		.select({
			gameId: gameLineups.gameId,
			playerId: gameLineups.playerId,
			entryId: gameLineups.entryId,
			displayName: players.displayName,
			statistics: gamePlayerStatistics
		})
		.from(gameLineups)
		.innerJoin(players, eq(gameLineups.playerId, players.id))
		.leftJoin(
			gamePlayerStatistics,
			and(
				eq(gameLineups.gameId, gamePlayerStatistics.gameId),
				eq(gameLineups.playerId, gamePlayerStatistics.playerId)
			)
		)
		.where(
			inArray(
				gameLineups.gameId,
				gameRows.map((game) => game.id)
			)
		);
	const byId = new Map<string, StatisticsGame>(
		gameRows.map((game) => [game.id, { ...game, appearances: [] }])
	);
	for (const row of rows) {
		// The game/player pair is unique in both lineup and statistics tables.
		if (row.playerId === null || row.displayName === null) continue;
		byId.get(row.gameId)!.appearances.push({
			playerId: row.playerId,
			entryId: row.entryId,
			displayName: row.displayName,
			statistics: row.statistics
		});
	}
	return [...byId.values()];
}

export async function getGameStatistics(gameId: string): Promise<StatisticsView> {
	const { db } = await import('#lib/server/db/index.ts');
	const gameRows = await db
		.select({ id: games.id, resultType: games.resultType })
		.from(games)
		.where(eq(games.id, gameId));
	return aggregateStatistics('game', await loadStatisticsGames(gameRows));
}

export async function getMatchStatistics(matchId: string): Promise<StatisticsView> {
	const { db } = await import('#lib/server/db/index.ts');
	const gameRows = await db
		.select({ id: games.id, resultType: games.resultType })
		.from(games)
		.where(eq(games.matchId, matchId));
	return aggregateStatistics('match', await loadStatisticsGames(gameRows));
}

export async function getTournamentStatistics(tournamentId: string): Promise<StatisticsView> {
	const { db } = await import('#lib/server/db/index.ts');
	const gameRows = await db
		.select({ id: games.id, resultType: games.resultType })
		.from(games)
		.innerJoin(matches, eq(games.matchId, matches.id))
		.where(eq(matches.tournamentId, tournamentId));
	return aggregateStatistics('tournament', await loadStatisticsGames(gameRows));
}
