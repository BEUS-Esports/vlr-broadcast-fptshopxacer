<script lang="ts">
	import './theme.css';
	import { graphicLabels } from '../../controls';
	import type { GraphicTemplateProps } from '../../templates';
	import { dev } from '$app/env';
	import Header from './Header.svelte';

	let { snapshot, graphic }: GraphicTemplateProps = $props();
</script>

<section class="rs-root" aria-label={graphicLabels[graphic]} data-graphic-body={graphic}>
	{#if !snapshot.selection}
		{#if graphic !== 'in-game'}
			<Header />
			<div class="empty">
				<strong>WAITING FOR MATCH</strong>
				<p>No game selected</p>
			</div>
		{/if}
	{:else}
		<p class="pending">{graphicLabels[graphic]}</p>
	{/if}
</section>

<footer
	class={{ 'in-game': graphic === 'in-game' }}
	data-attribution-safe-area
	aria-label="Reserved data source attribution"
>
	{#if dev}<span>DATA SOURCE</span>{/if}
</footer>

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
		right: 48px;
		top: 1004px;
		width: 270px;
		height: 28px;
		text-align: right;
		color: var(--rs-label, #35e2f2);
		font: 700 11px/28px var(--rs-font, sans-serif);
		letter-spacing: 0.16em;
	}
	footer.in-game {
		top: 1014px;
		right: 30px;
	}
</style>
