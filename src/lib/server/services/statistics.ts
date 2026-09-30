import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	agents,
	gameLineups,
	gamePlayerStatistics,
	gameStatisticsMeta,
	matches,
	statisticFields
} from '#lib/server/db/schema/index.ts';
import { bumpGameRevision } from './games';
import { SaveError } from './save-error';
import { assertTournamentWritable } from './tournaments';

type Stats = Pick<typeof gamePlayerStatistics.$inferInsert, (typeof statisticFields)[number]>;
type Draft = Stats & { playerId: string; entryId: string; agentId: string | null };

function parseMetric(value: unknown, name: string): number | null {
	if (value === null || value === undefined || (typeof value === 'string' && !value.trim()))
		return null;
	if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value.trim());
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
		throw new SaveError('invalid', `${name} must be a whole non-negative number or blank.`);
	return value;
}

function parsePlayers(value: unknown): Draft[] {
	if (!Array.isArray(value)) throw new SaveError('invalid', 'Submit a player statistics list.');
	const seen = new Set<string>();
	return value.map((item) => {
		if (!item || typeof item !== 'object' || Array.isArray(item))
			throw new SaveError('invalid', 'Each statistics row needs a saved lineup player.');
		const row = item as Record<string, unknown>;
		if (
			typeof row.playerId !== 'string' ||
			!row.playerId ||
			typeof row.entryId !== 'string' ||
			!row.entryId ||
			!(row.agentId === null || row.agentId === '' || typeof row.agentId === 'string') ||
			seen.has(row.playerId)
		)
			throw new SaveError(
				'invalid',
				'Each saved lineup player may appear once with a valid team and agent.'
			);
		seen.add(row.playerId);
		const metrics = Object.fromEntries(
			statisticFields.map((field) => [field, parseMetric(row[field], field)])
		) as Stats;
		return {
			playerId: row.playerId,
			entryId: row.entryId,
			agentId: row.agentId === '' ? null : row.agentId,
			...metrics
		};
	});
}

export function statisticsDiffer(a: Stats | null, b: Stats) {
	return statisticFields.some((field) => (a?.[field] ?? null) !== b[field]);
}

export async function getGameStatistics(gameId: string) {
	const [lineup, stats, meta] = await Promise.all([
		db.select().from(gameLineups).where(eq(gameLineups.gameId, gameId)),
		db.select().from(gamePlayerStatistics).where(eq(gamePlayerStatistics.gameId, gameId)),
		db.select().from(gameStatisticsMeta).where(eq(gameStatisticsMeta.gameId, gameId)).limit(1)
	]);
	return {
		scoreboard: lineup
			.filter((row) => row.playerId)
			.map((row) => {
				const saved = stats.find((item) => item.playerId === row.playerId);
				return {
					...row,
					...Object.fromEntries(statisticFields.map((field) => [field, saved?.[field] ?? null])),
					manuallyEditedAt: saved?.manuallyEditedAt ?? null
				};
			}),
		provenance: {
			importSource: meta[0]?.importSource ?? null,
			externalMatchId: meta[0]?.externalMatchId ?? null,
			importedAt: meta[0]?.importedAt ?? null,
			lastManualEditAt: meta[0]?.lastManualEditAt ?? null,
			manuallyChangedPlayerIds: meta[0]?.importedAt
				? stats
						.filter((row) => row.manuallyEditedAt && row.manuallyEditedAt > meta[0].importedAt!)
						.map((row) => row.playerId)
				: []
		}
	};
}

