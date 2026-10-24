import type { BroadcastScope, GraphicVisibility, PlayerStatsControl } from './controls';
import { broadcastScopes, graphicIds } from './controls';
import type { StatisticsView } from '../server/services/statistics-aggregation';
import {
	isBroadcastPauseState,
	isBroadcastCeremonyEvent,
	type BroadcastPauseState,
	type BroadcastCeremonyEvent
} from './in-game-controls';

export type BroadcastPlayer = {
	playerId: string;
	displayName: string;
	portraitPath: string | null;
};
export type BroadcastMap = {
	id: string;
	key: string;
	displayName: string;
	displayIconPath: string | null;
	listViewIconPath: string | null;
	splashPath: string | null;
	stylizedBackgroundPath: string | null;
};
export type BroadcastAgent = {
	id: string;
	key: string;
	displayName: string;
	roleName: string | null;
	displayIconPath: string | null;
	fullPortraitPath: string | null;
	bustPortraitPath: string | null;
	roleIconPath: string | null;
};
export type BroadcastTeam = {
	entryId: string;
	teamId: string;
	name: string;
	tag: string;
	logoPath: string | null;
	logoWhitePath: string | null;
	logoBlackPath: string | null;
};
export type BroadcastResult = {
	resultType: 'normal' | 'forfeit' | 'walkover' | 'cancelled' | null;
	winnerEntryId: string | null;
};
export type BroadcastScopeView = {
	usesSpectra?: boolean;
	statistics: StatisticsView;
	candidates: Array<BroadcastPlayer & { entryIds: string[] }>;
	mvpPlayerId: string | null;
};
export type BroadcastPreparedSnapshot = {
	version: 3;
	/** Optimistic-lock revision for operator broadcast controls only. */
	controlRevision: number;
	/** Persisted invalidation revision for prepared tournament/match/game data. */
	dataRevision: number;
	liveControls: {
		swapped: boolean;
		currentAttackersEntryId: string | null;
		pause: BroadcastPauseState;
		ceremony: BroadcastCeremonyEvent;
	};
	selection: { tournamentId: string; matchId: string; gameId: string } | null;
	tournament: { id: string; name: string; slug: string } | null;
	match:
		| ({
				id: string;
				label: string;
				bestOf: number;
				scoreA: number;
				scoreB: number;
		  } & BroadcastResult)
		| null;
	game:
		| ({
				id: string;
				name: string;
				number: number;
				map: BroadcastMap | null;
				scoreA: number | null;
				scoreB: number | null;
		  } & BroadcastResult)
		| null;
	competition: { teamAEntryId: string | null; teamBEntryId: string | null };
	presentation: { leftEntryId: string | null; rightEntryId: string | null };
	sides: {
		preparedAttackersEntryId: string | null;
		preparedDefendersEntryId: string | null;
		attackersEntryId: string | null;
		defendersEntryId: string | null;
		source: 'manual' | 'prepared' | 'unknown';
	};
	teams: BroadcastTeam[];
	lineups: Array<{
		entryId: string;
		slot: number;
		player: BroadcastPlayer | null;
		agent: BroadcastAgent | null;
	}>;
	veto: Array<{
		sequence: number;
		action: 'ban' | 'pick' | 'decider';
		map: BroadcastMap;
		actingEntryId: string | null;
		gameNumber: number | null;
		sideChooserEntryId: string | null;
		sideChoice: 'attack' | 'defense' | null;
	}>;
	scopes: Record<BroadcastScope, BroadcastScopeView>;
	controls: {
		visibility: GraphicVisibility;
		playerStats: PlayerStatsControl;
		mvpScope: BroadcastScope;
	};
	readiness: {
		selected: boolean;
		map: boolean;
		lineups: boolean;
		agents: boolean;
		result: boolean;
	};
};

/** Latest saved projection plus independent, non-recursive program captures. */
export type BroadcastPublications = Record<
	import('./controls').GraphicId,
	BroadcastPreparedSnapshot | null
