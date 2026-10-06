import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	agents,
	gameLineups,
	gamePlayerStatistics,
	gameStatisticsMeta,
	games,
	maps,
	matches,
	players,
	statisticFields,
	tournaments
} from '#lib/server/db/schema/index.ts';
import type { NormalizedPostGameReport } from '#lib/post-game/types.ts';
import type {
	PostGameMappings,
	PostGameMetrics,
	PostGameResolutions,
	PostGameReview,
	PostGameReviewPlayer
} from '#lib/post-game/review.ts';
import { bumpGameRevision } from '../services/games';
import { getGameStatistics } from '../services/statistics';
import { hasDatabaseError, SaveError } from '../services/save-error';
import { assertTournamentWritable } from '../services/tournaments';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const canonical = (value: string) => value.normalize('NFKC').trim().toLowerCase();
function riotIdentity(value: string | null) {
	if (!value) return null;
	const parts = value.split('#').map(canonical);
	return parts.length === 2 && parts.every(Boolean) ? parts.join('#') : null;
}
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

/** Read-only context shared by preview and the locked import. No provider calls. */
export async function loadPostGameContext(
	gameId: string,
	connection: typeof db | Transaction = db
) {
	const [game] = await connection.select().from(games).where(eq(games.id, gameId));
	if (!game) throw new SaveError('not-found', 'Game not found.');
	const [match] = await connection.select().from(matches).where(eq(matches.id, game.matchId));
	const [tournament] = await connection
		.select()
		.from(tournaments)
		.where(eq(tournaments.id, match.tournamentId));
	const lineup = await connection.select().from(gameLineups).where(eq(gameLineups.gameId, gameId));
	const playerIds = lineup.flatMap((row) => (row.playerId ? [row.playerId] : []));
	const profiles = playerIds.length
		? await connection.select().from(players).where(inArray(players.id, playerIds))
		: [];
	const statistics = await connection
		.select()
		.from(gamePlayerStatistics)
		.where(eq(gamePlayerStatistics.gameId, gameId));
	const [meta] = await connection
		.select()
		.from(gameStatisticsMeta)
		.where(eq(gameStatisticsMeta.gameId, gameId));
	const [map] = game.mapId
		? await connection.select().from(maps).where(eq(maps.id, game.mapId))
		: [];
	const resources = await connection.select().from(agents).orderBy(agents.id);
	return {
		game,
		match,
		tournament,
		lineup,
		profiles,
		statistics,
		meta: meta ?? null,
		map: map ?? null,
		agents: resources
	};
}
type Context = Awaited<ReturnType<typeof loadPostGameContext>>;

function validateReport(report: NormalizedPostGameReport) {
	if (
		!report ||
		!['henrikdev', 'spectra'].includes(report.provider) ||
		typeof report.externalMatchId !== 'string' ||
		!report.externalMatchId.trim() ||
		report.externalMatchId.length > 512 ||
		!Array.isArray(report.players) ||
		report.players.length !== 10 ||
		!Array.isArray(report.teams) ||
		report.teams.length !== 2 ||
		!report.map ||
		typeof report.completed !== 'boolean'
	)
		throw new SaveError('invalid', 'A normalized ten-player report with two teams is required.');
	const nullableString = (value: unknown) =>
		value === null || (typeof value === 'string' && value.length <= 512);
	const metric = (value: unknown) =>
		value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
	if (
		!nullableString(report.startedAt) ||
		!nullableString(report.map.externalId) ||
		!nullableString(report.map.name) ||
		report.teams.some(
			(row) =>
				!row ||
				typeof row.key !== 'string' ||
				!row.key ||
				row.key.length > 512 ||
				!metric(row.score) ||
				!(row.won === null || typeof row.won === 'boolean')
		) ||
		report.players.some(
			(row) =>
				!row ||
				['externalPlayerId', 'riotId', 'teamKey', 'agentExternalId', 'agentName'].some(
					(field) => !nullableString(row[field as keyof typeof row])
				) ||
				statisticFields.some((field) => !metric(row[field]))
		)
	)
		throw new SaveError('invalid', 'The report contains invalid identities or statistics.');
}
function parseMappings(value: PostGameMappings = {}): PostGameMappings {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.entries(value).some(
			([index, playerId]) =>
				!/^[0-9]$/.test(index) || typeof playerId !== 'string' || !playerId || playerId.length > 512
		)
	)
		throw new SaveError('invalid', 'Map provider player indices 0–9 to saved local player IDs.');
	return { ...value };
}
const metrics = (value?: Partial<PostGameMetrics> | null): PostGameMetrics =>
	Object.fromEntries(
		statisticFields.map((field) => [field, value?.[field] ?? null])
	) as PostGameMetrics;
