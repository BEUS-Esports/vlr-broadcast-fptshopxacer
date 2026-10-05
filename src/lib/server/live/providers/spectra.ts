import type {
	LiveGamePhase,
	LiveGameState,
	LiveNormalizationContext,
	LiveRoundResult
} from '#lib/live/types.ts';
import {
	boolean,
	emptyPlayer,
	emptyState,
	finish,
	jsonInput,
	numeric,
	record,
	string
} from './shared';

/** Wire fields verified against Spectra-Server 6e106b5; no upstream code is copied. */
export function normalizeSpectra(
	input: unknown,
	context: LiveNormalizationContext
): { state: LiveGameState | null; issues: string[] } {
	const issues: string[] = [];
	const wire = jsonInput(input);
	if (
		!record(wire) ||
		!Array.isArray(wire.teams) ||
		wire.teams.length !== 2 ||
		!wire.teams.every(
			(t) =>
				record(t) && Array.isArray(t.players) && t.players.length <= 5 && t.players.every(record)
		)
	) {
		return { state: null, issues: ['Invalid Spectra match_data teams'] };
	}
	const state = emptyState('spectra', context);
	const phases: Record<string, LiveGamePhase> = {
		LOBBY: 'lobby',
		lobby: 'lobby',
		agent_select: 'agent-select',
		'agent-select': 'agent-select',
		shopping: 'buy',
		combat: 'combat',
		end: 'post-round',
		game_end: 'game-end'
	};
	const phase = string(wire.roundPhase, issues, 'roundPhase');
	state.phase = phase !== null && Object.hasOwn(phases, phase) ? phases[phase] : 'unknown';
	state.roundNumber = numeric(wire.roundNumber, issues, 'roundNumber', 1000);
	state.map = string(wire.map, issues, 'map');
	state.teams = wire.teams.map((rawTeam, teamIndex) => {
		const team = rawTeam as Record<string, unknown> & { players: Record<string, unknown>[] };
		const providerSide = teamIndex === 0 ? 'left' : 'right';
		return {
			providerSide,
			entryId: null,
			observedName: string(team.teamName, issues, `${providerSide}.teamName`),
			score: numeric(team.roundsWon, issues, `${providerSide}.roundsWon`),
			attacking: boolean(team.isAttacking, issues, `${providerSide}.isAttacking`),
			players: team.players.map((rawPlayer, playerIndex) => {
				const field = `${providerSide}.players[${playerIndex}]`;
				const id = string(rawPlayer.riotId, issues, `${field}.riotId`, 509);
				const slot = numeric(rawPlayer.position, issues, `${field}.position`, 10);
				const player = emptyPlayer(
					id === null ? `slot:${providerSide}:${slot ?? playerIndex + 1}` : `id:${id}`,
					slot
				);
				player.observedName = string(rawPlayer.name, issues, `${field}.name`);
				player.agent = string(rawPlayer.agentProper, issues, `${field}.agentProper`);
				player.weapon = string(rawPlayer.highestWeapon, issues, `${field}.highestWeapon`);
				player.alive = boolean(rawPlayer.isAlive, issues, `${field}.isAlive`);
				player.observed = boolean(rawPlayer.isObserved, issues, `${field}.isObserved`);
				player.hasSpike = boolean(rawPlayer.hasSpike, issues, `${field}.hasSpike`);
				const aux = record(rawPlayer.auxiliaryAvailable) ? rawPlayer.auxiliaryAvailable : {};
				if (aux.health === true)
					player.health = numeric(rawPlayer.health, issues, `${field}.health`, 1000, true);
				if (aux.abilities === true && record(rawPlayer.abilities)) {
					for (const key of ['grenade', 'ability1', 'ability2'] as const)
						player.abilities[key].current = numeric(
							rawPlayer.abilities[key],
							issues,
							`${field}.abilities.${key}`
						);
				}
				const scoreboard = rawPlayer.scoreboardAvailable === true || aux.scoreboard === true;
				if (scoreboard) {
					for (const key of ['kills', 'deaths', 'assists'] as const)
						player[key] = numeric(rawPlayer[key], issues, `${field}.${key}`);
					player.credits = numeric(rawPlayer.money, issues, `${field}.money`);
					player.ultimate.ready = boolean(rawPlayer.ultReady, issues, `${field}.ultReady`);
					const current = numeric(rawPlayer.currUltPoints, issues, `${field}.currUltPoints`);
					const required = numeric(rawPlayer.maxUltPoints, issues, `${field}.maxUltPoints`);
					if (current !== null && required !== null && required > 0 && current <= required) {
						player.ultimate.current = current;
						player.ultimate.required = required;
					} else if (current !== null || required !== null)
						issues.push(`${field}.ultimate: invalid progress`);
					player.shield.raw = string(rawPlayer.armorName, issues, `${field}.armorName`);
					const armor = player.shield.raw?.toLowerCase();
					player.shield.kind =
						armor === 'none'
							? 'none'
							: armor === 'light'
								? 'light'
								: armor === 'heavy'
									? 'heavy'
									: armor === 'regen'
										? 'regen'
										: 'unknown';
					// Spectra reports purchased equipment, not a measured remaining shield amount.
				}
				player.capabilities.health = player.health !== null;
				player.capabilities.abilities = Object.values(player.abilities).some(
					(v) => v.current !== null
				);
				player.capabilities.scoreboard = scoreboard;
				return player;
			})
		};
	});
	const spike = record(wire.spikeState) ? wire.spikeState : {};
	state.spike.state =
		spike.detonated === true
			? 'detonated'
			: spike.defused === true
				? 'defused'
				: spike.planted === true
					? 'planted'
					: 'unknown';
	const carriers = state.teams.flatMap((team) =>
		team.players.filter((player) => player.hasSpike === true)
	);
	if (carriers.length === 1 && state.spike.state === 'unknown') state.spike.state = 'carried';
	if (carriers.length > 1) issues.push('spike: multiple carriers');
	// Local player identity is assigned only by the mapping layer.
	const reasons: Record<string, LiveRoundResult['reason']> = {
		detonated: 'detonation',
		defused: 'defuse',
		kills: 'elimination',
		timeout: 'time'
	};
	const outcomes = new Map<number, LiveRoundResult[]>();
	wire.teams.forEach((team, i) => {
		if (!Array.isArray(team.roundRecord)) return;
		for (const entry of team.roundRecord.slice(0, 1000)) {
			if (!record(entry)) {
				issues.push('roundRecord: invalid entry');
				continue;
			}
			if (entry.type === 'lost' || entry.type === 'upcoming') continue;
			const reason =
				typeof entry.type === 'string' && Object.hasOwn(reasons, entry.type)
					? reasons[entry.type]
					: undefined;
			const round = numeric(entry.round, issues, 'roundRecord.round', 1000);
			if (!reason || !round) {
				issues.push('roundRecord: unsupported outcome');
				continue;
			}
			const entries = outcomes.get(round) ?? [];
			entries.push({ round, winnerProviderSide: i === 0 ? 'left' : 'right', reason });
			outcomes.set(round, entries);
		}
	});
	for (const [round, entries] of outcomes) {
		if (entries.length === 1) state.rounds.push(entries[0]);
		else issues.push(`roundRecord round ${round}: conflicting outcomes`);
	}
	state.rounds.sort((a, b) => a.round - b.round);
	return finish(state, issues);
}
