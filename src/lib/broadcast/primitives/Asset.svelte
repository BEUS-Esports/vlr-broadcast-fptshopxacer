<script lang="ts">
	import { assetRetryDelays } from '../preload';

	let {
		path,
		label,
		blankMissing = false
	}: { path: string | null; label: string; blankMissing?: boolean } = $props();
	let failedPath = $state<string | null>(null);
	let attempt = $state(0);
	let retries = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		// A new saved URL gets its own retry budget; retiring the URL cancels its timer.
		const currentPath = path;
		failedPath = null;
		retries = 0;
		return () => {
			if (currentPath && timer !== undefined) clearTimeout(timer);
			timer = undefined;
		};
	});

	function failed(currentPath: string) {
		if (currentPath !== path || failedPath === currentPath) return;
		failedPath = currentPath;
		const delay = assetRetryDelays[retries++];
		if (delay === undefined) return;
		timer = setTimeout(() => {
			timer = undefined;
			if (path !== currentPath) return;
			attempt++;
			failedPath = null;
		}, delay);
	}
</script>

<span class="asset">
	{#if path && failedPath !== path}
		{@const currentPath = path}
		{#key `${currentPath}:${attempt}`}
			<img src={currentPath} alt={label} onerror={() => failed(currentPath)} />
		{/key}
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