const duplicate = (values: Array<string | null>) =>
	values.some((value, index) => value !== null && values.indexOf(value) !== index);

/** Pure mapping/conflict calculation; always use the actual saved game lineup. */
export function buildPostGameReview(
	context: Context,
	report: NormalizedPostGameReport,
	mappings: PostGameMappings = {}
) {
	validateReport(report);
	mappings = parseMappings(mappings);
	const validation: string[] = [];
	const entries = [context.match.teamAEntryId, context.match.teamBEntryId];
	const localPlayers = context.lineup.flatMap((row) => {
		const profile = context.profiles.find((item) => item.id === row.playerId);
		return profile
			? [
					{
						playerId: profile.id,
						entryId: row.entryId,
						displayName: profile.displayName,
						riotId: profile.riotId
					}
				]
			: [];
	});
	if (!report.completed) validation.push('The provider report is not complete.');
	if (context.tournament.archivedAt) validation.push('Unarchive the tournament before importing.');
	if (
		(context.match.resultType && context.match.resultType !== 'normal') ||
		(context.game.resultType && context.game.resultType !== 'normal')
	)
		validation.push('This game or match has a non-played result.');
	if (
		context.lineup.length !== 10 ||
		localPlayers.length !== 10 ||
		entries[0] === entries[1] ||
		entries.some(
			(entryId) =>
				context.lineup.filter((row) => row.entryId === entryId && row.playerId).length !== 5
		) ||
		context.lineup.some((row) => !entries.includes(row.entryId))
	)
		validation.push('Save exactly five players for each of the game’s two teams.');
	const mapMatches =
		context.map &&
		(report.map.externalId && context.map.valorantApiUuid
			? canonical(report.map.externalId) === canonical(context.map.valorantApiUuid)
			: report.map.name &&
				[context.map.key, context.map.displayName].some(
					(name) => canonical(name) === canonical(report.map.name!)
				));
	if (!mapMatches) validation.push('The provider map does not match the selected game map.');
	const providerIds = report.players.map((row) => riotIdentity(row.riotId));
	const localIds = localPlayers.map((row) => riotIdentity(row.riotId));
	if (
		duplicate(providerIds) ||
		duplicate(localIds) ||
		duplicate(report.players.map((row) => row.externalPlayerId))
	)
		validation.push('Duplicate player identity evidence must be corrected before import.');
	if (duplicate(report.teams.map((row) => row.key)))
		validation.push('The provider teams are not distinct.');
	if (
		report.teams.some(
			(team) => report.players.filter((row) => row.teamKey === team.key).length !== 5
		) ||
		report.players.some((row) => !report.teams.some((team) => team.key === row.teamKey))
	)
		validation.push('The report must contain five actual game players on each provider team.');
	const sameReport =
		context.meta?.importSource === report.provider &&
		context.meta.externalMatchId === report.externalMatchId;
	const replacement =
		!!(context.meta?.importSource || context.meta?.externalMatchId) && !sameReport;
	const selected = new Set<string>();
	const approvedMappings: PostGameMappings = {};
	const rows: PostGameReviewPlayer[] = report.players.map((provider, providerIndex) => {
		const exact = providerIds[providerIndex]
			? localPlayers.filter((row) => riotIdentity(row.riotId) === providerIds[providerIndex])
			: [];
		const manualId = mappings[String(providerIndex)];
		const local = manualId
			? localPlayers.find((row) => row.playerId === manualId)
			: exact.length === 1
				? exact[0]
				: undefined;
		let mappingState: PostGameReviewPlayer['mappingState'] = manualId
			? 'manual'
			: local
				? 'exact'
				: 'unresolved';
		if (
			(manualId && (!local || (exact.length === 1 && exact[0].playerId !== manualId))) ||
			exact.length > 1 ||
			(local && selected.has(local.playerId))
		) {
			mappingState = 'conflicting';
			validation.push(`Provider player ${providerIndex + 1} has a contradictory mapping.`);
		}
		if (local) {
			selected.add(local.playerId);
			approvedMappings[String(providerIndex)] = local.playerId;
		}
		const lineup = context.lineup.find((row) => row.playerId === local?.playerId);
		const saved = context.statistics.find((row) => row.playerId === local?.playerId);
		const currentAgent = context.agents.find((row) => row.id === lineup?.agentId);
		const candidates = provider.agentExternalId
			? context.agents.filter(
					(row) =>
						row.valorantApiUuid &&
						canonical(row.valorantApiUuid) === canonical(provider.agentExternalId!)
				)
			: [];
		const named = provider.agentName
			? context.agents.filter((row) =>
					[row.key, row.displayName].some(
						(name) => canonical(name) === canonical(provider.agentName!)
					)
				)
			: [];
		const contradictoryAgent =
			candidates.length === 1 && named.length === 1 && candidates[0].id !== named[0].id;
		const agent = contradictoryAgent
			? null
			: candidates.length === 1
				? candidates[0]
				: named.length === 1
					? named[0]
					: null;
		if (contradictoryAgent)
			validation.push(`Provider player ${providerIndex + 1} has contradictory agent identity evidence.`);
		else if (
			((provider.agentExternalId || provider.agentName) && !agent) ||
			(agent && !agent.isActive && agent.id !== lineup?.agentId)
		)
			validation.push(`Provider player ${providerIndex + 1} needs a valid active agent resource.`);
		const current = {
			...metrics(saved),
			agentId: lineup?.agentId ?? null,
			agentName: currentAgent?.displayName ?? null
		};
		const proposed = {
			...metrics(provider),
			agentId: agent?.id ?? null,
			agentName: agent?.displayName ?? null
		};
		const statDiff = statisticFields.some((field) => current[field] !== proposed[field]);
		const losesKnownStat = statisticFields.some(
			(field) => current[field] !== null && proposed[field] === null
		);
		const changesKnownStat = statisticFields.some(
			(field) => current[field] !== null && current[field] !== proposed[field]
		);
		const agentDiff = current.agentId !== proposed.agentId;
		return {
			providerIndex,
			providerIdentity: {
				externalPlayerId: provider.externalPlayerId,
				riotId: provider.riotId,
				teamKey: provider.teamKey
			},
			mappingState,
			playerId: local?.playerId ?? null,
			entryId: local?.entryId ?? null,
			localIdentity: local ? { displayName: local.displayName, riotId: local.riotId } : null,
			current,
			proposed,
			availability: {
				...Object.fromEntries(statisticFields.map((field) => [field, provider[field] !== null])),
				agent: !!agent
			} as PostGameReviewPlayer['availability'],
			conflicts: {
				statistics:
					!!local &&
					statDiff &&
					(replacement || sameReport
						? replacement || !!saved?.statisticsManualOverride || losesKnownStat
						: changesKnownStat),
				agent:
					!!local &&
					agentDiff &&
					(replacement || sameReport
						? replacement ||
							!!saved?.agentManualOverride ||
							(!saved && current.agentId !== null) ||
							(current.agentId !== null && proposed.agentId === null)
						: current.agentId !== null)
			},
			manual: {
				statistics: !!saved?.statisticsManualOverride,
				agent: !!saved?.agentManualOverride,
				statisticsEditedAt: iso(saved?.manuallyEditedAt),
				agentEditedAt: iso(saved?.agentManuallyEditedAt)
			}
		};
	});
	const teamMappings = report.teams.map((team) => {
		const providerRows = rows.filter((row) => row.providerIdentity.teamKey === team.key);
		const mappedEntries = [
			...new Set(providerRows.flatMap((row) => (row.entryId ? [row.entryId] : [])))
		];
		if (mappedEntries.length > 1)
			validation.push('A provider team maps to players from both local teams.');
		return {
			teamKey: team.key,
			entryId:
				providerRows.every((row) => row.playerId && row.mappingState !== 'conflicting') &&
				mappedEntries.length === 1
					? mappedEntries[0]
					: null
		};
	});
	if (
		teamMappings.every((row) => row.entryId) &&
		new Set(teamMappings.map((row) => row.entryId)).size !== 2
	)
		validation.push('Both provider teams cannot map to the same local team.');
	if (context.game.resultType === 'normal') {
		const teamA = report.teams.find(
			(team) => teamMappings.find((row) => row.teamKey === team.key)?.entryId === entries[0]
		);
		const teamB = report.teams.find(
			(team) => teamMappings.find((row) => row.teamKey === team.key)?.entryId === entries[1]
		);
		if (
			teamA &&
			teamB &&
			((teamA.score !== null && teamA.score !== context.game.scoreA) ||
				(teamB.score !== null && teamB.score !== context.game.scoreB) ||
				(teamA.won !== null && teamA.won !== (context.game.winnerEntryId === entries[0])) ||
				(teamB.won !== null && teamB.won !== (context.game.winnerEntryId === entries[1])))
		)
			validation.push('The provider score contradicts the saved final game result.');
	}
	return {
		gameId: context.game.id,
		gameRevision: context.game.revision,
		provider: report.provider,
		externalMatchId: report.externalMatchId,
		startedAt: report.startedAt,
		map: { current: context.map?.displayName ?? null, proposed: report.map.name },
		score: {
			local: { teamA: context.game.scoreA, teamB: context.game.scoreB },
			provider: report.teams.map((team) => ({
				teamKey: team.key,
				score: team.score,
				entryId: teamMappings.find((row) => row.teamKey === team.key)?.entryId ?? null
			}))
		},
		provenance: {
			importSource: context.meta?.importSource ?? null,
			externalMatchId: context.meta?.externalMatchId ?? null,
			importedAt: iso(context.meta?.importedAt)
		},
		replacement,
		validation,
		teamMappings,
		mappings: approvedMappings,
		localPlayers,
		players: rows,
		canConfirm:
			!validation.length &&
			rows.every((row) => row.playerId && ['exact', 'manual'].includes(row.mappingState)) &&
			!replacement &&
			rows.every((row) => !row.conflicts.statistics && !row.conflicts.agent)
	};
}

