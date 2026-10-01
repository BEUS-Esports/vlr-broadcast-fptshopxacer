<script lang="ts">
	import type { Metric } from '../../server/services/statistics-aggregation';
	let { label, metric }: { label: string; metric: Metric } = $props();
</script>

<div class="stat" data-coverage={metric.coverage}>
	<span>{label}</span>
	<strong>{metric.value ?? 'Unavailable'}</strong>
	{#if metric.coverage === 'partial'}<small>Partial coverage</small>{/if}
</div>

<style>
	.stat {
		display: flex;
		gap: 12px;
		align-items: baseline;
	}
	strong {
		font-variant-numeric: tabular-nums;
	}
</style>
