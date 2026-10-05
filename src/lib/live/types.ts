export type LiveProviderId = 'spectra' | 'gstack';
export type LiveProviderSide = 'left' | 'right' | 'team-0' | 'team-1';
export type LiveGamePhase =
	'unknown' | 'lobby' | 'agent-select' | 'buy' | 'combat' | 'post-round' | 'game-end';
export type LiveProviderHealth =
	'disabled' | 'connecting' | 'live' | 'retrying' | 'fallback' | 'ready' | 'error';
export type LiveAbilityCharge = { current: number | null; capacity: number | null };
export type LiveAbilityState = Record<'grenade' | 'ability1' | 'ability2', LiveAbilityCharge>;
export type LiveUltimateState = {
	ready: boolean | null;
	current: number | null;
	required: number | null;
};
export type LiveShieldState = {
	raw: string | null;
	kind: 'none' | 'light' | 'heavy' | 'regen' | 'standard' | 'unknown';
	current: number | null;
	extra: number | null;
};
export type LivePlayerCapabilities = {
	health: boolean;
	abilities: boolean;
	enhancedHealth: boolean;
	enhancedShield: boolean;
	scoreboard: boolean;
};
export type LivePlayerState = {
	providerKey: string;
	providerSlot: number | null;
	playerId: string | null;
	entryId: string | null;
	observedName: string | null;
	agent: string | null;
	weapon: string | null;
	alive: boolean | null;
	observed: boolean | null;
	hasSpike: boolean | null;
	health: number | null;
	extraHealth: number | null;
	shield: LiveShieldState;
	kills: number | null;
	deaths: number | null;
	assists: number | null;
	credits: number | null;
	ultimate: LiveUltimateState;
	abilities: LiveAbilityState;
	capabilities: LivePlayerCapabilities;
};
export type LiveTeamState = {
	providerSide: LiveProviderSide;
	entryId: string | null;
	observedName: string | null;
	score: number | null;
	attacking: boolean | null;
	players: LivePlayerState[];
};
export type LiveSpikeState = {
	state: 'unknown' | 'carried' | 'dropped' | 'planted' | 'defused' | 'detonated';
	carrierPlayerId: string | null;
	carrierRaw: string | null;
	raw: string | null;
};
export type LiveRoundResult = {
	round: number;
	winnerProviderSide: LiveProviderSide;
	reason: 'defuse' | 'elimination' | 'time' | 'detonation';
};
export type LiveGameState = {
	version: 1;
	provider: LiveProviderId;
	generation: number;
	selectedGameId: string | null;
	phase: LiveGamePhase;
	roundNumber: number | null;
	map: string | null;
	spike: LiveSpikeState;
	teams: LiveTeamState[];
	rounds: LiveRoundResult[];
	roundHistory: { leftRaw: string | null; rightRaw: string | null };
	receivedAt: number;
};
export type LiveSessionStatus = {
	provider: LiveProviderId | null;
	generation: number;
	selectedGameId: string | null;
	health: LiveProviderHealth;
	mode: 'native' | 'external';
	mappingReady: boolean;
	retryAttempt: number;
	nextRetryAt: number | null;
	lastReceivedAt: number | null;
	lastError: string | null;
	attribution: 'supporter' | 'required' | 'unknown' | 'invalid-key';
};
export type LiveGameEnvelope = {
	version: 1;
	stream: { epoch: string; sequence: number };
	state: LiveGameState | null;
	status: LiveSessionStatus;
};
export type LiveNormalizationContext = {
	generation: number;
	selectedGameId: string | null;
	receivedAt: number;
};
