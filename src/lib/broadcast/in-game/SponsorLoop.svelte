<script lang="ts">
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import Asset from '../primitives/Asset.svelte';

	let { logos, intervalMs }: { logos: readonly string[]; intervalMs: number } = $props();
	let index = $state(0);
	// A new snapshot with the same list keeps both the position and the running timer.
	const count = $derived(logos.length);
	// A shrunk list must never leave the index pointing past its end.
	const shown = $derived(count ? index % count : 0);

	$effect(() => {
		if (count < 2) return;
		const timer = setInterval(() => {
			index = (index + 1) % count;
		}, intervalMs);
		return () => clearInterval(timer);
	});
</script>

{#if count}
	<div class="sponsor-loop" data-sponsor-loop data-index={shown}>
		<!-- A one-item keyed each lets the outgoing logo keep its own value while it fades out. -->
		{#each [logos[shown]] as logo (logo)}
			<div class="logo" transition:fade={{ duration: prefersReducedMotion.current ? 0 : 300 }}>
				<Asset path={logo} label="Sponsor logo" />
			</div>
		{/each}
	</div>
{/if}

<style>
	.sponsor-loop {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.logo {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		--asset-width: 100%;
		--asset-height: 100%;
	}
</style>
