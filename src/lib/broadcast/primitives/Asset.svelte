<script lang="ts">
	let {
		path,
		label,
		blankMissing = false
	}: { path: string | null; label: string; blankMissing?: boolean } = $props();
	let failedPath = $state<string | null>(null);
</script>

<span class="asset">
	{#if path && failedPath !== path}
		<img src={path} alt={label} onerror={() => (failedPath = path)} />
	{:else if !blankMissing}
		<span class="placeholder" role="img" aria-label={`${label}: image unavailable`}>—</span>
	{/if}
</span>

<style>
	.asset {
		display: inline-flex;
		width: var(--asset-width, 80px);
		height: var(--asset-height, 80px);
		flex-shrink: 0;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.placeholder {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		background: #ffffff15;
		color: #aaa;
	}
</style>
