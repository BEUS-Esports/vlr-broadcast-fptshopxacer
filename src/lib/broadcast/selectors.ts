import type { BroadcastSnapshot } from './types';
import type { BroadcastScope } from './controls';

export function presentationTeams(snapshot: BroadcastSnapshot) {
	return {
		left: snapshot.teams.find((team) => team.entryId === snapshot.presentation.leftEntryId) ?? null,
		right:
			snapshot.teams.find((team) => team.entryId === snapshot.presentation.rightEntryId) ?? null
	};
}

export function playerInScope(
	snapshot: BroadcastSnapshot,
	scope: BroadcastScope,
	playerId: string | null
) {
	const view = snapshot.scopes[scope];
	return {
		player: view.candidates.find((player) => player.playerId === playerId) ?? null,
		statistics: view.statistics.players.find((player) => player.playerId === playerId) ?? null
	};
}

export function selectedMvp(snapshot: BroadcastSnapshot) {
	const scope = snapshot.controls.mvpScope;
	return playerInScope(snapshot, scope, snapshot.scopes[scope].mvpPlayerId);
}

export function gameplaySide(snapshot: BroadcastSnapshot, entryId: string) {
	return entryId === snapshot.sides.attackersEntryId
		? 'attack'
		: entryId === snapshot.sides.defendersEntryId
			? 'defense'
			: null;
}
