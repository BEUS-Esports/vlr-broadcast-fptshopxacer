<script lang="ts">
	import { graphicLabels } from '../../controls';
	import type { GraphicTemplateProps } from '../../templates';
	import PlayerLineup from './PlayerLineup.svelte';
	import MapVeto from './MapVeto.svelte';
	import AgentSelect from './AgentSelect.svelte';
	import PostGame from './PostGame.svelte';
	import PlayerStats from './PlayerStats.svelte';
	import MVP from './MVP.svelte';
	import InGame from './InGame.svelte';
	import { dev } from '$app/env';
	let { snapshot, graphic }: GraphicTemplateProps = $props();
	const pregame = $derived(
		snapshot.selection !== null &&
			['player-lineup', 'map-veto', 'agent-select', 'post-game', 'player-stats', 'mvp'].includes(
				graphic
			)
	);
</script>

{#if graphic === 'in-game'}
	<InGame {snapshot} />
{:else}
	<section class:pregame aria-label={graphicLabels[graphic]}>
		<header class="package-header">
			<div>
				<p class="eyebrow">Test GFX v2 · Saved preparation</p>
				<h1>{graphicLabels[graphic]}</h1>
			</div>
			<div class="event-context">
				<strong>{snapshot.tournament?.name ?? 'Tournament unavailable'}</strong>
				<p>{snapshot.match?.label ?? 'Match unavailable'} · Game {snapshot.game?.number ?? '—'}</p>
			</div>
		</header>
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
{/if}
<footer
	class:in-game={graphic === 'in-game'}
	data-attribution-safe-area
	aria-label="Reserved data source attribution"
>
	{#if dev}<span>Attribution test area</span>{/if}
</footer>

<style>
	section {
		position: absolute;
		left: 64px;
		top: 64px;
		padding: 24px;
		color: #f1f6fa;
		background: #101d30ed;
		font:
			24px/1.3 'Segoe UI',
			sans-serif;
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
		font:
			600 44px/1.1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.02em;
	}
	.package-header {
		height: 96px;
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 48px;
	}
	.eyebrow {
		color: #54c5c0;
		font:
			600 14px/1.8 'Segoe UI',
			sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.16em;
	}
	.event-context {
		max-width: 680px;
		text-align: right;
		padding-top: 8px;
		font-size: 20px;
	}
	.event-context strong,
	.event-context p {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.event-context p {
		color: #9fb2c8;
		margin-top: 4px;
	}
	footer {
		position: absolute;
		right: 64px;
		top: 1004px;
		width: 248px;
		height: 28px;
		text-align: right;
		color: #9fb2c8;
		font:
			14px/28px 'Segoe UI',
			sans-serif;
	}
	footer.in-game {
		top: 352px;
		right: 480px;
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
