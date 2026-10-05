<script lang="ts">
	import type { LiveSessionStatus } from '#lib/live/types.ts';
	let { status }: { status: LiveSessionStatus } = $props();
	const text = $derived(
		status.provider === 'spectra'
			? status.attribution === 'supporter'
				? null
				: 'Powered by ValoSpectra'
			: status.provider === 'gstack'
				? 'Powered by GStack'
				: null
	);
</script>

{#if text}<aside aria-label="Provider attribution" class="attribution">{text}</aside>{/if}

<style>
	.attribution {
		position: absolute;
		bottom: 8px;
		left: 30px;
		padding: 4px 10px;
		background: #10151df2;
		color: #f7f4eb;
		border-left: 2px solid #63e6d7;
		font:
			700 11px/1.2 'Segoe UI',
			sans-serif;
		letter-spacing: 0.02em;
	}
</style>
