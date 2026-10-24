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
</script>

{#if graphic === 'in-game'}
	<InGame {snapshot} />
{:else}
	<section class="pregame" aria-label={graphicLabels[graphic]}>
		<header class="package-header">
			<div class="title-lockup">
				<p class="event-name">{snapshot.tournament?.name ?? 'VALORANT'}</p>
				<h1>{graphicLabels[graphic]}</h1>
			</div>
			<div class="event-context">
				<strong>{snapshot.match?.label ?? 'Match unavailable'}</strong>
				<p>
					Game {snapshot.game?.number ?? '—'}
					<span aria-hidden="true"> // </span>
					{snapshot.game?.map?.displayName ?? snapshot.game?.name ?? 'Map TBD'}
				</p>
			</div>
		</header>

		<div class="content-frame">
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
				<div class="empty-state">
					<strong>WAITING FOR MATCH</strong>
					<p>No game selected</p>
				</div>
			{/if}
		</div>
	</section>
{/if}

<footer
	class:in-game={graphic === 'in-game'}
	data-attribution-safe-area
	aria-label="Reserved data source attribution"
>
	{#if dev}<span>DATA SOURCE</span>{/if}
</footer>

<svelte:head>
	<!-- VCT Pacific: Barlow Condensed (tiêu đề) + Barlow (số, nhãn) -->
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@500;600;700&display=swap"
	/>
</svelte:head>

<style>
	section {
		position: absolute;
		left: 48px;
		top: 48px;
		color: #f7f4eb;
		font:
			20px/1.25 'Segoe UI',
			sans-serif;
		--gfx-bg: #081219;
		--gfx-panel: #0f1f2bed;
		--gfx-panel-solid: #0f1f2b;
		--gfx-panel-raised: #15303d;
		--gfx-line: #2a8c96;
		--gfx-muted: #9fd8dc;
		--gfx-ink: #f7f4eb;
		--gfx-accent: #3ad7dc;
		--gfx-accent-soft: #3ad7dc28;
		--gfx-attack: #248bff;
		--gfx-defense: #ff4655;
		--gfx-cut: 22px;
	}
	h1,
	p {
		margin: 0;
	}
	section.pregame {
		width: 1824px;
		height: 936px;
		box-sizing: border-box;
		padding: 0;
		background: transparent;
		overflow: hidden;
	}
	.package-header {
		position: relative;
		height: 118px;
		box-sizing: border-box;
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 48px;
		padding: 18px 30px 19px;
		background:
			linear-gradient(90deg, var(--gfx-accent) 0 156px, transparent 156px) top left / 100% 4px
				no-repeat,
			/* VCT: khối tím sáng → chàm đậm */
			linear-gradient(100deg, #1d6f78f5 0%, #16505af2 38%, #12283af0 72%, #0a161fe8 100%);
		clip-path: polygon(
			0 0,
			calc(100% - var(--gfx-cut)) 0,
			100% var(--gfx-cut),
			100% 100%,
			var(--gfx-cut) 100%,
			0 calc(100% - var(--gfx-cut))
		);
		border-bottom: 1px solid var(--gfx-line);
	}
	.package-header::after {
		content: '';
		position: absolute;
		left: 30px;
		right: 30px;
		bottom: 0;
		height: 1px;
		background: linear-gradient(90deg, var(--gfx-accent), #3ad7dc00 54%);
	}
	.title-lockup {
		min-width: 0;
	}
	.event-name {
		max-width: 900px;
		color: var(--gfx-accent);
		font:
			700 14px/1.1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pregame h1 {
		margin-top: 7px;
		text-shadow: 0 3px 0 #0a161f80;
		font:
			800 50px/0.95 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.035em;
		text-transform: uppercase;
	}
	.event-context {
		max-width: 660px;
		min-width: 300px;
		text-align: right;
		padding-bottom: 2px;
	}
	.event-context strong {
		font:
			700 22px/1.05 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.event-context p {
		margin-top: 8px;
		color: var(--gfx-muted);
		font:
			600 15px/1 'Segoe UI',
			sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.event-context strong,
	.event-context p {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.content-frame {
		position: relative;
		height: 800px;
		box-sizing: border-box;
		padding-top: 20px;
	}
	.empty-state {
		position: absolute;
		inset: 160px 260px auto;
		padding: 52px;
		text-align: center;
		background: linear-gradient(135deg, #0f1f2bf2, #15303de8);
		border-block: 1px solid var(--gfx-line);
		clip-path: polygon(
			20px 0,
			100% 0,
			100% calc(100% - 20px),
			calc(100% - 20px) 100%,
			0 100%,
			0 20px
		);
	}
	.empty-state strong {
		color: var(--gfx-accent);
		font:
			800 38px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}
	.empty-state p {
		margin-top: 12px;
		color: var(--gfx-muted);
		font-size: 18px;
	}
	footer {
		position: absolute;
		right: 48px;
		top: 1004px;
		width: 270px;
		height: 28px;
		box-sizing: border-box;
		padding-right: 14px;
		text-align: right;
		color: #9fd8dc;
		font:
			700 11px/28px Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.16em;
		background: linear-gradient(90deg, transparent, #0f1f2bb8);
		border-right: 2px solid #3ad7dc;
	}
	footer.in-game {
		top: 1014px;
		right: 30px;
		background: transparent;
		border-right: 0;
	}
	footer.in-game span {
		display: inline-block;
		padding: 0 10px;
		background: linear-gradient(90deg, transparent, #0f1f2bb8);
		border-right: 2px solid #3ad7dc;
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pregame :global(p),
	.pregame :global(h2) {
		overflow-wrap: anywhere;
	}

	/* ===== VCT Pacific: panel xanh than #10222e, thanh cyan #3ad7dc, nhấn lime #b7ff3c, tiêu đề Barlow Condensed ===== */
	section {
		--gfx-bg: #07090f;
		--gfx-panel: #10222e;
		--gfx-panel-solid: #10222e;
		--gfx-panel-raised: #16303f;
		--gfx-line: #2a8c96;
		--gfx-muted: #3ad7dc;
		--gfx-accent: #3ad7dc;
		--gfx-accent-soft: #3ad7dc26;
		--vct-ink: #06222a;
		--vct-violet: #10222e;
		--vct-violet-deep: #0b1822;
		--vct-gold: #3ad7dc;
		--vct-pink: #b7ff3c;
		--vct-display: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		--vct-mono: Barlow, 'Segoe UI', sans-serif;
		font-family: var(--vct-display);
	}
	section.pregame {
		background: radial-gradient(ellipse 70% 60% at 50% 55%, #0f3a4466, transparent 70%);
	}
	.package-header {
		height: 150px;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 4px;
		padding: 0;
		background: none;
		clip-path: none;
		border: 0;
	}
	.package-header::after {
		display: none;
	}
	.title-lockup {
		text-align: center;
	}
	.event-name {
		margin: 0 auto;
		color: var(--vct-gold);
		font: 700 13px/1 var(--vct-mono);
		letter-spacing: 0.14em;
	}
	.pregame h1 {
		margin-top: 2px;
		color: #fff;
		text-shadow: none;
		font: 800 92px/0.95 var(--vct-display);
		letter-spacing: 0.01em;
	}
	.event-context {
		text-align: center;
		min-width: 0;
		display: flex;
		gap: 22px;
		justify-content: center;
		align-items: baseline;
	}
	.event-context strong,
	.event-context p {
		margin: 0;
		color: var(--vct-gold);
		font: 700 13px/1 var(--vct-mono);
		letter-spacing: 0.14em;
	}
	.content-frame {
		height: 770px;
	}
	.empty-state {
		background: var(--vct-violet);
		clip-path: none;
		border: 0;
	}
	.empty-state strong {
		color: #fff;
		font: 800 52px/1 var(--vct-display);
	}
	.empty-state p {
		color: var(--vct-gold);
		font: 700 14px/1 var(--vct-mono);
		letter-spacing: 0.14em;
	}
	footer {
		color: var(--vct-gold, #3ad7dc);
		font:
			700 11px/28px Barlow,
			'Segoe UI',
			sans-serif;
		letter-spacing: 0.14em;
		background: none;
		border-right: 0;
	}
	footer.in-game span {
		background: none;
		border-right: 0;
	}
	/* góc khung chữ L màu lime (VCT Pacific) */
	.content-frame::before,
	.content-frame::after {
		content: '';
		position: absolute;
		width: 64px;
		height: 64px;
		border: 0 solid #b7ff3c;
		z-index: 5;
		pointer-events: none;
	}
	.content-frame::before {
		left: 0;
		top: 8px;
		border-width: 4px 0 0 4px;
	}
	.content-frame::after {
		right: 0;
		bottom: 8px;
		border-width: 0 4px 4px 0;
	}
	.pregame h1 {
		text-transform: uppercase;
	}
	@keyframes vctTitle {
		from {
			opacity: 0;
			filter: blur(8px);
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			filter: none;
			transform: none;
		}
	}
	@keyframes vctBar {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}
	@keyframes vctCorner {
		from {
			opacity: 0;
			transform: scale(0.4);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.title-lockup {
		animation: vctTitle 0.3s ease-out both;
	}
	.event-context {
		animation: vctTitle 0.3s 0.12s ease-out both;
	}
	.package-header::after {
		display: block;
		left: 50%;
		right: auto;
		width: 360px;
		margin-left: -180px;
		bottom: 6px;
		height: 6px;
		background: #3ad7dc;
		transform-origin: center;
		animation: vctBar 0.35s 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	.content-frame::before {
		transform-origin: top left;
		animation: vctCorner 0.3s 0.3s ease-out both;
	}
	.content-frame::after {
		transform-origin: bottom right;
		animation: vctCorner 0.3s 0.3s ease-out both;
	}
	/* gạch đứt lime dọc hai mép như bộ Pacific */
	section.pregame::before,
	section.pregame::after {
		content: '';
		position: absolute;
		top: 330px;
		width: 4px;
		height: 260px;
		background: repeating-linear-gradient(180deg, #b7ff3c 0 10px, transparent 10px 20px);
		opacity: 0.85;
		z-index: 4;
		animation: vctTitle 0.4s 0.4s ease-out both;
	}
	section.pregame::before {
		left: 0;
	}
	section.pregame::after {
		right: 0;
	}
</style>
