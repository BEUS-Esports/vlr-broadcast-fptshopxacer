<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { lineupForTeam, playerInScope } from '../../selectors';
	import ScoreHeader from '../../primitives/ScoreHeader.svelte';
	import ResourceCard from '../../primitives/ResourceCard.svelte';
	import StatsFields from './StatsFields.svelte';
	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
</script>

<div class="header">
	<ScoreHeader {snapshot} />
	<p>
		Map: {snapshot.game?.map?.displayName ?? 'Map unavailable'} · Games contributing: {snapshot
			.scopes.game.statistics.gamesContributing} / {snapshot.scopes.game.statistics.gamesTotal}
	</p>
</div>
<div class="rosters">
	{#each ['left', 'right'] as position (position)}
		{@const entryId =
			position === 'left' ? snapshot.presentation.leftEntryId : snapshot.presentation.rightEntryId}
		{@const lineup = lineupForTeam(snapshot, entryId)}
		<div data-roster-position={position} data-entry-id={entryId}>
			{#each [1, 2, 3, 4, 5] as slot (slot)}
				{@const saved = lineup.find((row) => row.slot === slot)}
				{@const statistics = playerInScope(
					snapshot,
					'game',
					saved?.player?.playerId ?? null
				).statistics}
				<article
					data-slot={slot}
					data-mvp={!!saved?.player && saved.player.playerId === snapshot.scopes.game.mvpPlayerId}
				>
					<div class="player">
						<ResourceCard resource={{ kind: 'player', value: saved?.player ?? null }} />
						<p>Agent: {saved?.agent?.displayName ?? 'Agent unavailable'}</p>
						<p class="coverage">Games played: {statistics?.gamesPlayed ?? 'Unavailable'}</p>
						<p class="coverage">
							Games with statistics: {statistics
								? `${statistics.gamesWithStatistics} / ${statistics.gamesPlayed}`
								: 'Unavailable'}
						</p>
						{#if saved?.player && saved.player.playerId === snapshot.scopes.game.mvpPlayerId}<p>
								Saved game MVP
							</p>{/if}
					</div>
					<StatsFields {statistics} scope="game" />
				</article>
			{/each}
		</div>
	{/each}
</div>

<style>
	.header {
		height: 140px;
		font:
			18px/1.2 'Segoe UI',
			sans-serif;
		--asset-width: 48px;
		--asset-height: 48px;
	}
	.header :global(strong) {
		font-size: 20px;
	}
	.header :global(.score) {
		font:
			600 52px/1 Bahnschrift,
			sans-serif;
		color: #54c5c0;
	}
	.header :global(.teams > div) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 20px;
		background: #101d30f2;
	}
	.header :global(small) {
		font-size: 16px;
	}
	.header :global(.identity) {
		padding: 4px;
	}
	.header :global(.teams > div) {
		flex: 1;
		min-width: 0;
	}
	.header :global(header p) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	p {
		margin: 0;
		font-size: 20px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rosters {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	article {
		display: grid;
		grid-template-columns: 190px minmax(0, 1fr);
		gap: 12px;
		padding: 8px;
		margin-bottom: 0;
		min-height: 136px;
		box-sizing: border-box;
		background: #101d30f2;
		border-bottom: 1px solid #38526d;
		--asset-width: 36px;
		--asset-height: 36px;
	}
	.player {
		min-width: 0;
	}
	.player p {
		font-size: 17px;
		margin-top: 4px;
	}
	.player :global(.identity) {
		padding: 4px;
	}
	.player p.coverage {
		font-size: 13px;
		line-height: 1.2;
		margin-top: 0;
	}
	article[data-mvp='true'] {
		outline: 2px solid #54c5c0;
		outline-offset: -2px;
	}
</style>