export async function saveGameStatistics(input: {
	gameId: string;
	expectedGameRevision: number;
	players: unknown;
}) {
	const players = parsePlayers(input.players);
	const gameRevision = await db.transaction(async (tx) => {
		const game = await bumpGameRevision(tx, input.gameId, input.expectedGameRevision);
		const [match] = await tx.select().from(matches).where(eq(matches.id, game.matchId));
		await assertTournamentWritable(tx, match.tournamentId);
		const lineup = await tx.select().from(gameLineups).where(eq(gameLineups.gameId, game.id));
		const current = await tx
			.select()
			.from(gamePlayerStatistics)
			.where(eq(gamePlayerStatistics.gameId, game.id));
		const [meta] = await tx
			.select({ importedAt: gameStatisticsMeta.importedAt })
			.from(gameStatisticsMeta)
			.where(eq(gameStatisticsMeta.gameId, game.id))
			.limit(1);
		const imported = !!meta?.importedAt;
		const newAgentIds = [
			...new Set(
				players
					.filter(
						(player) =>
							player.agentId &&
							player.agentId !== lineup.find((row) => row.playerId === player.playerId)?.agentId
					)
					.map((player) => player.agentId!)
			)
		];
		const availableAgents = newAgentIds.length
			? await tx.select().from(agents).where(inArray(agents.id, newAgentIds))
			: [];
		for (const player of players) {
			const selected = lineup.find((row) => row.playerId === player.playerId);
			if (!selected || selected.entryId !== player.entryId)
				throw new SaveError(
					'invalid',
					'Statistics must use players and teams from this game’s saved lineup.'
				);
			if (
				player.agentId &&
				player.agentId !== selected.agentId &&
				!availableAgents.some((agent) => agent.id === player.agentId && agent.isActive)
			)
				throw new SaveError('invalid', 'Choose an available agent, or retain the saved agent.');
		}
		let changed = false;
		const now = new Date();
		for (const player of players) {
			const selected = lineup.find((row) => row.playerId === player.playerId)!;
			const saved = current.find((row) => row.playerId === player.playerId);
			const agentChanged = selected.agentId !== player.agentId;
			const statsChanged = statisticsDiffer(saved ?? null, player);
			const hasStats = statisticFields.some((field) => player[field] !== null);
			const shouldDelete = !!saved && !hasStats && !imported;
			if (!agentChanged && !statsChanged && !shouldDelete) continue;
			changed = true;
			if (agentChanged)
				await tx
					.update(gameLineups)
					.set({ agentId: player.agentId })
					.where(and(eq(gameLineups.gameId, game.id), eq(gameLineups.playerId, player.playerId)));
			if (!hasStats) {
				if (saved && imported && statsChanged)
					await tx
						.update(gamePlayerStatistics)
						.set({
							...Object.fromEntries(statisticFields.map((field) => [field, null])),
							manuallyEditedAt: now
						})
						.where(
							and(
								eq(gamePlayerStatistics.gameId, game.id),
								eq(gamePlayerStatistics.playerId, player.playerId)
							)
						);
				else if (shouldDelete)
					await tx
						.delete(gamePlayerStatistics)
						.where(
							and(
								eq(gamePlayerStatistics.gameId, game.id),
								eq(gamePlayerStatistics.playerId, player.playerId)
							)
						);
			} else if (saved) {
				await tx
					.update(gamePlayerStatistics)
					.set({
						...Object.fromEntries(statisticFields.map((field) => [field, player[field]])),
						manuallyEditedAt: now
					})
					.where(
						and(
							eq(gamePlayerStatistics.gameId, game.id),
							eq(gamePlayerStatistics.playerId, player.playerId)
						)
					);
			} else {
				await tx.insert(gamePlayerStatistics).values({
					gameId: game.id,
					playerId: player.playerId,
					entryId: player.entryId,
					...Object.fromEntries(statisticFields.map((field) => [field, player[field]])),
					manuallyEditedAt: now
				});
			}
		}
		if (changed)
			await tx
				.insert(gameStatisticsMeta)
				.values({ gameId: game.id, lastManualEditAt: now })
				.onConflictDoUpdate({ target: gameStatisticsMeta.gameId, set: { lastManualEditAt: now } });
		return game.revision;
	});
	return { gameRevision, ...(await getGameStatistics(input.gameId)) };
}