type CachedReview = {
	gameId: string;
	revision: number;
	report: NormalizedPostGameReport;
	mappings: PostGameMappings;
	fingerprint: string;
	expiresAt: number;
	preview: PostGameReview;
};
// ponytail: process-local bounded cache; shared TTL storage if the admin runs across multiple processes.
const reviews = new Map<string, CachedReview>();
const REVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_REVIEWS = 100;
function expireReviews() {
	for (const [token, review] of reviews) if (review.expiresAt <= Date.now()) reviews.delete(token);
}
function cachedReview(token: string, gameId: string) {
	expireReviews();
	const review = typeof token === 'string' ? reviews.get(token) : undefined;
	if (!review || review.gameId !== gameId)
		throw new SaveError(
			'stale',
			'This review expired or belongs to another game. Fetch and review again.'
		);
	return review;
}
function fingerprint(context: Context) {
	return JSON.stringify(context);
}

export async function createPostGameReview(input: {
	gameId: string;
	expectedGameRevision: number;
	report: NormalizedPostGameReport;
	mappings?: PostGameMappings;
}): Promise<PostGameReview> {
	validateReport(input.report);
	const report = structuredClone(input.report);
	const mappings = parseMappings(input.mappings);
	const context = await loadPostGameContext(input.gameId);
	if (context.game.revision !== input.expectedGameRevision)
		throw new SaveError('stale', 'The game changed. Reload before reviewing.');
	const preview = buildPostGameReview(context, report, mappings);
	const associated = await db
		.select()
		.from(gameStatisticsMeta)
		.where(
			and(
				eq(gameStatisticsMeta.importSource, report.provider),
				eq(gameStatisticsMeta.externalMatchId, report.externalMatchId)
			)
		);
	if (associated.some((row) => row.gameId !== input.gameId)) {
		preview.validation.push('This provider report is already associated with another game.');
		preview.canConfirm = false;
	}
	expireReviews();
	while (reviews.size >= MAX_REVIEWS) reviews.delete(reviews.keys().next().value!);
	const token = randomUUID();
	const expiresAt = Date.now() + REVIEW_TTL_MS;
	const result = { ...preview, token, expiresAt: new Date(expiresAt).toISOString() };
	reviews.set(token, {
		gameId: input.gameId,
		revision: input.expectedGameRevision,
		report,
		mappings,
		fingerprint: fingerprint(context),
		expiresAt,
		preview: structuredClone(result)
	});
	return result;
}

