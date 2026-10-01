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
	<p>Agent: {agent?.displayName ?? 'Agent unavailable'}</p>
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
		padding: 24px;
		background: #111c;
		min-width: 0;
		--asset-width: 100px;
		--asset-height: 100px;
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
		font-size: 22px;
	}
	article :global(.fields) {
		margin-top: 24px;
		row-gap: 24px;
	}
</style>
