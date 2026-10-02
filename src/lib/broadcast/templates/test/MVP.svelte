<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { selectedMvp } from '../../selectors';
	import StatsPanel from './StatsPanel.svelte';
	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const scope = $derived(snapshot.controls.mvpScope);
	const pick = $derived(snapshot.scopes[scope].mvpPlayerId);
	const selected = $derived(selectedMvp(snapshot));
	const statistics = $derived(snapshot.scopes[scope].statistics);
</script>

<p>Operator-selected MVP · Scope: {scope}</p>
<p>Games contributing: {statistics.gamesContributing} / {statistics.gamesTotal}</p>
{#if pick === null}
	<p>No saved MVP selection</p>
{:else}
	{#if !selected.player}<p>Saved MVP player unavailable</p>{/if}
	<div class="panel"><StatsPanel {snapshot} {scope} playerId={pick} /></div>
{/if}

<style>
	p {
		margin: 0 0 8px;
	}
	.panel {
		max-width: 1000px;
		margin: 24px auto 0;
	}
	p:first-of-type {
		font:
			600 28px Bahnschrift,
			sans-serif;
		color: #54c5c0;
	}
</style>
