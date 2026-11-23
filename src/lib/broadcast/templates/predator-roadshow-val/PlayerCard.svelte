<script lang="ts">
	import back from './assets/card-back.webp';
	import front from './assets/card-front.webp';
	import Asset from '../../primitives/Asset.svelte';

	let {
		name,
		tag,
		portraitPath,
		iconPath = null,
		size = 'lineup'
	}: {
		name: string | null;
		tag: string | null;
		portraitPath: string | null;
		iconPath?: string | null;
		size?: 'lineup' | 'compact' | 'feature';
	} = $props();
	const label = $derived(name ? (tag ? `${tag} ${name}` : name) : 'TBD');
</script>

<figure class="card {size}">
	<img class="layer" src={back} alt="" />
	<span class="portrait"><Asset path={portraitPath} label={name ?? 'Player'} blankMissing /></span>
	<img class="layer" src={front} alt="" />
	<figcaption><span data-fit="players">{label}</span></figcaption>
</figure>

<style>
	.card {
		position: relative;
		margin: 0;
		width: 100%;
		aspect-ratio: 486 / 816;
		--card-font: 34px;
	}
	.compact {
		--card-font: 22px;
	}
	.feature {
		--card-font: 52px;
	}
	.layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.portrait {
		position: absolute;
		inset: 7% 4% 15% 4%;
		overflow: hidden;
		--asset-width: 100%;
		--asset-height: 100%;
	}
	.portrait :global(img) {
		object-fit: cover;
		object-position: top center;
	}
	.icon {
		position: absolute;
		left: 50%;
		top: 70%;
		width: 20%;
		aspect-ratio: 1;
		translate: -50% -50%;
		--asset-width: 100%;
		--asset-height: 100%;
		filter: brightness(0) saturate(100%) opacity(0.82);
	}
	figcaption {
		position: absolute;
		left: 4%;
		right: 4%;
		top: 85%;
		height: 14.7%;
		display: grid;
		place-items: center;
	}
	figcaption span {
		display: block;
		width: 100%;
		overflow: hidden;
		white-space: nowrap;
		text-align: center;
		color: var(--rs-ink-dark);
		font: 900 calc(var(--card-font) * var(--fit-players, 1)) / 1.15 var(--rs-font);
		text-transform: uppercase;
	}
</style>
