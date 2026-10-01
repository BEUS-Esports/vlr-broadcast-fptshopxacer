<script lang="ts">
	import type { BroadcastScope } from '../../controls';
	import type { PlayerStatisticsView } from '../../../server/services/statistics-aggregation';
	import { statisticMetric } from '../../selectors';
	import StatValue from '../../primitives/StatValue.svelte';
	let { statistics, scope }: { statistics: PlayerStatisticsView | null; scope: BroadcastScope } =
		$props();
	const fields = [
		['kills', 'Kills'],
		['deaths', 'Deaths'],
		['assists', 'Assists'],
		['performanceScore', 'Performance Score'],
		['trades', 'Trades'],
		['firstBloods', 'First Bloods'],
		['plants', 'Plants'],
		['defuses', 'Defuses']
	] as const;
</script>

<div class="fields" aria-label="K/D/A and statistics">
	{#each fields as [field, label] (field)}
		<div data-field={field}>
			<StatValue {label} metric={statisticMetric(statistics, field, scope)} />
		</div>
	{/each}
</div>

<style>
	.fields {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
	}
	.fields :global(.stat) {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-height: 56px;
		line-height: 1.2;
	}
	.fields :global(span) {
		font-size: 15px;
		white-space: nowrap;
	}
	.fields :global(strong) {
		font-size: 20px;
	}
	.fields :global(small) {
		font-size: 12px;
	}
</style>
