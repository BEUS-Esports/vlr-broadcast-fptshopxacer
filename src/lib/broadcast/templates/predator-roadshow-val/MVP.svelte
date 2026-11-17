<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import Header from './Header.svelte';
	import PlayerFeature from './PlayerFeature.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const scope = $derived(snapshot.controls.mvpScope);
	const pick = $derived(snapshot.scopes[scope].mvpPlayerId);
</script>

<Header title="MVP" logos={false} />
{#if pick === null}
	<div class="empty"><strong>MVP TBD</strong></div>
{:else}
	<PlayerFeature {snapshot} {scope} playerId={pick} fields={snapshot.controls.mvpFields} />
{/if}

<style>
	.empty {
		position: absolute;
		left: 50%;
		top: 460px;
		padding: 48px 120px;
		translate: -50% 0;
		background: #000000d9;
		border: 2px solid var(--rs-line);
	}
	.empty strong {
		color: var(--rs-plate-to);
		font: 900 64px/1 var(--rs-font);
	}
</style>