export async function revisePostGameReview(input: {
	token: string;
	gameId: string;
	mappings: PostGameMappings;
}) {
	const review = cachedReview(input.token, input.gameId);
	// Invalidate before validation, so a rejected mapping cannot leave an old confirmable token.
	reviews.delete(input.token);
	return createPostGameReview({
		gameId: review.gameId,
		expectedGameRevision: review.revision,
		report: review.report,
		mappings: input.mappings
	});
}

function validateResolutions(value: PostGameResolutions = {}, preview: PostGameReview) {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new SaveError('invalid', 'Submit scoped player conflict choices.');
	for (const [playerId, choices] of Object.entries(value)) {
		const row = preview.players.find((item) => item.playerId === playerId);
		if (
			!row ||
			!choices ||
			typeof choices !== 'object' ||
			Array.isArray(choices) ||
			Object.entries(choices).some(
				([key, choice]) =>
					!['statistics', 'agent'].includes(key) ||
					!['keep-local', 'use-provider'].includes(choice) ||
					!row.conflicts[key as 'statistics' | 'agent']
			)
		)
			throw new SaveError(
				'invalid',
				'Choose keep local or use provider only for an active statistics or agent conflict.'
			);
	}
	for (const row of preview.players)
		for (const group of ['statistics', 'agent'] as const)
			if (row.conflicts[group] && !value[row.playerId!]?.[group])
				throw new SaveError(
					'blocked',
					'Resolve every player statistics and agent conflict before importing.'
				);
	return value;
}

