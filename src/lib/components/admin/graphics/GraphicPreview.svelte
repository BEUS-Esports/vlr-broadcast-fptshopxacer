<script lang="ts">
	import { Monitor } from '@lucide/svelte';
	import GraphicRenderer from '#lib/broadcast/GraphicRenderer.svelte';
	import { graphicLabels, type GraphicId } from '#lib/broadcast/controls.ts';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
	import { onMount } from 'svelte';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';
	import type { LiveResources } from '#lib/live/selectors.ts';
	import { fetchLiveResources } from '#lib/live/resources.ts';
	let {
		graphic,
		snapshot,
		connection,
		telemetry = null
	}: {
		graphic: GraphicId;
		snapshot: BroadcastSnapshot;
		connection: string;
		telemetry?: LiveGameEnvelope | null;
	} = $props();
	let resources = $state.raw<LiveResources | null>(null);
	onMount(() => {
		void fetchLiveResources().then((value) => (resources = value));
	});
	let width = $state(0);
	let largeWidth = $state(0);
	let modal = $state<HTMLDialogElement>();
</script>

<section aria-label="Preview" class="admin-editor space-y-3 xl:sticky xl:top-0">
	<header class="flex items-center justify-between gap-3">
		<h2 class="h3">Preview</h2>
		<button
			type="button"
			class="btn preset-tonal-primary btn-sm"
			onclick={() => modal?.showModal()}
		>
			<Monitor size={18} aria-hidden="true" /> Large Preview
		</button>
	</header>
	<p class="text-sm">Latest saved data · {connection}. Unsaved editor fields appear after Save.</p>
	<div class="preview-canvas" bind:clientWidth={width}>
		<div class="composition" style:transform={`scale(${width / 1920})`}>
			<GraphicRenderer {graphic} {snapshot} {telemetry} {resources} mode="preview" />
		</div>
	</div>
	<p class="text-sm">1920×1080 · Preview stays visible when program is hidden.</p>
</section>

<dialog
	{@attach (element) => {
		modal = element;
	}}
	aria-label={`Large Preview · ${graphicLabels[graphic]}`}
>
	<header class="mb-3 flex items-center justify-between gap-3">
		<h2 class="h3">Large Preview · {graphicLabels[graphic]}</h2>
		<button type="button" class="btn preset-tonal-surface" onclick={() => modal?.close()}
			>Close Preview</button
		>
	</header>
	<div class="preview-canvas" bind:clientWidth={largeWidth}>
		<div class="composition" style:transform={`scale(${largeWidth / 1920})`}>
			<GraphicRenderer {graphic} {snapshot} {telemetry} {resources} mode="preview" />
		</div>
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
