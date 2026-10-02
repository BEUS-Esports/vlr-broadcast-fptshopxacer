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
		background: linear-gradient(90deg, #10151df2, #171e28ed 66%, var(--gfx-accent-soft));
		border-block: 1px solid var(--gfx-line);
		clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);
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
</style>
