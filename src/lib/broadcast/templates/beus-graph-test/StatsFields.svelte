<script lang="ts">
	import type { BroadcastScope } from '../../controls';
	import type { PlayerStatisticsView } from '../../../server/services/statistics-aggregation';
	import { statisticMetric } from '../../selectors';

	let { statistics, scope }: { statistics: PlayerStatisticsView | null; scope: BroadcastScope } =
		$props();
	const fields = [
		['kills', 'Kills'],
		['deaths', 'Deaths'],
		['assists', 'Assists'],
		['performanceScore', 'Perf. Score'],
		['trades', 'Trades'],
		['firstBloods', 'First Bloods'],
		['plants', 'Plants'],
		['defuses', 'Defuses']
	] as const;
</script>

<div class="fields" aria-label="K/D/A and statistics">
	{#each fields as [field, label] (field)}
		{@const metric = statisticMetric(statistics, field, scope)}
		<div data-field={field} data-coverage={metric.coverage}>
			<strong>{metric.value ?? '—'}</strong>
			<span>{label}</span>
			{#if metric.coverage === 'partial'}<small>INCOMPLETE</small>{/if}
		</div>
	{/each}
</div>

<style>
	.fields {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 7px;
	}
	.fields [data-field] {
		position: relative;
		min-width: 0;
		min-height: 62px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 9px 10px;
		background: #0b1017b8;
		border-top: 1px solid var(--gfx-line);
	}
	.fields [data-coverage='partial'] {
		border-top-color: #3ad7dc;
	}
	strong {
		color: var(--gfx-ink);
		font:
			800 25px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		font-variant-numeric: tabular-nums;
	}
	span {
		margin-top: 5px;
		color: var(--gfx-muted);
		font:
			700 10px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		position: absolute;
		right: 7px;
		top: 7px;
		color: #3ad7dc;
		font:
			700 7px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}

	/* ===== VCT Pacific ===== */
	.fields [data-field] {
		background: #16303f;
		border: 0;
	}
	strong {
		color: #fff;
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
	}
	span {
		color: #3ad7dc;
		font-family: Barlow, 'Segoe UI', sans-serif;
	}
</style>
