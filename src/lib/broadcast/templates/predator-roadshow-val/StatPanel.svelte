<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BroadcastScope } from '../../controls';
	import type { StatisticField } from '#lib/statistics/fields.ts';
	import type { PlayerStatisticsView } from '../../../server/services/statistics-aggregation';
	import { statisticMetric } from '../../selectors';
	import { statLabels } from './labels';
	import { fitGroup } from './fit';
	import panel from './assets/stat-panel.webp';

	let {
		statistics,
		fields,
		scope,
		compare,
		children
	}: {
		statistics: PlayerStatisticsView | null;
		fields: StatisticField[];
		scope: BroadcastScope;
		/** Present (even null) for head-to-head: left value, label, right value per row. */
		compare?: PlayerStatisticsView | null;
		children?: Snippet;
	} = $props();
	const versus = $derived(compare !== undefined);
	const rows = $derived(versus ? fields.length + (children ? 1 : 0) : Math.ceil(fields.length / 2));
	function format(field: StatisticField, value: number | null) {
		if (value === null) return '—';
		return field === 'performanceScore' ? String(Math.round(value)) : String(value);
	}
</script>

{#snippet label(field: StatisticField)}
	<span class="label">
		<strong data-fit="labels">{statLabels[field].en}</strong>
		<small>{statLabels[field].vi}</small>
	</span>
{/snippet}

<div class={['panel', { versus }]} {@attach fitGroup('labels')} style:--rows={rows}>
	<img class="frame" src={panel} alt="" />
	<div class="grid">
		{#each fields as field (field)}
			{@const metric = statisticMetric(statistics, field, scope)}
			{#if versus}
				{@const other = statisticMetric(compare ?? null, field, scope)}
				<div class="row" data-field={field} data-coverage={metric.coverage}>
					<span class="value" data-value>{format(field, metric.value)}</span>
					{@render label(field)}
					<span class="value" data-value>{format(field, other.value)}</span>
				</div>
			{:else}
				<div class="cell" data-field={field} data-coverage={metric.coverage}>
					{@render label(field)}
					<span class="value" data-value>{format(field, metric.value)}</span>
					{#if metric.coverage === 'partial'}<em>INCOMPLETE</em>{/if}
				</div>
			{/if}
		{/each}
		{@render children?.()}
	</div>
</div>

<style>
	.panel {
		position: relative;
		width: 100%;
		height: 100%;
	}
	.frame {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.grid {
		position: absolute;
		inset: 44px 48px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-template-rows: repeat(var(--rows), 1fr);
	}
	.cell {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 6px;
		padding-left: 36px;
		border-bottom: 1px solid #1cfffa2e;
	}
	.cell:nth-child(odd) {
		border-right: 1px solid #1cfffa2e;
	}
	.label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding-right: 20px;
	}
	.label strong {
		display: block;
		overflow: hidden;
		color: var(--rs-label);
		font: 900 calc(52px * var(--fit-labels, 1)) / 1 var(--rs-font);
		white-space: nowrap;
	}
	.label small {
		color: #d6f7fa;
		font: 400 19px/1.2 var(--rs-font);
	}
	.value {
		color: var(--rs-ink);
		font: 900 64px/1.05 var(--rs-font);
	}
	em {
		position: absolute;
		right: 20px;
		top: 18px;
		color: #ffcf5a;
		font: 700 13px/1 var(--rs-font);
		font-style: normal;
		letter-spacing: 0.12em;
	}
	/* Head-to-head: one comparison per row. */
	.versus .grid {
		grid-template-columns: 1fr;
		inset: 40px 56px;
	}
	.versus .grid > :global(*) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr);
		align-items: center;
		border-bottom: 1px solid #1cfffa38;
	}
	.row .value {
		text-align: center;
		font-size: 52px;
	}
	.row .label {
		align-items: stretch;
		padding-right: 0;
		text-align: center;
	}
	.row .label strong {
		font-size: calc(44px * var(--fit-labels, 1));
	}
	.row .label small {
		font-size: 16px;
	}
</style>
