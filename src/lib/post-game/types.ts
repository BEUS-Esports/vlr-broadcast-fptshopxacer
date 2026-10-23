export type PostGameProviderId = 'henrikdev' | 'spectra';
export type PostGameParticipant = {
	externalPlayerId: string | null;
	riotId: string | null;
	teamKey: string | null;
};
export type PostGameCandidate = {
	provider: PostGameProviderId;
	ref: string;
	externalMatchId: string | null;
	startedAt: string | null;
	map: { externalId: string | null; name: string | null };
	score: { teamA: number | null; teamB: number | null } | null;
	participants: PostGameParticipant[];
};
export type NormalizedPostGamePlayer = PostGameParticipant & {
	agentExternalId: string | null;
	agentName: string | null;
	kills: number | null;
	deaths: number | null;
	assists: number | null;
	performanceScore: number | null;
	trades: number | null;
	firstBloods: number | null;
	plants: number | null;
	defuses: number | null;
};
export type NormalizedPostGameReport = {
	provider: PostGameProviderId;
	externalMatchId: string;
	startedAt: string | null;
	completed: boolean;
	map: { externalId: string | null; name: string | null };
	teams: Array<{ key: string; score: number | null; won: boolean | null }>;
	players: NormalizedPostGamePlayer[];
};
