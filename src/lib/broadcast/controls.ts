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
export type PlayerStatsControl = {
	mode: 'single' | 'head-to-head';
	scope: BroadcastScope;
	playerId: string | null;
	opponentPlayerId: string | null;
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
	opponentPlayerId: null
};
