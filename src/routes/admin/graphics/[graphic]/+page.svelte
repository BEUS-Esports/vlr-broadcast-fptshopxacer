<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { createLiveClient } from '#lib/live/client.ts';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';
	import { graphicLabels } from '#lib/broadcast/controls.ts';
	import GraphicControls from '#lib/components/admin/graphics/GraphicControls.svelte';
	import GraphicEditors from '#lib/components/admin/graphics/GraphicEditors.svelte';
	import GraphicPreview from '#lib/components/admin/graphics/GraphicPreview.svelte';
	import type { GraphicsContext } from '#lib/components/admin/graphics/GraphicsWorkspace.svelte';
	import type { PageProps } from './$types';
	import ProviderControls from '#lib/components/admin/live/ProviderControls.svelte';
	import InGameMatchControls from '#lib/components/admin/graphics/InGameMatchControls.svelte';
	let { data }: PageProps = $props();
	const workspace = getContext<GraphicsContext>('graphics-control');
	let telemetry = $state.raw<LiveGameEnvelope | null>(null);
	onMount(() => {
		const client = createLiveClient();
		const stop = client.subscribe((value) => (telemetry = value));
		client.connect();
		return () => {
			stop();
			client.disconnect();
		};
	});
</script>

<svelte:head><title>{graphicLabels[data.graphic]} | Graphics Control</title></svelte:head>
<header class="space-y-2">
	<h1 class="h1">{graphicLabels[data.graphic]}</h1>
	<p>Save preparation, inspect Preview, and Show the saved version on program.</p>
</header>
<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
	<div class="min-w-0 space-y-5">
		{#if data.graphic === 'in-game' || data.graphic === 'agent-select'}
			<ProviderControls snapshot={workspace.live} {telemetry} />
		{/if}
		{#key data.graphic}
			<GraphicControls graphic={data.graphic} live={workspace.live} />
			{#if data.graphic === 'in-game'}
				<InGameMatchControls live={workspace.live} clock={workspace.clock} />
			{/if}
			<GraphicEditors graphic={data.graphic} management={workspace.management} />
		{/key}
	</div>
	<div
		class={['min-w-0 space-y-5', data.graphic !== 'in-game' && 'xl:sticky xl:top-0']}
		data-hud-previews
	>
		<GraphicPreview
			graphic={data.graphic}
			snapshot={workspace.live}
			connection={workspace.connection}
			clock={workspace.clock}
			{telemetry}
		/>
		{#if data.graphic === 'in-game'}
			<GraphicPreview
				graphic={data.graphic}
				snapshot={workspace.live}
				connection={workspace.connection}
				clock={workspace.clock}
				{telemetry}
				variant="live-data"
			/>
		{/if}
	</div>
</div>