>;
export type BroadcastSnapshot = BroadcastPreparedSnapshot & { publications: BroadcastPublications };

export type BroadcastStreamCursor = {
	epoch: string;
	sequence: number;
};

export type BroadcastEnvelope = {
	version: 1;
	stream: BroadcastStreamCursor;
	snapshot: BroadcastSnapshot;
};

type Check = (value: unknown) => boolean;
const string: Check = (v) => typeof v === 'string';
const number: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const integer: Check = (v) => number(v) && Number.isSafeInteger(v) && (v as number) >= 0;
const boolean: Check = (v) => typeof v === 'boolean';
const oneOf =
	(...values: unknown[]): Check =>
	(v) =>
		values.includes(v);
const nullable =
	(check: Check): Check =>
	(v) =>
		v === null || check(v);
const array =
	(check: Check): Check =>
	(v) =>
		Array.isArray(v) && v.every(check);
const object =
	(fields: Record<string, Check>): Check =>
	(v) => {
		if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
		const record = v as Record<string, unknown>;
		return (
			Object.keys(record).length === Object.keys(fields).length &&
			Object.entries(fields).every(
				([key, check]) => Object.hasOwn(record, key) && check(record[key])
			)
		);
	};
const text = nullable(string);
const player = { playerId: string, displayName: string, portraitPath: text };
const map = object({
	id: string,
	key: string,
	displayName: string,
	displayIconPath: text,
	listViewIconPath: text,
	splashPath: text,
	stylizedBackgroundPath: text
});
const metric = object({ value: nullable(number), coverage: oneOf('complete', 'partial', 'none') });
const statistics = object({
	scope: oneOf(...broadcastScopes),
	gamesTotal: integer,
	gamesContributing: integer,
	players: array(
		object({
			playerId: string,
			displayName: string,
			entryIds: array(string),
			gamesPlayed: integer,
			gamesWithStatistics: integer,
			kills: metric,
			deaths: metric,
			assists: metric,
			trades: metric,
			firstBloods: metric,
			plants: metric,
			defuses: metric,
			performanceScore: metric
		})
	)
});
const scope: Check = (value) =>
	object({
		...(value && typeof value === 'object' && Object.hasOwn(value, 'usesSpectra')
			? { usesSpectra: boolean }
			: {}),
		statistics,
		candidates: array(object({ ...player, entryIds: array(string) })),
		mvpPlayerId: text
	})(value);
const result = {
	resultType: nullable(oneOf('normal', 'forfeit', 'walkover', 'cancelled')),
	winnerEntryId: text
};
const preparedFields = {
	version: oneOf(3),
	controlRevision: (v: unknown) => integer(v) && (v as number) > 0,
	dataRevision: (v: unknown) => integer(v) && (v as number) > 0,
	liveControls: object({
		swapped: boolean,
		currentAttackersEntryId: text,
		pause: isBroadcastPauseState,
		ceremony: isBroadcastCeremonyEvent
	}),
	selection: nullable(object({ tournamentId: string, matchId: string, gameId: string })),
	tournament: nullable(object({ id: string, name: string, slug: string })),
	match: nullable(
		object({
			id: string,
			label: string,
			bestOf: oneOf(1, 2, 3, 5),
			scoreA: integer,
			scoreB: integer,
			...result
		})
	),
	game: nullable(
		object({
			id: string,
			name: string,
			number: integer,
			map: nullable(map),
			scoreA: nullable(integer),
			scoreB: nullable(integer),
			...result
		})
	),
	competition: object({ teamAEntryId: text, teamBEntryId: text }),
	presentation: object({ leftEntryId: text, rightEntryId: text }),
	sides: object({
		preparedAttackersEntryId: text,
		preparedDefendersEntryId: text,
		attackersEntryId: text,
		defendersEntryId: text,
		source: oneOf('manual', 'prepared', 'unknown')
	}),
	teams: array(
		object({
			entryId: string,
			teamId: string,
			name: string,
			tag: string,
			logoPath: text,
			logoWhitePath: text,
			logoBlackPath: text
		})
	),
	lineups: array(
		object({
			entryId: string,
			slot: oneOf(1, 2, 3, 4, 5),
			player: nullable(object(player)),
			agent: nullable(
				object({
					id: string,
					key: string,
					displayName: string,
					roleName: text,
					displayIconPath: text,
					fullPortraitPath: text,
					bustPortraitPath: text,
					roleIconPath: text
				})
			)
		})
	),
	veto: array(
		object({
			sequence: integer,
			action: oneOf('ban', 'pick', 'decider'),
			map,
			actingEntryId: text,
			gameNumber: nullable(integer),
			sideChooserEntryId: text,
			sideChoice: nullable(oneOf('attack', 'defense'))
		})
	),
	scopes: object({ game: scope, match: scope, tournament: scope }),
	controls: object({
		visibility: object(Object.fromEntries(graphicIds.map((id) => [id, boolean]))),
		playerStats: object({
			mode: oneOf('single', 'head-to-head'),
			scope: oneOf(...broadcastScopes),
			playerId: text,
			opponentPlayerId: text
		}),
		mvpScope: oneOf(...broadcastScopes)
	}),
	readiness: object({
		selected: boolean,
		map: boolean,
		lineups: boolean,
		agents: boolean,
		result: boolean
	})
};
const preparedCheck = object(preparedFields);
const legacyPreparedCheck = object({
	...preparedFields,
	version: oneOf(2),
	liveControls: object({ swapped: boolean, currentAttackersEntryId: text })
});

