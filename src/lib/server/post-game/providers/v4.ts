import type { NormalizedPostGameReport, PostGameProviderId } from '#lib/post-game/types.ts';
import { count, envelope, object, PostGameProviderError, text } from './http';

export function decodeV4Report(
	value: unknown,
	provider: PostGameProviderId
): NormalizedPostGameReport {
	const data = object(envelope(value).data);
	const metadata = object(data.metadata);
	const externalMatchId = text(metadata.match_id);
	if (
		!externalMatchId ||
		typeof metadata.is_completed !== 'boolean' ||
		!Array.isArray(data.players) ||
		!data.players.length ||
		data.players.length > 20 ||
		!Array.isArray(data.teams) ||
		data.teams.length !== 2
	)
		throw new PostGameProviderError('malformed');
	const teams = data.teams.map((value) => {
		const row = object(value);
		const key = text(row.team_id);
		if (!key) throw new PostGameProviderError('malformed');
		return {
			key,
			score: count(object(row.rounds).won),
			won: typeof row.won === 'boolean' ? row.won : null
		};
	});
	if (new Set(teams.map((t) => t.key)).size !== 2) throw new PostGameProviderError('malformed');
	const teamKeys = new Set(teams.map((team) => team.key));
	const gamePlayers = data.players
		.map((value) => object(value))
		.filter((row) => {
			const teamKey = text(row.team_id);
			return !!teamKey && teamKeys.has(teamKey);
		});
	if (
		gamePlayers.length !== 10 ||
		teams.some((team) => gamePlayers.filter((row) => text(row.team_id) === team.key).length !== 5)
	)
		throw new PostGameProviderError('malformed');
	const players = gamePlayers.map((row) => {
		const externalPlayerId = text(row.puuid);
		const teamKey = text(row.team_id);
		if (!externalPlayerId || !teamKey) throw new PostGameProviderError('malformed');
		const name = text(row.name);
		const tag = text(row.tag);
		const agent = object(row.agent);
		const stats = object(row.stats);
		return {
			externalPlayerId,
			riotId: name && tag && !name.includes('#') && !tag.includes('#') ? `${name}#${tag}` : null,
			teamKey,
			agentExternalId: text(agent.id),
			agentName: text(agent.name),
			kills: count(stats.kills),
			deaths: count(stats.deaths),
			assists: count(stats.assists),
			performanceScore: null,
			trades: null,
			firstBloods: null as number | null,
			plants: null as number | null,
			defuses: null as number | null
		};
	});
	if (new Set(players.map((p) => p.externalPlayerId)).size !== players.length)
		throw new PostGameProviderError('malformed');
	const startedAt = text(metadata.started_at);
	const map = object(metadata.map);
	const report: NormalizedPostGameReport = {
		provider,
		externalMatchId,
		startedAt:
			startedAt && Number.isFinite(Date.parse(startedAt))
				? new Date(startedAt).toISOString()
				: null,
		completed: metadata.is_completed,
		map: { externalId: text(map.id), name: text(map.name) },
		teams,
		players
	};
	deriveEvents(report, data);
	return report;
}

function deriveEvents(report: NormalizedPostGameReport, data: Record<string, unknown>) {
	const expectedRounds = report.teams.every((t) => t.score !== null)
		? report.teams.reduce((sum, t) => sum + (t.score ?? 0), 0)
		: null;
	// ponytail: score-count coverage excludes terminal surrender records; derive
	// those metrics only after a verified played-round policy is approved.
	if (
		!report.completed ||
		!Array.isArray(data.rounds) ||
		!data.rounds.length ||
		data.rounds.length !== expectedRounds
	)
		return;
	const rounds = data.rounds.map(object);
	const ids = rounds.map((r) => count(r.id));
	if (ids.some((id) => id === null) || new Set(ids).size !== rounds.length) return;
	const players = new Map(report.players.map((p) => [p.externalPlayerId, p]));
	for (const field of ['plant', 'defuse'] as const) {
		const credited: string[] = [];
		const valid = rounds.every((round) => {
			if (round[field] === null) return true;
			const id = text(object(object(round[field]).player).puuid);
			if (!id || !players.has(id)) return false;
			credited.push(id);
			return true;
		});
		if (valid)
			for (const player of report.players)
				player[field === 'plant' ? 'plants' : 'defuses'] = credited.filter(
					(id) => id === player.externalPlayerId
				).length;
	}
	if (!Array.isArray(data.kills) || report.players.some((p) => p.kills === null)) return;
	const first = new Map<number, { time: number; killer: string; ambiguous: boolean }>();
	const creditedKills = new Map<string, number>();
	for (const value of data.kills) {
		const kill = object(value);
		const round = count(kill.round);
		const time = count(kill.time_in_round_in_ms);
		if (round === null || time === null || !ids.includes(round)) return;
		const killer = text(object(kill.killer).puuid);
		const victim = text(object(kill.victim).puuid);
		// Only credited player-on-player kills qualify; environment/self/team kills do not.
		if (
			!killer ||
			!victim ||
			!players.has(killer) ||
			!players.has(victim) ||
			players.get(killer)?.teamKey === players.get(victim)?.teamKey
		)
			continue;
		creditedKills.set(killer, (creditedKills.get(killer) ?? 0) + 1);
		const previous = first.get(round);
		if (!previous || time < previous.time) first.set(round, { time, killer, ambiguous: false });
		else if (time === previous.time && killer !== previous.killer) previous.ambiguous = true;
	}
	if ([...first.values()].some((kill) => kill.ambiguous)) return; // No arbitrary earliest tie-break.
	if (report.players.some((p) => p.kills !== (creditedKills.get(p.externalPlayerId ?? '') ?? 0)))
		return;
	for (const player of report.players)
		player.firstBloods = [...first.values()].filter(
			(kill) => kill.killer === player.externalPlayerId
		).length;
}
