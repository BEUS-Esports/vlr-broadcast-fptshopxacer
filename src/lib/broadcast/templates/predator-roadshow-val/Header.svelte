<script lang="ts">
	import predator from './assets/logo-predator.webp';
	import fptShop from './assets/logo-fptshop.webp';
	import roadshow from './assets/logo-roadshow.webp';

	let { title, logos = true }: { title?: string; logos?: boolean } = $props();
</script>

<header class="rs-header">
	{#if logos}<img class="predator" src={predator} alt="Predator" />{/if}
	{#if title}
		<h1 class="title">{title}</h1>
	{:else}
		<img class="lockup" src={roadshow} alt="Roadshow" />
	{/if}
	{#if logos}<img class="fpt" src={fptShop} alt="FPT Shop" />{/if}
</header>

<style>
	.rs-header {
		position: absolute;
		inset: 0 0 auto;
		height: 200px;
		pointer-events: none;
	}
	img {
		position: absolute;
		display: block;
	}
	.predator {
		left: 68px;
		top: 70px;
		width: 270px;
	}
	.fpt {
		right: 46px;
		top: 54px;
		width: 296px;
	}
	.lockup {
		left: 50%;
		top: 46px;
		width: 600px;
		transform: translateX(-50%);
		animation: rs-drop 0.35s ease-out both;
	}
	.title {
		position: absolute;
		left: 50%;
		top: 40px;
		margin: 0;
		transform: translateX(-50%);
		white-space: nowrap;
		font: italic 900 128px/1 var(--rs-font);
		letter-spacing: 0.02em;
		background: linear-gradient(180deg, var(--rs-title-from), var(--rs-title-to));
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 18px #2bf0b866);
		animation: rs-drop 0.35s ease-out both;
	}
	@keyframes rs-drop {
		from {
			opacity: 0;
			translate: 0 -16px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.lockup,
		.title {
			animation: none;
		}
	}
</style>
