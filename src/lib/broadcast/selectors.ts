import type { BroadcastSnapshot } from './types';
import type { BroadcastScope, GraphicId } from './controls';
import { isBroadcastPublication } from './types';
import type { Metric, StatisticValues } from '../server/services/statistics-aggregation';

/** Fail closed; program never substitutes the latest saved data for a missing capture. */
export function programSnapshot(
	latest: BroadcastSnapshot,
	graphic: GraphicId
): BroadcastSnapshot | null {
	const prepared = latest.publications?.[graphic];
	if (
		!latest.controls.visibility[graphic] ||
		!isBroadcastPublication(prepared) ||
		prepared.selection?.gameId !== latest.selection?.gameId
	)
		return null;
	const { teamAEntryId, teamBEntryId } = prepared.competition;
	const attackers =
		latest.liveControls.currentAttackersEntryId ?? prepared.sides.preparedAttackersEntryId;
	return {
		...prepared,
		publications: latest.publications,
		liveControls: latest.liveControls,
		controls: { ...prepared.controls, visibility: latest.controls.visibility },
		presentation: {
			leftEntryId: latest.liveControls.swapped ? teamBEntryId : teamAEntryId,
			rightEntryId: latest.liveControls.swapped ? teamAEntryId : teamBEntryId
		},
		sides: {
			...prepared.sides,
			attackersEntryId: attackers,
			defendersEntryId:
				attackers === null ? null : attackers === teamAEntryId ? teamBEntryId : teamAEntryId,
			source: latest.liveControls.currentAttackersEntryId
				? 'manual'
				: attackers
					? 'prepared'
					: 'unknown'
		}
	};
}

export function teamByEntryId(snapshot: BroadcastSnapshot, entryId: string | null) {
	return snapshot.teams.find((team) => team.entryId === entryId) ?? null;
}

export function competitionTeams(snapshot: BroadcastSnapshot) {
	return {
		teamA: teamByEntryId(snapshot, snapshot.competition.teamAEntryId),
		teamB: teamByEntryId(snapshot, snapshot.competition.teamBEntryId)
	};
}

export function presentationTeams(snapshot: BroadcastSnapshot) {
	return {
		left: teamByEntryId(snapshot, snapshot.presentation.leftEntryId),
		right: teamByEntryId(snapshot, snapshot.presentation.rightEntryId),
		swapped:
			snapshot.competition.teamAEntryId !== null &&
			snapshot.competition.teamBEntryId !== null &&
			snapshot.presentation.leftEntryId === snapshot.competition.teamBEntryId &&
			snapshot.presentation.rightEntryId === snapshot.competition.teamAEntryId
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

export function gameplaySide(
	snapshot: BroadcastSnapshot,
	entryId: string | null,
	source: 'prepared' | 'current' = 'current'
): 'attack' | 'defense' | null {
	if (entryId === null) return null;
	const attackers =
		source === 'prepared'
			? snapshot.sides.preparedAttackersEntryId
			: snapshot.sides.attackersEntryId;
	const defenders =
		source === 'prepared'
			? snapshot.sides.preparedDefendersEntryId
			: snapshot.sides.defendersEntryId;
	return entryId === attackers ? 'attack' : entryId === defenders ? 'defense' : null;
}

export function lineupForTeam(snapshot: BroadcastSnapshot, entryId: string | null) {
	return snapshot.lineups
		.filter((slot) => slot.entryId === entryId)
		.sort((a, b) => a.slot - b.slot);
}

export function gameplayTeams(
	snapshot: BroadcastSnapshot,
	source: 'prepared' | 'current' = 'current'
) {
	return {
		attackers:
			snapshot.teams.find((team) => gameplaySide(snapshot, team.entryId, source) === 'attack') ??
			null,
		defenders:
			snapshot.teams.find((team) => gameplaySide(snapshot, team.entryId, source) === 'defense') ??
			null
	};
}

export function vetoActor(
	snapshot: BroadcastSnapshot,
	veto: Pick<BroadcastSnapshot['veto'][number], 'actingEntryId'>
) {
	return teamByEntryId(snapshot, veto.actingEntryId);
}

export function teamScore(
	snapshot: BroadcastSnapshot,
	entryId: string | null,
	scope: 'game' | 'match'
) {
	if (entryId === null) return null;
	const result = snapshot[scope];
	return entryId === snapshot.competition.teamAEntryId
		? (result?.scoreA ?? null)
		: entryId === snapshot.competition.teamBEntryId
			? (result?.scoreB ?? null)
			: null;
}

export function statisticMetric(
	statistics: Partial<Record<keyof StatisticValues, Metric>> | null,
	field: keyof StatisticValues,
	scope: BroadcastScope
): Metric {
	return (
		(field === 'performanceScore' && scope !== 'game' ? null : statistics?.[field]) ?? {
			value: null,
			coverage: 'none'
		}
	);
}
