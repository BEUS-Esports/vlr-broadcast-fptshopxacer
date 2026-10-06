import { describe, expect, it, vi } from 'vitest';
import { loadPostGameConfig, normalizePostGameConfig } from '../config';
import { createHenrikDevClient, decodeHenrikMatch, decodeHenrikCandidates } from './henrikdev';
import { createSpectraClient } from './spectra';
import {
	completedMatch,
	recentMatches,
	pendingMatch,
	partialPlayer,
	missingRoundEvent,
	rateLimit,
	spectraPending,
	reusedSpectraGroup,
	surrenderedMatch
} from './fixtures';

vi.mock('#lib/server/settings/providers.ts', () => ({
	loadProviderSettings: async () => ({
		revision: 4,
		spectraRegion: 'eu',
		spectraHost: 'https://eu.valospectra.com',
		spectraAccessKey: '',
		spectraGroupCode: 'runtime-group',
		gstackUrl: 'http://localhost:57780/',
		henrikdevBaseUrl: 'https://api.henrikdev.xyz',
		henrikdevApiKey: 'runtime-secret',
		henrikdevAffinity: 'kr',
		henrikdevPlatform: 'pc',
		henrikdevCandidateLimit: 4,
		postGameRequestTimeoutMs: 12000,
		spectraPostGameBaseUrl: 'https://stats.valospectra.com',
		spectraPostGamePollIntervalMs: 10000,
		spectraPostGameMaxAttempts: 2
	})
}));

