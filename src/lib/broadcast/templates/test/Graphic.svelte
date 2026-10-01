<script lang="ts">
	import { graphicLabels } from '../../controls';
	import type { GraphicTemplateProps } from '../../templates';
	import PlayerLineup from './PlayerLineup.svelte';
	import MapVeto from './MapVeto.svelte';
	import AgentSelect from './AgentSelect.svelte';
	import PostGame from './PostGame.svelte';
	import PlayerStats from './PlayerStats.svelte';
	import MVP from './MVP.svelte';
	let { snapshot, graphic }: GraphicTemplateProps = $props();
	const pregame = $derived(
		snapshot.selection !== null &&
			['player-lineup', 'map-veto', 'agent-select', 'post-game', 'player-stats', 'mvp'].includes(
				graphic
			)
	);
</script>

<section class:pregame aria-label={graphicLabels[graphic]}>
	<h1>{graphicLabels[graphic]}</h1>
	{#if snapshot.selection && graphic === 'player-lineup'}
		<PlayerLineup {snapshot} />
	{:else if snapshot.selection && graphic === 'map-veto'}
		<MapVeto {snapshot} />
	{:else if snapshot.selection && graphic === 'agent-select'}
		<AgentSelect {snapshot} />
	{:else if snapshot.selection && graphic === 'post-game'}
		<PostGame {snapshot} />
	{:else if snapshot.selection && graphic === 'player-stats'}
		<PlayerStats {snapshot} />
	{:else if snapshot.selection && graphic === 'mvp'}
		<MVP {snapshot} />
	{:else if snapshot.selection}
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
	section.pregame {
		width: 1792px;
		height: 952px;
		box-sizing: border-box;
		padding: 0;
		background: transparent;
	}
	.pregame h1 {
		height: 96px;
		font-size: 40px;
	}
	.pregame :global(.identity) {
		min-width: 0;
		overflow: hidden;
	}
	.pregame :global(.identity > div) {
		min-width: 0;
	}
	.pregame :global(strong),
	.pregame :global(small) {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pregame :global(p),
	.pregame :global(h2) {
		overflow-wrap: anywhere;
	}
</style>
