// Synthetic contract fixtures, not captured event responses. Henrik current OpenAPI v4.6.0
// and Spectra-Frontend StatsApiMapping.ts (main, inspected 2026-10-05).
export const completedMatch = {
	status: 200,
	data: {
		metadata: {
			match_id: 'event-match',
			started_at: '2026-10-05T12:00:00Z',
			is_completed: true,
			map: { id: 'ascent-id', name: 'Ascent' }
		},
		teams: [
			{ team_id: 'Blue', rounds: { won: 1, lost: 1 }, won: false },
			{ team_id: 'Red', rounds: { won: 1, lost: 1 }, won: false }
		],
		players: Array.from({ length: 10 }, (_, i) => ({
			puuid: `p${i}`,
			name: `Player ${i}`,
			tag: 'EVENT',
			team_id: i < 5 ? 'Blue' : 'Red',
			agent: { id: 'agent-id', name: 'Sova' },
			stats: {
				kills: i === 0 || i === 5 ? 1 : 0,
				deaths: i === 1 || i === 6 ? 1 : 0,
				assists: 0,
				score: 999
			}
		})),
		rounds: [
			{ id: 0, plant: { player: { puuid: 'p0' } }, defuse: { player: { puuid: 'p5' } } },
			{ id: 1, plant: null, defuse: null }
		],
		kills: [
			{ round: 0, time_in_round_in_ms: 2000, killer: { puuid: 'p0' }, victim: { puuid: 'p6' } },
			{ round: 1, time_in_round_in_ms: 1000, killer: { puuid: 'p5' }, victim: { puuid: 'p1' } }
		]
	}
};
export const recentMatches = {
	status: 200,
	data: [
		{
			...completedMatch.data,
			metadata: {
				...completedMatch.data.metadata,
				match_id: 'older-match',
				started_at: '2026-10-04T12:00:00Z'
			}
		},
		completedMatch.data
	]
};
export const pendingMatch = {
	status: 200,
	data: {
		...completedMatch.data,
		metadata: { ...completedMatch.data.metadata, is_completed: false }
	}
};
export const partialPlayer = {
	status: 200,
	data: {
		...completedMatch.data,
		players: [
			{ puuid: 23, name: 'Partial', tag: 'EVENT', stats: { kills: '12', deaths: -1, assists: 1.5 } }
		]
	}
};
export const missingRoundEvent = {
	status: 200,
	data: { ...completedMatch.data, rounds: [{ id: 0, plant: null }, completedMatch.data.rounds[1]] }
};
export const rateLimit = { status: 429, errors: [{ message: 'secret-upstream-message' }] };
export const spectraPending = { status: 200, data: { players: [] } };
export const reusedSpectraGroup = {
	status: 200,
	data: {
		...completedMatch.data,
		metadata: { ...completedMatch.data.metadata, match_id: 'different-event-match' }
	}
};

// Synthetic structure based on the offline sample's 13 scored rounds + terminal
// Surrendered record. All identities and events are invented, not copied.
export const surrenderedMatch = {
	status: 200,
	data: {
		...completedMatch.data,
		teams: [
			{ team_id: 'Blue', rounds: { won: 1, lost: 12 }, won: false },
			{ team_id: 'Red', rounds: { won: 12, lost: 1 }, won: true }
		],
		players: completedMatch.data.players.map((player) => ({
			...player,
			stats: { ...player.stats, kills: ['p0', 'p5'].includes(player.puuid) ? 49 : 0 }
		})),
		rounds: Array.from({ length: 14 }, (_, id) => ({
			id,
			result: id === 13 ? 'Surrendered' : 'Elimination',
			plant: null,
			defuse: null,
			stats: completedMatch.data.players.map((player) => ({
				player: { puuid: player.puuid },
				stats: { kills: 0 }
			}))
		})),
		kills: Array.from({ length: 98 }, (_, index) => ({
			round: index % 13,
			time_in_round_in_ms: (index + 1) * 1000,
			killer: { puuid: index % 2 ? 'p0' : 'p5' },
			victim: { puuid: index % 2 ? 'p6' : 'p1' }
		}))
	}
};
