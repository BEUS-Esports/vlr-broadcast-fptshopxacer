import type { BroadcastAgent, BroadcastSnapshot } from '#lib/broadcast/types.ts';
import type { LiveGameEnvelope } from './types';
import type { AgentAbility } from '#lib/resources/types.ts';

export type LiveResources = {
	agents: Array<BroadcastAgent & { abilities?: AgentAbility[] }>;
	weapons: Array<{ key: string; displayName: string; displayIconPath: string | null }>;
};
export function mappedGame(snapshot: BroadcastSnapshot, envelope: LiveGameEnvelope | null) {
	const live = envelope?.state;
	const status = envelope?.status;
	if (
		!live ||
		!status ||
		!snapshot.selection ||
		!status.mappingReady ||
		live.selectedGameId !== snapshot.selection.gameId ||
		status.selectedGameId !== snapshot.selection.gameId ||
		live.generation !== status.generation ||
		live.provider !== status.provider
	)
		return null;
	const entries = [snapshot.competition.teamAEntryId, snapshot.competition.teamBEntryId];
	if (
		live.teams.length !== 2 ||
		new Set(live.teams.map((team) => team.entryId)).size !== 2 ||
		live.teams.some(
			(team) =>
				!team.entryId ||
				!entries.includes(team.entryId) ||
				team.players.some(
					(player) =>
						player.playerId &&
						!snapshot.lineups.some(
							(slot) => slot.entryId === team.entryId && slot.player?.playerId === player.playerId
						)
				)
		)
	)
		return null;
	return live;
}
export function externalGame(
	snapshot: BroadcastSnapshot,
	envelope: LiveGameEnvelope | null,
	mode: 'program' | 'preview' = 'program'
) {
	const status = envelope?.status;
	if (!status) return null;
	if (mode === 'preview') {
		const live = envelope?.state;
		return live && live.generation === status.generation && live.provider === status.provider
			? live
			: null;
	}
	if (status.mode !== 'external' || !['live', 'retrying'].includes(status.health)) return null;
	return mappedGame(snapshot, envelope);
}
export function resourceByName<T extends { key: string; displayName: string }>(
	resources: T[],
	name: string | null
) {
	const normalize = (value: string) =>
		value
			.normalize('NFKC')
			.toLocaleLowerCase()
			.replace(/[^\p{L}\p{N}]/gu, '');
	if (!name) return null;
	return (
		resources.find((resource) =>
			[normalize(resource.key), normalize(resource.displayName)].includes(normalize(name))
		) ?? null
	);
}
export function withObservedAgents(
	snapshot: BroadcastSnapshot,
	envelope: LiveGameEnvelope | null,
	resources: LiveResources | null
): BroadcastSnapshot {
	if (
		!resources ||
		envelope?.state?.phase !== 'agent-select' ||
		!['live', 'ready'].includes(envelope.status.health)
	)
		return snapshot;
	const live = mappedGame(snapshot, envelope);
	if (!live) return snapshot;
	return {
		...snapshot,
		lineups: snapshot.lineups.map((slot) => {
			const player = live.teams
				.flatMap((team) => team.players)
				.find(
					(player) =>
						player.playerId &&
						player.playerId === slot.player?.playerId &&
						player.entryId === slot.entryId
				);
			const agent = resourceByName(resources.agents, player?.agent ?? null);
			return agent ? { ...slot, agent } : slot;
		})
	};
}
