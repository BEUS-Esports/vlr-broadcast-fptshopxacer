<script lang="ts">
	import { graphicLabels } from '../../controls';
	import type { GraphicTemplateProps } from '../../templates';
	let { snapshot, graphic }: GraphicTemplateProps = $props();
</script>

<section aria-label={graphicLabels[graphic]}>
	<h1>{graphicLabels[graphic]}</h1>
	{#if snapshot.selection}
		<p>{snapshot.tournament?.name ?? 'Unknown tournament'}</p>
		<p>{snapshot.match?.label ?? 'Unknown match'} · {snapshot.game?.name ?? 'Unknown game'}</p>
	{:else}
		<p>No game selected</p>
	{/if}
</section>

<style>
	section {
		position: absolute;
		left: 64px;
		top: 64px;
		padding: 24px;
		color: white;
		background: #111c;
		font: 24px/1.4 sans-serif;
	}
	h1,
	p {
		margin: 0;
	}
</style>
