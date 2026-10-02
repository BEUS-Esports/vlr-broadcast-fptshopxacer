<script lang="ts">
	import Asset from './Asset.svelte';
	let {
		name,
		assetPath,
		unavailable,
		detail = null,
		side = null
	}: {
		name: string | null;
		assetPath: string | null;
		unavailable: string;
		detail?: string | null;
		side?: 'attack' | 'defense' | null;
	} = $props();
</script>

<div class="identity" data-side={side ?? 'neutral'}>
	<Asset path={assetPath} label={name ?? unavailable} />
	<div>
		<strong>{name ?? unavailable}</strong>{#if detail}<small>{detail}</small>{/if}
		{#if side}<small>{side === 'attack' ? 'Attacker' : 'Defender'}</small>{/if}
	</div>
</div>

<style>
	.identity {
		display: flex;
		align-items: center;
		gap: 12px;
		border-inline-start: 4px solid var(--side-color, #888);
		padding: 8px;
	}
	.identity[data-side='attack'] {
		--side-color: #248bff;
	}
	.identity[data-side='defense'] {
		--side-color: #ff4655;
	}
	small {
		display: block;
	}
</style>