function persistedPublication(value: unknown): BroadcastPreparedSnapshot | null {
	if (isBroadcastPublication(value)) return value;
	if (!legacyPreparedCheck(value)) return null;
	const old = value as Omit<BroadcastPreparedSnapshot, 'version' | 'liveControls'> & {
		liveControls: { swapped: boolean; currentAttackersEntryId: string | null };
	};
	const upgraded: BroadcastPreparedSnapshot = {
		...old,
		version: 3,
		liveControls: { ...old.liveControls, pause: { type: 'none' }, ceremony: null }
	};
	return isBroadcastPublication(upgraded) ? upgraded : null;
}

/** Publication captures require a selected render payload and never contain publications. */
export function isBroadcastPublication(value: unknown): value is BroadcastPreparedSnapshot {
	if (!preparedCheck(value)) return false;
	const prepared = value as BroadcastPreparedSnapshot;
	return (
		prepared.selection !== null &&
		prepared.game?.id === prepared.selection.gameId &&
		prepared.match?.id === prepared.selection.matchId &&
		prepared.tournament?.id === prepared.selection.tournamentId
	);
}

/** Repair malformed persisted slots without ever substituting latest saved render data. */
export function validatedPublications(value: unknown): BroadcastPublications {
	const record =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	return Object.fromEntries(
		graphicIds.map((id) => [id, persistedPublication(record[id])])
	) as BroadcastPublications;
}

const snapshotCheck = object({
	...preparedFields,
	publications: object(
		Object.fromEntries(graphicIds.map((id) => [id, nullable(isBroadcastPublication)]))
	)
});

/** Reject the entire envelope on malformed nested data; consumers only see complete snapshots. */
export function decodeBroadcastSnapshot(data: string): BroadcastSnapshot | null {
	try {
		const value: unknown = JSON.parse(data);
		return snapshotCheck(value) ? (value as BroadcastSnapshot) : null;
	} catch {
		return null;
	}
}

const envelopeCheck = object({
	version: oneOf(1),
	stream: object({
		epoch: string,
		sequence: (v) => integer(v) && (v as number) > 0
	}),
	snapshot: snapshotCheck
});

/**
 * App-level ordering is independent of persisted control/data revisions.
 * A new process epoch is accepted even when its sequence restarts from one.
 */
export function decodeBroadcastEnvelope(data: string): BroadcastEnvelope | null {
	try {
		const value: unknown = JSON.parse(data);
		return envelopeCheck(value) ? (value as BroadcastEnvelope) : null;
	} catch {
		return null;
	}
}
