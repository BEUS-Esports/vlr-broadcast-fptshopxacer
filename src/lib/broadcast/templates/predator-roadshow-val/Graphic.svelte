<script module lang="ts">
	import type { SponsorSupport } from '../../sponsor';

	export const sponsor: SponsorSupport = { banners: true, loop: true };
</script>

<script lang="ts">
	import './theme.css';
	import { graphicLabels } from '../../controls';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { GraphicTemplateProps } from '../../templates';
	import { dev } from '$app/env';
	import Header from './Header.svelte';
	import PlayerLineup from './PlayerLineup.svelte';
	import PlayerStats from './PlayerStats.svelte';
	import MVP from './MVP.svelte';
	import MapVeto from './MapVeto.svelte';
	import AgentSelect from './AgentSelect.svelte';
	import PostGame from './PostGame.svelte';
	// The live HUD embeds this same scorebar; theme.css styles both for this template.
	import InGame from '../test/InGame.svelte';

	let { snapshot, graphic }: GraphicTemplateProps = $props();

	let root = $state<HTMLElement>();

	// Template contract (see templates.ts). animate() runs synchronously so the renderer's reveal never paints
	// a full-opacity frame. Without play() (admin previews) the graphic stays fully visible.
	function run(keyframes: Keyframe[]) {
		return (
			root
				?.animate(keyframes, {
					duration: prefersReducedMotion.current ? 0 : 400,
					fill: 'forwards'
				})
				.finished.then(
					() => {},
					() => {}
				) ?? Promise.resolve()
		);
	}
	const hidden = { opacity: 0, transform: 'translateY(24px)' };
	const shown = { opacity: 1, transform: 'translateY(0)' };

	export function play() {
		return run([hidden, shown]);
	}

	export function stop() {
		return run([shown, hidden]);
	}
</script>

<section
	bind:this={root}
	class="rs-root"
	aria-label={graphicLabels[graphic]}
	data-graphic-body={graphic}
>
	{#if !snapshot.selection}
		{#if graphic !== 'in-game'}
			<Header />
			<div class="empty">
				<strong>WAITING FOR MATCH</strong>
				<p>No game selected</p>
			</div>
		{/if}
	{:else if graphic === 'player-lineup'}
		<PlayerLineup {snapshot} />
	{:else if graphic === 'player-stats'}
		<PlayerStats {snapshot} />
	{:else if graphic === 'mvp'}
		<MVP {snapshot} />
	{:else if graphic === 'map-veto'}
		<MapVeto {snapshot} />
	{:else if graphic === 'agent-select'}
		<AgentSelect {snapshot} />
	{:else if graphic === 'post-game'}
		<PostGame {snapshot} />
	{:else if graphic === 'in-game'}
		<InGame {snapshot} />
	{:else}
		<p class="pending">{graphicLabels[graphic]}</p>
	{/if}
</section>

<!-- Only the In-Game HUD reserves a data-source area; full-screen graphics stay clean. -->
{#if graphic === 'in-game'}
	<footer data-attribution-safe-area aria-label="Reserved data source attribution">
		{#if dev}<span>DATA SOURCE</span>{/if}
	</footer>
{/if}

<style>
	.rs-root {
		position: absolute;
		inset: 0;
		width: 1920px;
		height: 1080px;
		overflow: hidden;
		color: var(--rs-ink);
		font-family: var(--rs-font);
	}
	.empty {
		position: absolute;
		left: 50%;
		top: 430px;
		width: 900px;
		padding: 56px 0;
		transform: translateX(-50%);
		text-align: center;
		background: var(--rs-panel-soft);
		border: 2px solid var(--rs-line);
		clip-path: polygon(
			22px 0,
			calc(100% - 22px) 0,
			100% 22px,
			100% calc(100% - 22px),
			calc(100% - 22px) 100%,
			22px 100%,
			0 calc(100% - 22px),
			0 22px
		);
	}
	.empty strong {
		display: block;
		font: 900 64px/1 var(--rs-font);
		color: var(--rs-plate-to);
	}
	.empty p {
		margin: 16px 0 0;
		font: 700 22px/1 var(--rs-font);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.pending {
		display: none;
	}
	footer {
		position: absolute;
		top: 1014px;
		right: 30px;
		width: 270px;
		height: 28px;
		text-align: right;
		color: var(--rs-label, #35e2f2);
		font: 700 11px/28px var(--rs-font, sans-serif);
		letter-spacing: 0.16em;
	}
</style>
