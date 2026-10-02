<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import StatsPanel from './StatsPanel.svelte';
	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const control = $derived(snapshot.controls.playerStats);
	const statistics = $derived(snapshot.scopes[control.scope].statistics);
</script>

<p>
	{control.mode === 'single' ? 'Single / Player to Watch' : 'Head-to-Head'} · Scope: {control.scope}
</p>
<p>Games contributing: {statistics.gamesContributing} / {statistics.gamesTotal}</p>
<div class="panels" class:single={control.mode === 'single'}>
	<StatsPanel {snapshot} scope={control.scope} playerId={control.playerId} />
	{#if control.mode === 'head-to-head'}<StatsPanel
			{snapshot}
			scope={control.scope}
			playerId={control.opponentPlayerId}
		/>{/if}
</div>

<style>
	p {
		margin: 0 0 8px;
	}
	.panels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
		margin-top: 24px;
	}
	p:first-of-type {
		font:
			600 28px Bahnschrift,
			sans-serif;
		color: #54c5c0;
	}
	.single {
		grid-template-columns: minmax(0, 1000px);
		justify-content: center;
	}
</style>
