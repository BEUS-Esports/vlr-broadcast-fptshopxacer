<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import StatsPanel from './StatsPanel.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const control = $derived(snapshot.controls.playerStats);
	const scopeLabels = {
		game: 'CURRENT MAP',
		match: 'SERIES',
		tournament: 'TOURNAMENT'
	} as const;
</script>

<div class="stats-heading">
	<p>{control.mode === 'single' ? 'PLAYER TO WATCH' : 'PLAYER MATCHUP'}</p>
	<strong>{scopeLabels[control.scope]}</strong>
</div>

<div class="panels" class:single={control.mode === 'single'}>
	<StatsPanel {snapshot} scope={control.scope} playerId={control.playerId} />
	{#if control.mode === 'head-to-head'}
		<div class="versus" aria-hidden="true">VS</div>
		<StatsPanel {snapshot} scope={control.scope} playerId={control.opponentPlayerId} />
	{/if}
</div>

<style>
	.stats-heading {
		height: 92px;
		box-sizing: border-box;
		display: flex;
		align-items: end;
		justify-content: space-between;
		padding: 0 22px 16px;
		border-bottom: 1px solid var(--gfx-line);
	}
	.stats-heading p {
		margin: 0;
		color: var(--gfx-accent);
		font:
			800 27px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}
	.stats-heading strong {
		color: var(--gfx-muted);
		font:
			700 12px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.14em;
	}
	.panels {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 22px;
		margin-top: 42px;
	}
	.panels.single {
		grid-template-columns: minmax(0, 1180px);
		justify-content: center;
	}
	.versus {
		position: absolute;
		z-index: 5;
		left: 50%;
		top: 50%;
		width: 58px;
		height: 58px;
		display: grid;
		place-items: center;
		transform: translate(-50%, -50%);
		color: var(--gfx-bg);
		background: var(--gfx-accent);
		font:
			900 18px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		clip-path: polygon(
			12px 0,
			100% 0,
			100% calc(100% - 12px),
			calc(100% - 12px) 100%,
			0 100%,
			0 12px
		);
	}

	/* ===== VCT Pacific ===== */
	.stats-heading p {
		color: #3ad7dc;
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
		letter-spacing: 0.14em;
	}
	.stats-heading strong {
		color: #fff;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 34px;
	}
	.versus {
		background: #3ad7dc;
		color: #06222a;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
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
	.versus {
		animation: vctDrop 0.4s 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
</style>
