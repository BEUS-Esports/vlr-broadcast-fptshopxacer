import type { HenrikDevConfig } from '../config';
import type { NormalizedPostGameReport, PostGameCandidate } from '#lib/post-game/types.ts';
import { envelope, PostGameProviderError, requestJson, text } from './http';
import { decodeV4Report } from './v4';
export function decodeHenrikMatch(value: unknown): NormalizedPostGameReport {
	return decodeV4Report(value, 'henrikdev');
}
export function decodeHenrikCandidates(value: unknown, limit: number): PostGameCandidate[] {
	const body = envelope(value);
	if (!Array.isArray(body.data) || body.data.length > 100)
		throw new PostGameProviderError('malformed');
	return body.data
		.map((data) => decodeHenrikMatch({ status: 200, data }))
		.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
		.slice(0, limit)
		.map((report) => ({
			provider: report.provider,
			ref: report.externalMatchId,
			externalMatchId: report.externalMatchId,
			startedAt: report.startedAt,
			map: report.map,
			score: { teamA: report.teams[0].score, teamB: report.teams[1].score },
			participants: report.players.map(({ externalPlayerId, riotId, teamKey }) => ({
				externalPlayerId,
				riotId,
				teamKey
			}))
		}));
}
export function createHenrikDevClient(config: HenrikDevConfig, fetcher: typeof fetch = fetch) {
	return {
		async discoverRecentMatches(input: {
			riotId: string;
			signal?: AbortSignal;
		}): Promise<PostGameCandidate[]> {
			const riotId = text(input.riotId);
			const parts = riotId?.split('#');
			if (
				!parts ||
				parts.length !== 2 ||
				!parts.every((part) => text(part) && !['.', '..'].includes(part.trim()))
			)
				throw new PostGameProviderError('invalid-input');
			const path = [config.affinity, config.platform, ...parts.map((p) => p.trim())]
				.map(encodeURIComponent)
				.join('/');
			const url = `${config.baseUrl}/valorant/v4/matches/${path}?size=${config.candidateLimit}`;
			return decodeHenrikCandidates(
				await requestJson(url, config.timeoutMs, fetcher, input.signal, {
					Authorization: config.apiKey
				}),
				config.candidateLimit
			);
		},
		async fetchMatchDetail(input: {
			externalMatchId: string;
			signal?: AbortSignal;
		}): Promise<NormalizedPostGameReport> {
			const id = text(input.externalMatchId);
			if (!id || ['.', '..'].includes(id)) throw new PostGameProviderError('invalid-input');
			const url = `${config.baseUrl}/valorant/v4/match/${encodeURIComponent(config.affinity)}/${encodeURIComponent(id)}`;
			const report = decodeHenrikMatch(
				await requestJson(url, config.timeoutMs, fetcher, input.signal, {
					Authorization: config.apiKey
				})
			);
			if (report.externalMatchId !== id) throw new PostGameProviderError('identity-mismatch');
			return report;
		}
	};
}