const env = { HENRIKDEV_API_KEY: 'api-secret', SPECTRA_POST_GAME_GROUP_CODE: 'group-secret' };
const configs = () => normalizePostGameConfig(env);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe('post-game provider configuration', () => {
	it('reads saved database provider settings rather than environment overrides', async () => {
		const config = await loadPostGameConfig();
		expect(config.henrikdev).toMatchObject({
			apiKey: 'runtime-secret',
			affinity: 'kr',
			candidateLimit: 4,
			timeoutMs: 12000
		});
		expect(config.spectra).toMatchObject({
			groupCode: 'runtime-group',
			pollIntervalMs: 10000,
			maxAttempts: 2
		});
		expect(JSON.stringify(config)).not.toContain('runtime-secret');
	});
	it('keeps secrets out of serialized configuration and availability', () => {
		const config = configs();
		expect(config.henrikdev?.apiKey).toBe(env.HENRIKDEV_API_KEY);
		expect(JSON.stringify(config)).not.toContain('secret');
	});
	it('isolates missing and malformed configuration by provider', () => {
		expect(normalizePostGameConfig({}).availability.henrikdev.available).toBe(false);
		const config = normalizePostGameConfig({
			...env,
			HENRIKDEV_BASE_URL: 'https://user:secret@bad.test/?key=secret'
		});
		expect(config.henrikdev).toBeNull();
		expect(config.availability.spectra.available).toBe(true);
		expect(JSON.stringify(config)).not.toContain('secret');
	});
	it('reuses the saved Spectra group when the example environment entry is blank', () => {
		expect(
			normalizePostGameConfig({ SPECTRA_POST_GAME_GROUP_CODE: '' }, 'SAVED').spectra?.groupCode
		).toBe('SAVED');
	});
});
describe('strict v4 normalization', () => {
	it('retains report identity and provider team keys without leaking raw stats', () => {
		const report = decodeHenrikMatch(completedMatch);
		expect(report.externalMatchId).toBe('event-match');
		expect(report.teams.map((t) => t.key)).toEqual(['Blue', 'Red']);
		expect(report.players[0]).toMatchObject({
			kills: 1,
			deaths: 0,
			assists: 0,
			performanceScore: null,
			trades: null
		});
		expect(JSON.stringify(report)).not.toContain('999');
		expect(decodeHenrikMatch(pendingMatch).completed).toBe(false);
	});
	it('rejects unusable player identities instead of trusting a cast', () => {
		expect(() => decodeHenrikMatch(partialPlayer)).toThrow();
	});
	it('ignores non-playing participants outside the two game teams', () => {
		const fixture = structuredClone(completedMatch);
		fixture.data.players.push({
			...fixture.data.players[0],
			puuid: 'observer',
			name: 'Observer',
			team_id: 'Observer'
		});
		const report = decodeHenrikMatch(fixture);
		expect(report.players).toHaveLength(10);
		expect(report.players.some((player) => player.externalPlayerId === 'observer')).toBe(false);
	});
	it('normalizes optional malformed numbers and IDs to null', () => {
		const fixture = structuredClone(completedMatch);
		const payload: unknown = {
			...fixture,
			data: {
				...fixture.data,
				players: fixture.data.players.map((p) => ({
					...p,
					agent: { id: 2, name: null },
					stats: { kills: '1', deaths: -1, assists: 1.1 }
				}))
			}
		};
		expect(decodeHenrikMatch(payload).players[0]).toMatchObject({
			kills: null,
			deaths: null,
			assists: null,
			agentExternalId: null
		});
	});
	it('derives plants, defuses, and the earliest valid player kill per round for all identities', () => {
		const report = decodeHenrikMatch(completedMatch);
		expect(report.players.map((p) => p.plants)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		expect(report.players.map((p) => p.defuses)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
		expect(report.players.map((p) => p.firstBloods)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
	});
	it('leaves missing round events and kill coverage unknown', () => {
		expect(decodeHenrikMatch(missingRoundEvent).players.every((p) => p.defuses === null)).toBe(
			true
		);
		const missing = { ...completedMatch, data: { ...completedMatch.data, kills: undefined } };
		expect(decodeHenrikMatch(missing).players.every((p) => p.firstBloods === null)).toBe(true);
		const missingRound = {
			...completedMatch,
			data: { ...completedMatch.data, rounds: [completedMatch.data.rounds[0]] }
		};
		expect(
			decodeHenrikMatch(missingRound).players.every(
				(p) => p.plants === null && p.firstBloods === null
			)
		).toBe(true);
	});
	it('does not invent event counts from partial or malformed events', () => {
		const missingKill = {
			...completedMatch,
			data: { ...completedMatch.data, kills: completedMatch.data.kills.slice(1) }
		};
		expect(decodeHenrikMatch(missingKill).players.every((p) => p.firstBloods === null)).toBe(true);
		const malformed = {
			...completedMatch,
			data: {
				...completedMatch.data,
				rounds: [
					{ id: 0, plant: { player: { puuid: 'unknown' } }, defuse: null },
					completedMatch.data.rounds[1]
				]
			}
		};
		expect(decodeHenrikMatch(malformed).players.every((p) => p.plants === null)).toBe(true);
	});
	it('ignores earlier environment events and uses chronological rather than payload order', () => {
		const fixture = structuredClone(completedMatch);
		fixture.data.kills.unshift({
			round: 0,
			time_in_round_in_ms: 500,
			killer: { puuid: 'environment' },
			victim: { puuid: 'p6' }
		});
		fixture.data.kills.reverse();
		expect(decodeHenrikMatch(fixture).players.map((p) => p.firstBloods)).toEqual([
			1, 0, 0, 0, 0, 1, 0, 0, 0, 0
		]);
	});
	it('ignores later ties encountered before an earlier unambiguous first blood', () => {
		const fixture = structuredClone(completedMatch);
		fixture.data.players[5].stats.kills = 2;
		fixture.data.players[6].stats.kills = 1;
		fixture.data.kills.unshift(
			{ round: 0, time_in_round_in_ms: 5000, killer: { puuid: 'p5' }, victim: { puuid: 'p1' } },
			{ round: 0, time_in_round_in_ms: 5000, killer: { puuid: 'p6' }, victim: { puuid: 'p2' } }
		);
		expect(decodeHenrikMatch(fixture).players.map((p) => p.firstBloods)).toEqual([
			1, 0, 0, 0, 0, 1, 0, 0, 0, 0
		]);
		fixture.data.kills.reverse();
		expect(decodeHenrikMatch(fixture).players.map((p) => p.firstBloods)).toEqual([
			1, 0, 0, 0, 0, 1, 0, 0, 0, 0
		]);
	});
	it('leaves derived metrics unknown for a terminal surrender record beyond scored rounds', () => {
		const report = decodeHenrikMatch(surrenderedMatch);
		expect(report.completed).toBe(true);
		expect(report.players.reduce((sum, p) => sum + (p.kills ?? 0), 0)).toBe(98);
		expect(
			report.players.every((p) => p.plants === null && p.defuses === null && p.firstBloods === null)
		).toBe(true);
	});
	it('orders candidates newest first and caps results without selecting one', () => {
		expect(decodeHenrikCandidates(recentMatches, 1).map((c) => c.ref)).toEqual(['event-match']);
		expect(decodeHenrikCandidates({ status: 200, data: [] }, 5)).toEqual([]);
	});
});
describe('explicit Henrik requests', () => {
	it('encodes Riot IDs and uses documented auth, region, platform, and candidate bound', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => json(recentMatches));
		const client = createHenrikDevClient(configs().henrikdev!, fetcher);
		await client.discoverRecentMatches({ riotId: 'A / B#T&X' });
		expect(fetcher.mock.calls[0]?.[0]).toContain(
			'/valorant/v4/matches/ap/pc/A%20%2F%20B/T%26X?size=5'
		);
		expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: 'api-secret' } });
	});
	it('rejects missing Riot ID before a request', async () => {
		const fetcher = vi.fn();
		await expect(
			createHenrikDevClient(configs().henrikdev!, fetcher).discoverRecentMatches({ riotId: '' })
		).rejects.toMatchObject({ code: 'invalid-input' });
		expect(fetcher).not.toHaveBeenCalled();
	});
	it('rejects path traversal segments before a request', async () => {
		const fetcher = vi.fn();
		await expect(
			createHenrikDevClient(configs().henrikdev!, fetcher).fetchMatchDetail({
				externalMatchId: '..'
			})
		).rejects.toMatchObject({ code: 'invalid-input' });
		expect(fetcher).not.toHaveBeenCalled();
	});
	it('rejects an exact detail mismatch', async () => {
		await expect(
			createHenrikDevClient(configs().henrikdev!, async () =>
				json(completedMatch)
			).fetchMatchDetail({ externalMatchId: 'wrong-match' })
		).rejects.toMatchObject({ code: 'identity-mismatch' });
	});
	it.each([
		[401, 'auth'],
		[403, 'auth'],
		[404, 'not-found'],
		[429, 'rate-limit'],
		[500, 'unavailable']
	])('classifies HTTP %s without forwarding provider errors', async (status, code) => {
		const client = createHenrikDevClient(configs().henrikdev!, async () =>
			json(rateLimit, Number(status))
		);
		await expect(client.fetchMatchDetail({ externalMatchId: 'event-match' })).rejects.toMatchObject(
			{ code }
		);
		try {
			await client.fetchMatchDetail({ externalMatchId: 'event-match' });
		} catch (error) {
			expect(String(error)).not.toContain('secret');
		}
	});
	it('classifies invalid JSON and transport errors without secrets', async () => {
		await expect(
			createHenrikDevClient(
				configs().henrikdev!,
				async () => new Response('{api-secret')
			).fetchMatchDetail({ externalMatchId: 'event-match' })
		).rejects.toMatchObject({ code: 'malformed' });
		await expect(
			createHenrikDevClient(configs().henrikdev!, async () => {
				throw new Error('api-secret');
			}).fetchMatchDetail({ externalMatchId: 'event-match' })
		).rejects.toMatchObject({ code: 'unavailable' });
	});
	it('bounds requests and honors cancellation', async () => {
		const config = configs().henrikdev!;
		const fetcher: typeof fetch = async (_url, init) =>
			new Promise((_resolve, reject) =>
				init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
			);
		await expect(
			createHenrikDevClient(
				{ ...config, apiKey: config.apiKey, timeoutMs: 5 },
				fetcher
			).fetchMatchDetail({ externalMatchId: 'event-match' })
		).rejects.toMatchObject({ code: 'timeout' });
		const controller = new AbortController();
		controller.abort();
		await expect(
			createHenrikDevClient(config, fetcher).fetchMatchDetail({
				externalMatchId: 'event-match',
				signal: controller.signal
			})
		).rejects.toMatchObject({ code: 'cancelled' });
	});
});
describe('Spectra hosted retrieval', () => {
	it('uses a separate hosted service and normalizes the same source-shaped contract', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => json(completedMatch));
		const report = await createSpectraClient(configs().spectra!, fetcher).fetchReport({
			groupCode: 'event / code'
		});
		expect(report.provider).toBe('spectra');
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			'https://stats.valospectra.com/getStats?code=EVENT+%2F+CODE'
		);
	});
	it('bounds no-player pending polling', async () => {
		const fetcher = vi.fn(async () => json(spectraPending));
		await expect(
			createSpectraClient(
				{ ...configs().spectra!, groupCode: 'TEST', pollIntervalMs: 1, maxAttempts: 2 },
				fetcher
			).fetchReport({})
		).rejects.toMatchObject({ code: 'pending' });
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
	it('retrieves once ready after a pending response', async () => {
		let calls = 0;
		const fetcher: typeof fetch = async () => json(++calls === 1 ? spectraPending : completedMatch);
		const config = { ...configs().spectra!, groupCode: 'TEST', pollIntervalMs: 1 };
		expect((await createSpectraClient(config, fetcher).fetchReport({})).externalMatchId).toBe(
			'event-match'
		);
		expect(calls).toBe(2);
	});
	it('does not poll auth errors and rejects malformed player data', async () => {
		const fetcher = vi.fn(async () => json(rateLimit, 429));
		await expect(
			createSpectraClient(configs().spectra!, fetcher).fetchReport({})
		).rejects.toMatchObject({ code: 'rate-limit' });
		expect(fetcher).toHaveBeenCalledTimes(1);
		await expect(
			createSpectraClient(configs().spectra!, async () => json(partialPlayer)).fetchReport({})
		).rejects.toMatchObject({ code: 'malformed' });
	});
	it('stops pending polling on cancellation', async () => {
		const controller = new AbortController();
		const fetcher = vi.fn(async () => {
			controller.abort();
			return json(spectraPending);
		});
		await expect(
			createSpectraClient(configs().spectra!, fetcher).fetchReport({ signal: controller.signal })
		).rejects.toMatchObject({ code: 'cancelled' });
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('rejects a reused group code returning a different chosen report', async () => {
		await expect(
			createSpectraClient(configs().spectra!, async () => json(reusedSpectraGroup)).fetchReport({
				externalMatchId: 'event-match'
			})
		).rejects.toMatchObject({ code: 'identity-mismatch' });
	});
});
