import { statisticFields, type StatisticField } from '#lib/statistics/fields.ts';

export const lineupTeams = ['both', 'team-a', 'team-b', 'winner'] as const;
export type LineupTeams = (typeof lineupTeams)[number];
export const graphicIds = [
	'player-lineup',
	'player-stats',
	'map-veto',
	'agent-select',
	'in-game',
	'post-game',
	'mvp'
] as const;
export const broadcastScopes = ['game', 'match', 'tournament'] as const;
export type BroadcastScope = (typeof broadcastScopes)[number];
export type GraphicId = (typeof graphicIds)[number];
export const graphicLabels: Record<GraphicId, string> = {
	'player-lineup': 'Player Lineup',
	'player-stats': 'Player Stats',
	'map-veto': 'Map Veto',
	'agent-select': 'Agent Select',
	'in-game': 'In-Game',
	'post-game': 'Post-Game',
	mvp: 'MVP'
};
export type GraphicVisibility = Record<GraphicId, boolean>;
export type ProgramOutput = 'standalone' | 'composite';
/** Composite stacking layer per graphic; graphics sharing a layer replace each other. */
export const graphicLayers: Record<GraphicId, number> = {
	'in-game': 0,
	'player-lineup': 1,
	'player-stats': 1,
	'map-veto': 1,
	'post-game': 1,
	mvp: 1,
	'agent-select': 2
};
/** The composite layer holding the fullscreen graphics; the only one a stinger plays over. */
export const fullscreenLayer = 1;
export const layerNumbers: readonly number[] = [...new Set(Object.values(graphicLayers))].sort(
	(a, b) => a - b
);
export type PlayerStatsControl = {
	mode: 'single' | 'head-to-head';
	scope: BroadcastScope;
	playerId: string | null;
	opponentPlayerId: string | null;
	fields: StatisticField[];
};
export const defaultVisibility: GraphicVisibility = {
	'player-lineup': false,
	'player-stats': false,
	'map-veto': false,
	'agent-select': false,
	'in-game': false,
	'post-game': false,
	mvp: false
};
export const defaultPlayerStats: PlayerStatsControl = {
	mode: 'single',
	scope: 'game',
	playerId: null,
	opponentPlayerId: null,
	fields: [...statisticFields]
};
