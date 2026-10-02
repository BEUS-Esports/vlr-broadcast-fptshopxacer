import { and, eq, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { broadcastState, gameLineups, games, matches } from '#lib/server/db/schema/index.ts';
import {
	broadcastScopes,
	defaultPlayerStats,
	graphicIds,
	type BroadcastScope,
	type GraphicVisibility,
	type PlayerStatsControl
} from '#lib/broadcast/controls.ts';
import { SaveError } from './save-error';
import { buildBroadcastPreparedSnapshot } from '../broadcast/snapshot';
import { validatedPublications } from '#lib/broadcast/types.ts';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type State = typeof broadcastState.$inferSelect;
export type BroadcastState = State & { matchId: string | null; tournamentId: string | null };
export type BroadcastUpdate = {
	expectedRevision: number;
	selectedGameId?: string | null;
	swapped?: boolean;
	currentAttackersEntryId?: string | null;
	visibility?: Partial<GraphicVisibility>;
	playerStats?: PlayerStatsControl;
	mvpScope?: BroadcastScope;
};

async function initialize(connection: typeof db | Transaction) {
	await connection.insert(broadcastState).values({ id: 1 }).onConflictDoNothing();
}

async function selection(connection: typeof db | Transaction, gameId: string | null) {
	if (gameId === null) return null;
	if (typeof gameId !== 'string' || !gameId) throw new SaveError('invalid', 'Choose a valid game.');
	const [selected] = await connection
		.select({
			gameId: games.id,
			matchId: matches.id,
			tournamentId: matches.tournamentId,
			teamAEntryId: matches.teamAEntryId,
			teamBEntryId: matches.teamBEntryId
		})
		.from(games)
		.innerJoin(matches, eq(games.matchId, matches.id))
		.where(eq(games.id, gameId));
	if (!selected) throw new SaveError('not-found', 'Selected game not found.');
	return selected;
}

async function withParents(
	connection: typeof db | Transaction,
	state: State
): Promise<BroadcastState> {
	const selected = await selection(connection, state.selectedGameId);
	return {
		...state,
		matchId: selected?.matchId ?? null,
		tournamentId: selected?.tournamentId ?? null
	};
}

export async function getBroadcastState() {
	await initialize(db);
	const [selected] = await db
		.select({ state: broadcastState, matchId: matches.id, tournamentId: matches.tournamentId })
		.from(broadcastState)
		.leftJoin(games, eq(broadcastState.selectedGameId, games.id))
		.leftJoin(matches, eq(games.matchId, matches.id))
		.where(eq(broadcastState.id, 1));
	return { ...selected.state, matchId: selected.matchId, tournamentId: selected.tournamentId };
}

export async function updateBroadcastState(input: BroadcastUpdate) {
	if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)
		throw new SaveError('invalid', 'A valid broadcast revision is required.');
	return db.transaction(async (tx) => {
		await initialize(tx);
		const [current] = await tx
			.update(broadcastState)
			.set({ controlRevision: sql`${broadcastState.controlRevision} + 1` })
			.where(
				and(eq(broadcastState.id, 1), eq(broadcastState.controlRevision, input.expectedRevision))
			)
			.returning();
		if (!current) throw new SaveError('stale', 'Broadcast controls changed. Reload before saving.');
		const selectedGameId =
			input.selectedGameId === undefined ? current.selectedGameId : input.selectedGameId;
		const selected = await selection(tx, selectedGameId);
		const changedGame = selectedGameId !== current.selectedGameId;
		if (changedGame && Object.values(current.visibility).some(Boolean))
			throw new SaveError(
				'blocked',
				'Hide all shown graphics before changing or clearing the live selection.'
			);
		const state = {
			selectedGameId,
			// Presentation order is an explicit operator override, not game-owned state.
			swapped: input.swapped ?? current.swapped,
			currentAttackersEntryId:
				input.currentAttackersEntryId === undefined
					? changedGame
						? null
						: current.currentAttackersEntryId
					: input.currentAttackersEntryId,
			visibility: { ...current.visibility, ...input.visibility },
			playerStats:
				input.playerStats === undefined
					? changedGame
						? defaultPlayerStats
						: current.playerStats
					: input.playerStats,
			mvpScope:
				input.mvpScope === undefined
					? changedGame
						? ('game' as const)
						: current.mvpScope
					: input.mvpScope
		};
		if (
			typeof state.swapped !== 'boolean' ||
			(input.swapped !== undefined && typeof input.swapped !== 'boolean')
		)
			throw new SaveError('invalid', 'Presentation swap must be a boolean.');
		if (
			state.currentAttackersEntryId !== null &&
			(!selected ||
				![selected.teamAEntryId, selected.teamBEntryId].includes(state.currentAttackersEntryId))
		)
			throw new SaveError('invalid', 'Current attacker must be a selected match participant.');
		if (
			input.visibility !== undefined &&
			(!input.visibility || typeof input.visibility !== 'object' || Array.isArray(input.visibility))
		)
			throw new SaveError('invalid', 'Choose valid graphic visibility controls.');
		if (
			Object.entries(state.visibility).some(
				([key, value]) =>
					!graphicIds.includes(key as (typeof graphicIds)[number]) || typeof value !== 'boolean'
			)
		)
			throw new SaveError('invalid', 'Choose valid graphic visibility controls.');
		const showing = graphicIds.filter((id) => state.visibility[id] && !current.visibility[id]);
		const stats = state.playerStats;
		if (
			!stats ||
			Object.keys(stats).some(
				(key) => !['mode', 'scope', 'playerId', 'opponentPlayerId'].includes(key)
			) ||
			!['single', 'head-to-head'].includes(stats.mode) ||
			!broadcastScopes.includes(stats.scope) ||
			!broadcastScopes.includes(state.mvpScope) ||
			(stats.mode === 'single' && stats.opponentPlayerId !== null) ||
			(stats.playerId !== null && stats.playerId === stats.opponentPlayerId)
		)
			throw new SaveError('invalid', 'Choose valid stats mode, scope, and distinct players.');
		// Saved lineup edits may invalidate retained picks; they must not prevent Hide or live axes.
		const validateStatsPlayers =
			input.playerStats !== undefined || showing.includes('player-stats');
		for (const playerId of validateStatsPlayers ? [stats.playerId, stats.opponentPlayerId] : []) {
			if (playerId === null) continue;
			if (typeof playerId !== 'string' || !playerId || !selected)
				throw new SaveError('invalid', 'Select a game before choosing participating players.');
			const scope =
				stats.scope === 'game'
					? eq(games.id, selected.gameId)
					: stats.scope === 'match'
						? eq(matches.id, selected.matchId)
						: eq(matches.tournamentId, selected.tournamentId);
			const [participant] = await tx
				.select({ playerId: gameLineups.playerId })
				.from(gameLineups)
				.innerJoin(games, eq(gameLineups.gameId, games.id))
				.innerJoin(matches, eq(games.matchId, matches.id))
				.where(and(scope, eq(gameLineups.playerId, playerId)))
				.limit(1);
			if (!participant)
				throw new SaveError(
					'invalid',
					'Stats player must appear in a saved lineup in the selected scope.'
				);
		}
		const [saved] = await tx
			.update(broadcastState)
			.set(state)
			.where(eq(broadcastState.id, 1))
			.returning();
		if (showing.length && !selected)
			throw new SaveError('blocked', 'Select a valid live game before showing a graphic.');
		const publications = validatedPublications(current.publications);
		for (const id of graphicIds) if (!saved.visibility[id]) publications[id] = null;
		if (showing.length) {
			const prepared = await buildBroadcastPreparedSnapshot(tx, saved);
			if (!prepared.selection)
				throw new SaveError('blocked', 'Select a valid live game before showing a graphic.');
			for (const id of showing) publications[id] = prepared;
		}
		const [published] = await tx
			.update(broadcastState)
			.set({ publications })
			.where(eq(broadcastState.id, 1))
			.returning();
		return withParents(tx, published);
	});
}
