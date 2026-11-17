<script lang="ts">
	import type { BroadcastTeam } from '../../types';
	import Asset from '../../primitives/Asset.svelte';

	let { team, align = 'left' }: { team: BroadcastTeam | null; align?: 'left' | 'right' } = $props();
</script>

{#if team}
	<div class={['chip', align]}>
		<Asset path={team.logoPath ?? team.logoWhitePath} label={team.name} blankMissing />
		<span>{team.tag || team.name}</span>
	</div>
{/if}

<style>
	.chip {
		position: absolute;
		top: 7%;
		width: 26%;
		aspect-ratio: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		box-sizing: border-box;
		padding: 10px;
		background: #000000d0;
		border: 1px solid #1cfffa66;
		--asset-width: 64%;
		--asset-height: 56%;
	}
	.left {
		left: 7%;
	}
	.right {
		right: 7%;
	}
	span {
		max-width: 100%;
		overflow: hidden;
		white-space: nowrap;
		color: var(--rs-plate-to);
		font: 700 18px/1 var(--rs-font);
	}
</style>
