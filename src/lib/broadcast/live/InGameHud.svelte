<script lang="ts">
	import type { BroadcastSnapshot } from '../types';
	import type { LiveGameState, LiveSessionStatus } from '#lib/live/types.ts';
	import type { LiveResources } from '#lib/live/selectors.ts';
	import { gameplaySide } from '../selectors';
	import NativeInGame from '../templates/test/InGame.svelte';
	import PlayerCard from './PlayerCard.svelte';
	import ProviderAttribution from './ProviderAttribution.svelte';
	let {
		snapshot,
		live,
		status,
		resources,
		identity = 'local'
	}: {
		snapshot: BroadcastSnapshot;
		live: LiveGameState | null;
		status: LiveSessionStatus | null;
		resources: LiveResources | null;
		identity?: 'local' | 'provider';
	} = $props();
	const rails = $derived(
		(['left', 'right'] as const).map((position) => {
			const entryId =
				identity === 'local'
					? position === 'left'
						? snapshot.presentation.leftEntryId
						: snapshot.presentation.rightEntryId
					: null;
			const team = live?.teams.find((team) =>
				identity === 'local'
					? team.entryId === entryId
					: position === 'left'
						? team.providerSide === 'left' || team.providerSide === 'team-0'
						: team.providerSide === 'right' || team.providerSide === 'team-1'
			);
			const local =
				identity === 'local' ? snapshot.teams.find((team) => team.entryId === entryId) : null;
			const name = identity === 'local' ? (local?.name ?? '') : (team?.observedName ?? '');
			const side: ReturnType<typeof gameplaySide> =
				identity === 'local'
					? gameplaySide(snapshot, entryId)
					: team?.attacking === true
						? 'attack'
						: team?.attacking === false
							? 'defense'
							: null;
			return { position, entryId, team, name, label: local?.tag ?? name, side };
		})
	);
	const teamPresentation = $derived(
		identity === 'provider' ? { left: rails[0], right: rails[1] } : null
	);
</script>

<section
	aria-label="External In-Game HUD"
	class="hud"
	data-live-hud
	data-identity={identity}
	data-provider-generation={live?.generation ?? ''}
>
	<NativeInGame
		{snapshot}
		{teamPresentation}
		blankMissing
		showSponsor={status?.provider !== 'spectra' || status.attribution === 'supporter'}
		mapName={identity === 'provider' ? (live?.map ?? null) : null}
	/>
	<div class="round-context">
		{#if live?.roundNumber !== null && live?.roundNumber !== undefined}<span
				>ROUND {live.roundNumber}</span
			>{/if}{#if live && live.spike.state !== 'unknown' && live.spike.state !== 'carried'}<strong
				>{live.spike.state.toUpperCase()}</strong
			>{/if}
	</div>
	{#each rails as { position, entryId, team, label, side } (position)}
		<div class="score" data-position={position}>{team?.score ?? ''}</div>
		<div
			class="rail"
			data-position={position}
			data-side={side ?? 'neutral'}
			style:--live-side={side === 'attack' ? '#248bff' : side === 'defense' ? '#ff4655' : '#97a2b0'}
		>
			<div class="rail-label">
				<strong>{label}</strong><span
					>{live?.phase === 'buy' ? 'BUY PHASE' : (side?.toUpperCase() ?? '')}</span
				>
			</div>
			{#each [1, 2, 3, 4, 5] as slot (slot)}
				{@const saved =
					identity === 'local'
						? snapshot.lineups.find((lineup) => lineup.entryId === entryId && lineup.slot === slot)
						: undefined}
				{@const player =
					team?.players.find((player, index) =>
						identity === 'local'
							? player.playerId && player.playerId === saved?.player?.playerId
							: player.providerSlot === slot || (player.providerSlot === null && index === slot - 1)
					) ?? null}
				<PlayerCard {saved} live={player} {resources} />
			{/each}
		</div>
	{/each}
	{#if live?.rounds.length}<div class="history" role="group" aria-label="Round history">
			<div class="history-teams">
				<strong>{rails[0].label}</strong>
				<strong>{rails[1].label}</strong>
			</div>
			{#each live.rounds as round (round.round)}{@const winner = rails.find(
					(rail) => rail.team?.providerSide === round.winnerProviderSide
				)}<span class="history-round">
					<small>{round.round}</small>
					<b
						data-winner-position={winner?.position ?? 'unknown'}
						title={`Round ${round.round}: ${winner?.label ?? 'Unknown winner'} · ${round.reason}`}
						>{round.reason === 'defuse'
							? 'D'
							: round.reason === 'elimination'
								? 'E'
								: round.reason === 'time'
									? 'T'
									: 'S'}</b
					></span
				>{/each}
		</div>{/if}
	{#if status}<ProviderAttribution {status} />{/if}
</section>

<style>
	.hud {
		position: absolute;
		inset: 0;
		width: 1920px;
		height: 1080px;
		overflow: hidden;
		pointer-events: none;
		color: #f7f4eb;
		font:
			14px/1.2 'Segoe UI',
			sans-serif;
	}
	.round-context {
		position: absolute;
		left: 50%;
		top: 105px;
		transform: translateX(-50%);
		display: flex;
		gap: 12px;
		padding: 5px 10px;
		background: #10151de0;
		font-size: 11px;
		letter-spacing: 0.08em;
	}
	.round-context:empty {
		display: none;
	}
	.round-context strong {
		color: #ff6874;
	}
	.score {
		position: absolute;
		top: 12px;
		padding: 5px;
		min-width: 40px;
		text-align: center;
		font:
			800 28px/1 Bahnschrift,
			sans-serif;
		background: #10151df2;
	}
	.score[data-position='left'] {
		left: 858px;
	}
	.score[data-position='right'] {
		right: 858px;
	}
	.rail {
		position: absolute;
		top: 385px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.rail[data-position='left'] {
		left: 24px;
	}
	.rail[data-position='right'] {
		right: 24px;
	}
	.rail-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		background: #10151de0;
		border-bottom: 2px solid var(--live-side);
		font:
			700 11px/1 'Segoe UI',
			sans-serif;
		letter-spacing: 0.06em;
	}
	.rail-label span {
		color: #b0bac6;
	}
	.rail[data-position='right'] :global(article) {
		flex-direction: row-reverse;
		border-left-width: 1px;
		border-right: 3px solid var(--live-side);
	}
	.history {
		position: absolute;
		left: 50%;
		bottom: 28px;
		transform: translateX(-50%);
		display: flex;
		gap: 4px;
		padding: 7px;
		background: #10151de0;
	}
	.history-teams,
	.history-round {
		height: 42px;
		display: grid;
		grid-template-rows: 16px 10px 16px;
		place-items: center;
		font-size: 9px;
	}
	.history-teams {
		padding-right: 5px;
	}
	.history-teams strong:last-child {
		grid-row: 3;
	}
	.history-round {
		width: 18px;
	}
	.history-round small {
		grid-row: 2;
		font-size: 7px;
		color: #b0bac6;
	}
	.history-round b {
		grid-column: 1;
		grid-row: 2;
		width: 16px;
		text-align: center;
		border-bottom: 2px solid #97a2b0;
	}
	.history-round b[data-winner-position='left'] {
		grid-row: 1;
	}
	.history-round b[data-winner-position='right'] {
		grid-row: 3;
	}
</style>
