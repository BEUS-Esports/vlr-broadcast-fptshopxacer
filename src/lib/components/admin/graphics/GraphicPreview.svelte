<script lang="ts">
	import { Monitor } from '@lucide/svelte';
	import GraphicRenderer from '#lib/broadcast/GraphicRenderer.svelte';
	import { graphicLabels, type GraphicId } from '#lib/broadcast/controls.ts';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
	import type { BroadcastClock } from '#lib/broadcast/client.ts';
	import { onMount } from 'svelte';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';
	import type { LiveResources } from '#lib/live/selectors.ts';
	import { fetchLiveResources } from '#lib/live/resources.ts';
	let {
		graphic,
		snapshot,
		connection,
		telemetry = null,
		variant = 'normal',
		clock = null
	}: {
		graphic: GraphicId;
		snapshot: BroadcastSnapshot;
		connection: string;
		telemetry?: LiveGameEnvelope | null;
		variant?: 'normal' | 'live-data';
		clock?: BroadcastClock | null;
	} = $props();
	const title = $derived(variant === 'live-data' ? 'Preview Live Data HUD' : 'Preview');
	const largeTitle = $derived(
		`Large Preview · ${variant === 'live-data' ? 'Live Data HUD' : graphicLabels[graphic]}`
	);
	const renderMode = $derived(variant === 'live-data' ? 'preview-live' : 'preview');
	let resources = $state.raw<LiveResources | null>(null);
	onMount(() => {
		void fetchLiveResources().then((value) => (resources = value));
	});
	let width = $state(0);
	let largeWidth = $state(0);
	let modal = $state<HTMLDialogElement>();
</script>

{#snippet canvasContent(canvasWidth: number)}
	<div class="composition" style:transform={`scale(${canvasWidth / 1920})`}>
		<GraphicRenderer {graphic} {snapshot} {telemetry} {resources} {clock} mode={renderMode} />
	</div>
{/snippet}

<section aria-label={title} class="admin-editor space-y-3">
	<header class="flex items-center justify-between gap-3">
		<h2 class="h3">{title}</h2>
		<button
			type="button"
			class="btn preset-tonal-primary btn-sm"
			onclick={() => modal?.showModal()}
		>
			<Monitor size={18} aria-hidden="true" /> Large Preview
		</button>
	</header>
	{#if variant === 'live-data'}
		<p class="text-sm">
			HUD template · {telemetry?.status.health ?? 'disconnected'}. Available data fills in
			automatically. Confirm mapping and enable external HUD to use it on program.
		</p>
	{:else}
		<p class="text-sm">
			Latest saved data · {connection}. Unsaved editor fields appear after Save.
		</p>
	{/if}
	<div class="preview-canvas" bind:clientWidth={width}>
		{@render canvasContent(width)}
	</div>
	<p class="text-sm">
		1920×1080 · {variant === 'live-data'
			? 'Preview does not change program output.'
			: 'Preview stays visible when program is hidden.'}
	</p>
</section>

<dialog
	{@attach (element) => {
		modal = element;
	}}
	aria-label={largeTitle}
>
	<header class="mb-3 flex items-center justify-between gap-3">
		<h2 class="h3">{largeTitle}</h2>
		<button type="button" class="btn preset-tonal-surface" onclick={() => modal?.close()}
			>Close Preview</button
		>
	</header>
	<div class="preview-canvas" bind:clientWidth={largeWidth}>
		{@render canvasContent(largeWidth)}
	</div>
</dialog>

<style>
	.preview-canvas {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background: repeating-conic-gradient(#202838 0% 25%, #151c29 0% 50%) 0 / 20px 20px;
	}
	.composition {
		position: absolute;
		inset: 0 auto auto 0;
		width: 1920px;
		height: 1080px;
		transform-origin: top left;
	}
	dialog {
		width: min(94vw, calc((90dvh - 5rem) * 16 / 9));
		max-width: none;
		max-height: 94dvh;
		padding: 1rem;
		border: 1px solid var(--color-surface-500);
		border-radius: var(--radius-base);
		background: var(--color-surface-950);
		color: var(--color-surface-50);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 75%);
	}
</style>
