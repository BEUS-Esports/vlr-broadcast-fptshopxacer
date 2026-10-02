<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import type { BroadcastScope } from '../../controls';
	import { playerInScope, teamByEntryId } from '../../selectors';
	import ResourceCard from '../../primitives/ResourceCard.svelte';
	import Identity from '../../primitives/Identity.svelte';
	import StatsFields from './StatsFields.svelte';
	let {
		snapshot,
		scope,
		playerId
	}: { snapshot: BroadcastSnapshot; scope: BroadcastScope; playerId: string | null } = $props();
	const selected = $derived(playerInScope(snapshot, scope, playerId));
	const entries = $derived(selected.player?.entryIds ?? selected.statistics?.entryIds ?? []);
	const agent = $derived(
		scope === 'game'
			? (snapshot.lineups.find((row) => row.player?.playerId === playerId)?.agent ?? null)
			: null
	);
</script>

<article data-player-panel={playerId}>
	{#if playerId === null}<p>No player selected</p>{:else if !selected.player}<p>
			Selected player unavailable
		</p>{/if}
	<ResourceCard resource={{ kind: 'player', value: selected.player }} />
	<div class="teams">
		{#each entries as entryId (entryId)}
			{@const team = teamByEntryId(snapshot, entryId)}
			<Identity
				name={team?.name ?? null}
				assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
				unavailable="Team unavailable"
			/>
		{:else}<p>Team unavailable</p>{/each}
	</div>
	<p class="agent">Agent: {agent?.displayName ?? 'Agent unavailable'}</p>
	<p>Games played: {selected.statistics?.gamesPlayed ?? 'Unavailable'}</p>
	<p>
		Games with statistics: {selected.statistics
			? `${selected.statistics.gamesWithStatistics} / ${selected.statistics.gamesPlayed}`
			: 'Unavailable'}
	</p>
	<StatsFields statistics={selected.statistics} {scope} />
</article>

<style>
	article {
		padding: 32px;
		background: #101d30f2;
		border-top: 4px solid #54c5c0;
		min-width: 0;
		--asset-width: 160px;
		--asset-height: 160px;
	}
	.teams {
		margin: 16px 0;
		--asset-width: 48px;
		--asset-height: 48px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	p {
		margin: 8px 0;
		font-size: 20px;
		color: #9fb2c8;
	}
	.agent {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	article :global(.fields) {
		margin-top: 24px;
		row-gap: 24px;
	}
	article :global(.fields [data-field]) {
		background: #162b43;
		padding: 12px;
	}
	article :global(.fields strong) {
		font:
			600 32px/1.2 Bahnschrift,
			sans-serif;
		color: #f1f6fa;
	}
</style>
