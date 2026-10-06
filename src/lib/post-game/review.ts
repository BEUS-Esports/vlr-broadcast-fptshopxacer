import type { NormalizedPostGamePlayer, PostGameProviderId } from './types';

export type PostGameMappings = Record<string, string>;
export type PostGameResolutions = Record<
	string,
	{ statistics?: 'keep-local' | 'use-provider'; agent?: 'keep-local' | 'use-provider' }
>;
export type PostGameMetrics = Pick<
	NormalizedPostGamePlayer,
	| 'kills'
	| 'deaths'
	| 'assists'
	| 'performanceScore'
	| 'trades'
	| 'firstBloods'
	| 'plants'
	| 'defuses'
>;
export type PostGameReviewPlayer = {
	providerIndex: number;
	providerIdentity: {
		externalPlayerId: string | null;
		riotId: string | null;
		teamKey: string | null;
	};
	mappingState: 'exact' | 'manual' | 'unresolved' | 'conflicting';
	playerId: string | null;
	entryId: string | null;
	localIdentity: { displayName: string; riotId: string | null } | null;
	current: PostGameMetrics & { agentId: string | null; agentName: string | null };
	proposed: PostGameMetrics & { agentId: string | null; agentName: string | null };
	availability: Record<keyof PostGameMetrics | 'agent', boolean>;
	conflicts: { statistics: boolean; agent: boolean };
	manual: {
		statistics: boolean;
		agent: boolean;
		statisticsEditedAt: string | null;
		agentEditedAt: string | null;
	};
};
export type PostGameReview = {
	token: string;
	expiresAt: string;
	gameId: string;
	gameRevision: number;
	provider: PostGameProviderId;
	externalMatchId: string;
	startedAt: string | null;
	map: { current: string | null; proposed: string | null };
	score: {
		local: { teamA: number | null; teamB: number | null };
		provider: Array<{ teamKey: string; score: number | null; entryId: string | null }>;
	};
	provenance: {
		importSource: string | null;
		externalMatchId: string | null;
		importedAt: string | null;
	};
	replacement: boolean;
	validation: string[];
	teamMappings: Array<{ teamKey: string; entryId: string | null }>;
	mappings: PostGameMappings;
	localPlayers: Array<{
		playerId: string;
		entryId: string;
		displayName: string;
		riotId: string | null;
	}>;
	players: PostGameReviewPlayer[];
	canConfirm: boolean;
};
