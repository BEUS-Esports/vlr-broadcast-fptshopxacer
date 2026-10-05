import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import type { LiveGameState, LiveProviderSide } from '#lib/live/types.ts';

export type LiveMapping = {
	gameId: string;
	teams: Array<{ providerSide: LiveProviderSide; entryId: string; observedName: string | null }>;
	players: Array<{
		providerKey: string;
		playerId: string;
		entryId: string;
		observedName: string | null;
	}>;
};
type MappingInput = {
	teams: Array<{ providerSide: LiveProviderSide; entryId: string }>;
	players: Array<{ providerKey: string; playerId: string }>;
};

export function validateMapping(
	state: LiveGameState,
	snapshot: BroadcastPreparedSnapshot,
	input: unknown
): LiveMapping {
	const invalid = () => {
		throw new Error(
			'Choose distinct provider teams and players from their selected local lineups.'
		);
	};
	if (
		!snapshot.selection ||
		snapshot.selection.gameId !== state.selectedGameId ||
		!input ||
		typeof input !== 'object'
	)
		return invalid();
	const value = input as MappingInput;
	if (
		!Array.isArray(value.teams) ||
		value.teams.length !== 2 ||
		!Array.isArray(value.players) ||
		value.players.length > 10 ||
		state.teams.length !== 2
	)
		return invalid();
	const entries = [snapshot.competition.teamAEntryId, snapshot.competition.teamBEntryId];
	if (entries.some((entry) => !entry) || new Set(entries).size !== 2) return invalid();
	const sides = new Set<string>();
	const usedEntries = new Set<string>();
	const teams = value.teams.map((team) => {
		if (
			!team ||
			typeof team.entryId !== 'string' ||
			sides.has(team.providerSide) ||
			usedEntries.has(team.entryId) ||
			!entries.includes(team.entryId)
		)
			return invalid();
		const observed = state.teams.find((t) => t.providerSide === team.providerSide);
		if (!observed) return invalid();
		sides.add(team.providerSide);
		usedEntries.add(team.entryId);
		return {
			providerSide: team.providerSide,
			entryId: team.entryId,
			observedName: observed.observedName
		};
	});
	const usedKeys = new Set<string>();
	const usedPlayers = new Set<string>();
	const players = value.players.map((player) => {
		if (
			!player ||
			typeof player.providerKey !== 'string' ||
			typeof player.playerId !== 'string' ||
			usedKeys.has(player.providerKey) ||
			usedPlayers.has(player.playerId)
		)
			return invalid();
		const team = state.teams.find((t) =>
			t.players.some((p) => p.providerKey === player.providerKey)
		);
		const local = teams.find((t) => t.providerSide === team?.providerSide);
		if (
			!team ||
			!local ||
			!snapshot.lineups.some(
				(slot) => slot.entryId === local.entryId && slot.player?.playerId === player.playerId
			)
		)
			return invalid();
		usedKeys.add(player.providerKey);
		usedPlayers.add(player.playerId);
		return {
			providerKey: player.providerKey,
			playerId: player.playerId,
			entryId: local.entryId,
			observedName: team.players.find((p) => p.providerKey === player.providerKey)!.observedName
		};
	});
	return { gameId: snapshot.selection.gameId, teams, players };
}

/** A changed provider slot or saved lineup invalidates the join; never silently relabel it. */
export function applyMapping(
	state: LiveGameState,
	snapshot: BroadcastPreparedSnapshot | null,
	mapping: LiveMapping | null
) {
	let ready =
		!!mapping &&
		!!snapshot?.selection &&
		mapping.gameId === snapshot.selection.gameId &&
		mapping.gameId === state.selectedGameId;
	const unmapped: string[] = [];
	const teams = state.teams.map((team) => {
		const local = mapping?.teams.find((t) => t.providerSide === team.providerSide);
		const validTeam =
			ready &&
			!!local &&
			[snapshot?.competition.teamAEntryId, snapshot?.competition.teamBEntryId].includes(
				local.entryId
			) &&
			local.observedName === team.observedName;
		if (!validTeam) ready = false;
		return {
			...team,
			entryId: validTeam ? local!.entryId : null,
			players: team.players.map((player) => {
				const assigned = mapping?.players.find((p) => p.providerKey === player.providerKey);
				const valid =
					validTeam &&
					!!assigned &&
					assigned.entryId === local!.entryId &&
					(player.providerKey.startsWith('id:') || assigned.observedName === player.observedName) &&
					!!snapshot?.lineups.some(
						(slot) =>
							slot.entryId === assigned.entryId && slot.player?.playerId === assigned.playerId
					);
				if (assigned && !valid) ready = false;
				if (!valid) unmapped.push(player.providerKey);
				return {
					...player,
					playerId: valid ? assigned!.playerId : null,
					entryId: valid ? assigned!.entryId : null
				};
			})
		};
	});
	// A disappeared mapped identity must be reviewed, even if the remaining slots still match.
	if (
		mapping?.players.some(
			(p) =>
				!state.teams.some((t) =>
					t.players.some((observed) => observed.providerKey === p.providerKey)
				)
		)
	)
		ready = false;
	const carrier =
		teams.flatMap((t) => t.players).find((p) => p.hasSpike === true)?.playerId ?? null;
	return {
		ready,
		unmapped,
		state: { ...state, teams, spike: { ...state.spike, carrierPlayerId: carrier } }
	};
}

/** Suggestions never constitute confirmation; duplicate names are intentionally left unresolved. */
export function suggestMapping(state: LiveGameState, snapshot: BroadcastPreparedSnapshot | null) {
	const name = (value: string | null | undefined) =>
		value?.split('#')[0].normalize('NFKC').trim().toLocaleLowerCase() ?? '';
	return {
		teams: state.teams.map((team) => {
			const matches =
				snapshot?.teams.filter(
					(local) =>
						name(team.observedName) &&
						[name(local.name), name(local.tag)].includes(name(team.observedName))
				) ?? [];
			return {
				providerSide: team.providerSide,
				entryId: matches.length === 1 ? matches[0].entryId : ''
			};
		}),
		players: state.teams.flatMap((team) =>
			team.players.map((player) => {
				const matches =
					snapshot?.lineups.filter(
						(slot) =>
							name(player.observedName) &&
							name(slot.player?.displayName) === name(player.observedName)
					) ?? [];
				return {
					providerKey: player.providerKey,
					playerId: matches.length === 1 ? matches[0].player!.playerId : ''
				};
			})
		)
	};
}