export async function importPostGameReport(input: {
	token: string;
	gameId: string;
	expectedGameRevision: number;
	mappings?: PostGameMappings;
	resolutions?: PostGameResolutions;
	confirmReplacement?: boolean;
}) {
	const review = cachedReview(input.token, input.gameId);
	if (
		review.revision !== input.expectedGameRevision ||
		(input.mappings &&
			JSON.stringify(parseMappings(input.mappings)) !== JSON.stringify(review.preview.mappings))
	)
		throw new SaveError(
			'stale',
			'Mappings or game revision changed. Review again before importing.'
		);
	try {
		const gameRevision = await db.transaction(async (tx) => {
			const game = await bumpGameRevision(tx, input.gameId, input.expectedGameRevision);
			const context = await loadPostGameContext(game.id, tx);
			await assertTournamentWritable(tx, context.match.tournamentId);
			// Compare against the pre-lock revision, ignoring only the revision lock's updatedAt change.
			const originalGame = JSON.parse(review.fingerprint).game;
			const comparison = {
				...context,
				game: {
					...context.game,
					revision: review.revision,
					updatedAt: originalGame.updatedAt
						? new Date(originalGame.updatedAt)
						: context.game.updatedAt
				}
			};
			if (fingerprint(comparison) !== review.fingerprint)
				throw new SaveError(
					'stale',
					'The lineup, profiles, resources or saved data changed. Review again.'
				);
			const preview = buildPostGameReview(context, review.report, review.mappings);
			if (
				preview.validation.length ||
				preview.players.some(
					(row) => !row.playerId || !['exact', 'manual'].includes(row.mappingState)
				)
			)
				throw new SaveError(
					'blocked',
					'Correct report validation and player mappings before importing.'
				);
			if (preview.replacement && input.confirmReplacement !== true)
				throw new SaveError(
					'blocked',
					'Explicitly confirm replacing the current provider report association.'
				);
			const resolutions = validateResolutions(input.resolutions, {
				...review.preview,
				players: preview.players
			});
			const associated = await tx
				.select()
				.from(gameStatisticsMeta)
				.where(
					and(
						eq(gameStatisticsMeta.importSource, review.report.provider),
						eq(gameStatisticsMeta.externalMatchId, review.report.externalMatchId)
					)
				);
			if (associated.some((row) => row.gameId !== game.id))
				throw new SaveError(
					'blocked',
					'This provider report is already associated with another game.'
				);
			const now = new Date(
				Math.max(
					Date.now(),
					(context.meta?.importedAt?.getTime() ?? 0) + 1,
					...context.statistics.flatMap((row) => [
						(row.manuallyEditedAt?.getTime() ?? 0) + 1,
						(row.agentManuallyEditedAt?.getTime() ?? 0) + 1
					])
				)
			);
			for (const row of preview.players) {
				const saved = context.statistics.find((item) => item.playerId === row.playerId);
				const choices = resolutions[row.playerId!];
				const keepStats = choices?.statistics === 'keep-local';
				const keepAgent = choices?.agent === 'keep-local';
				const firstImport = !context.meta?.importedAt;
				const manualStats =
					!!saved?.statisticsManualOverride ||
					(firstImport && statisticFields.some((field) => row.current[field] !== null));
				const manualAgent =
					!!saved?.agentManualOverride || ((firstImport || !saved) && row.current.agentId !== null);
				const values = {
					gameId: game.id,
					playerId: row.playerId!,
					entryId: row.entryId!,
					...metrics(keepStats ? row.current : row.proposed),
					statisticsManualOverride:
						choices?.statistics !== 'use-provider' &&
						(manualStats || (keepStats && row.conflicts.statistics)),
					agentManualOverride:
						choices?.agent !== 'use-provider' &&
						(manualAgent || (keepAgent && row.conflicts.agent)),
					manuallyEditedAt: saved?.manuallyEditedAt ?? null,
					agentManuallyEditedAt: saved?.agentManuallyEditedAt ?? null
				};
				await tx
					.insert(gamePlayerStatistics)
					.values(values)
					.onConflictDoUpdate({
						target: [gamePlayerStatistics.gameId, gamePlayerStatistics.playerId],
						set: values
					});
				if (!keepAgent && row.current.agentId !== row.proposed.agentId)
					await tx
						.update(gameLineups)
						.set({ agentId: row.proposed.agentId })
						.where(and(eq(gameLineups.gameId, game.id), eq(gameLineups.playerId, row.playerId!)));
			}
			await tx
				.insert(gameStatisticsMeta)
				.values({
					gameId: game.id,
					importSource: review.report.provider,
					externalMatchId: review.report.externalMatchId,
					importedAt: now
				})
				.onConflictDoUpdate({
					target: gameStatisticsMeta.gameId,
					set: {
						importSource: review.report.provider,
						externalMatchId: review.report.externalMatchId,
						importedAt: now
					}
				});
			return game.revision;
		});
		reviews.delete(input.token);
		return { gameRevision, ...(await getGameStatistics(input.gameId)) };
	} catch (cause) {
		if (hasDatabaseError(cause, 'game_statistics_meta.import_source'))
			throw new SaveError(
				'blocked',
				'This provider report is already associated with another game.'
			);
		throw cause;
	}
}

