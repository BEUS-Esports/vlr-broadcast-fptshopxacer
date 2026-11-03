<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { selectedMvp } from '../../selectors';
	import StatsPanel from './StatsPanel.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const scope = $derived(snapshot.controls.mvpScope);
	const pick = $derived(snapshot.scopes[scope].mvpPlayerId);
	const selected = $derived(selectedMvp(snapshot));
	const scopeLabels = {
		game: 'MAP MVP',
		match: 'SERIES MVP',
		tournament: 'TOURNAMENT MVP'
	} as const;
</script>

<div class="mvp-heading">
	<div>
		<p>MOST VALUABLE PLAYER</p>
		<strong>{scopeLabels[scope]}</strong>
	</div>
	<span>MVP</span>
</div>

{#if pick === null}
	<div class="empty">MVP TBD</div>
{:else}
	{#if !selected.player}<p class="status">SELECTED PLAYER UNAVAILABLE</p>{/if}
	<div class="panel"><StatsPanel {snapshot} {scope} playerId={pick} /></div>
{/if}

<style>
	.mvp-heading {
		height: 112px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-inline: 42px;
		background: linear-gradient(90deg, #0f1f2bf2, #15303ded 66%, var(--gfx-accent-soft));
		border-block: 1px solid var(--gfx-line);
		clip-path: polygon(
			16px 0,
			100% 0,
			100% calc(100% - 16px),
			calc(100% - 16px) 100%,
			0 100%,
			0 16px
		);
	}
	.mvp-heading p {
		margin: 0;
		color: var(--gfx-accent);
		font:
			800 28px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.07em;
	}
	.mvp-heading strong {
		display: block;
		margin-top: 7px;
		color: var(--gfx-muted);
		font:
			700 12px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.14em;
	}
	.mvp-heading > span {
		color: var(--gfx-ink);
		font:
			900 58px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: -0.03em;
	}
	.panel {
		max-width: 1240px;
		margin: 44px auto 0;
	}
	.status {
		margin: 14px auto 0;
		text-align: center;
		color: var(--gfx-muted);
		font:
			700 11px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.12em;
	}
	.empty {
		width: 760px;
		margin: 90px auto 0;
		padding: 58px;
		text-align: center;
		color: var(--gfx-muted);
		background: var(--gfx-panel);
		border-top: 3px solid var(--gfx-accent);
		font:
			800 34px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.12em;
	}

	/* ===== VCT Pacific ===== */
	.mvp-heading {
		background: #3ad7dc;
		clip-path: none;
		border: 0;
	}
	.mvp-heading p,
	.mvp-heading strong,
	.mvp-heading > span {
		color: #06222a;
	}
	.mvp-heading strong {
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 40px;
	}
	.mvp-heading p {
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
		letter-spacing: 0.14em;
	}
	.mvp-heading > span {
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
	}
	.mvp-heading {
		background: #b7ff3c;
	}

	/* ===== VCT Pacific: animation xuất hiện (quét trái→phải lần lượt, chớp lime) ===== */
	@keyframes vctWipe {
		from {
			clip-path: inset(0 100% 0 0);
		}
		to {
			clip-path: inset(0 0 0 0);
		}
	}
	@keyframes vctFlash {
		0% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes vctDrop {
		from {
			transform: translateY(-24px);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}
	.mvp-heading {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.3s;
	}
	.mvp-heading:nth-child(1) {
		animation-delay: 0.3s;
	}
	.panel {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.5s;
	}
	.panel:nth-child(1) {
		animation-delay: 0.5s;
	}
	.panel::before {
		content: '';
		position: absolute;
		inset: 0;
		background: #b7ff3c;
		z-index: 9;
		pointer-events: none;
		animation: vctFlash 0.32s ease-out both;
		animation-delay: inherit;
	}
</style>
