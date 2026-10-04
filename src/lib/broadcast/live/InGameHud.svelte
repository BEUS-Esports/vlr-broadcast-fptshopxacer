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
		resources
	}: {
		snapshot: BroadcastSnapshot;
		live: LiveGameState;
		status: LiveSessionStatus;
		resources: LiveResources | null;
	} = $props();
</script>

<section
	aria-label="External In-Game HUD"
	class="hud"
	data-live-hud
	data-provider-generation={live.generation}
>
	<NativeInGame {snapshot} />
	<div class="round-context">
		{#if live.roundNumber !== null}<span>ROUND {live.roundNumber}</span
			>{/if}{#if live.spike.state !== 'unknown' && live.spike.state !== 'carried'}<strong
				>{live.spike.state.toUpperCase()}</strong
			>{/if}
	</div>
	{#each ['left', 'right'] as position (position)}
		{@const entryId =
			position === 'left' ? snapshot.presentation.leftEntryId : snapshot.presentation.rightEntryId}
		{@const team = live.teams.find((team) => team.entryId === entryId)}
		{@const side = gameplaySide(snapshot, entryId)}
		<div class="score" data-position={position}>{team?.score ?? '—'}</div>
		<div
			class="rail"
			data-position={position}
			data-side={side ?? 'neutral'}
			style:--live-side={side === 'attack' ? '#248bff' : side === 'defense' ? '#ff4655' : '#97a2b0'}
		>
			<div class="rail-label">
				<strong>{snapshot.teams.find((team) => team.entryId === entryId)?.tag ?? '—'}</strong><span
					>{live.phase === 'buy' ? 'BUY PHASE' : (side?.toUpperCase() ?? '')}</span
				>
			</div>
			{#each [1, 2, 3, 4, 5] as slot (slot)}
				{@const saved = snapshot.lineups.find(
					(lineup) => lineup.entryId === entryId && lineup.slot === slot
				)}
				{@const player =
					team?.players.find(
						(player) => player.playerId && player.playerId === saved?.player?.playerId
					) ?? null}
				<PlayerCard {saved} live={player} {resources} />
			{/each}
		</div>
	{/each}
	{#if live.rounds.length}<div class="history" aria-label="Round history">
			{#each live.rounds as round (round.round)}{@const team = live.teams.find(
					(team) => team.providerSide === round.winnerProviderSide
				)}{@const winner = snapshot.teams.find((local) => local.entryId === team?.entryId)}<span
					title={`Round ${round.round}: ${winner?.tag ?? 'Unknown winner'} · ${round.reason}`}
					>{round.reason === 'defuse'
						? 'D'
						: round.reason === 'elimination'
							? 'E'
							: round.reason === 'time'
								? 'T'
								: 'S'}</span
				>{/each}
		</div>{/if}
	<ProviderAttribution {status} />
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
	.history span {
		width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		font-size: 9px;
		border-bottom: 2px solid #97a2b0;
	}
</style>