export async function discardGamePlayerStatistics(input: {
	gameId: string;
	expectedGameRevision: number;
	playerId: string;
	confirmation: boolean;
}) {
	if (input.confirmation !== true || typeof input.playerId !== 'string' || !input.playerId)
		throw new SaveError('invalid', 'Confirm discarding saved statistics for the selected player.');
	const gameRevision = await db.transaction(async (tx) => {
		const game = await bumpGameRevision(tx, input.gameId, input.expectedGameRevision);
		const [match] = await tx.select().from(matches).where(eq(matches.id, game.matchId));
		await assertTournamentWritable(tx, match.tournamentId);
		const [saved] = await tx
			.select()
			.from(gamePlayerStatistics)
			.where(
				and(
					eq(gamePlayerStatistics.gameId, game.id),
					eq(gamePlayerStatistics.playerId, input.playerId)
				)
			);
		if (!saved) throw new SaveError('not-found', 'This player has no saved statistics to discard.');
		const [meta] = await tx
			.select({ importedAt: gameStatisticsMeta.importedAt })
			.from(gameStatisticsMeta)
			.where(eq(gameStatisticsMeta.gameId, game.id));
		if (!meta?.importedAt || statisticFields.some((field) => saved[field] !== null))
			throw new SaveError(
				'blocked',
				'Only an imported player row with all statistics cleared can be discarded.'
			);
		await tx
			.delete(gamePlayerStatistics)
			.where(
				and(
					eq(gamePlayerStatistics.gameId, game.id),
					eq(gamePlayerStatistics.playerId, input.playerId)
				)
			);
		return game.revision;
	});
	return { gameRevision, ...(await getGameStatistics(input.gameId)) };
}
