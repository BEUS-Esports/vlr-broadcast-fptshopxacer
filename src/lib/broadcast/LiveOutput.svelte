<script lang="ts">
	import { onMount } from 'svelte';
	import { graphicLayers, layerNumbers, type GraphicId, type ProgramOutput } from './controls';
	import { createBroadcastClient } from './client';
	import ProgramLayer from './ProgramLayer.svelte';
	import { createLiveClient } from '#lib/live/client.ts';
	import { liveResources } from '#lib/live/resources.svelte.ts';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';
	import { collectGraphicAssetUrls, createAssetPreloader } from './preload';

	let { graphics, output }: { graphics: readonly GraphicId[]; output: ProgramOutput } = $props();
	const layers = $derived(
		layerNumbers
			.map((number) => ({
				number,
				candidates: graphics.filter((graphic) => graphicLayers[graphic] === number)
			}))
			.filter(({ candidates }) => candidates.length)
	);
	const client = createBroadcastClient();
	let broadcast = $state.raw(client.getState());
	let telemetry = $state.raw<LiveGameEnvelope | null>(null);
	const snapshot = $derived(broadcast.snapshot);
	let preloader = $state<ReturnType<typeof createAssetPreloader> | null>(null);

	$effect(() => {
		const resources = liveResources.current;
		preloader?.update(
			snapshot
				? [
						...new Set(
							graphics.flatMap((graphic) =>
								collectGraphicAssetUrls(snapshot, graphic, resources, output)
							)
						)
					]
				: []
		);
	});

	onMount(() => {
		const assets = createAssetPreloader();
		preloader = assets;
		const liveClient = createLiveClient();
		const stopLive = liveClient.subscribe((value) => (telemetry = value));
		liveClient.connect();
		const unsubscribe = client.subscribe((next) => (broadcast = next));
		client.connect();
		return () => {
			assets.destroy();
			unsubscribe();
			client.disconnect();
			stopLive();
			liveClient.disconnect();
		};
	});
</script>

<div data-live-output={graphics.length > 1 ? 'composite' : graphics[0]}>
	{#each layers as { number, candidates } (number)}
		<div
			class="layer"
			style:z-index={number}
			data-live-layer={number}
			data-game-id={snapshot?.selection?.gameId ?? ''}
			data-control-revision={snapshot?.controlRevision ?? 0}
			data-data-revision={snapshot?.dataRevision ?? 0}
			data-stream-epoch={broadcast.cursor?.epoch ?? ''}
			data-stream-sequence={broadcast.cursor?.sequence ?? 0}
		>
			<ProgramLayer
				{snapshot}
				{candidates}
				{output}
				{telemetry}
				resources={liveResources.current}
				clock={broadcast.clock}
			/>
		</div>
	{/each}
</div>

<style>
	[data-live-output] {
		position: relative;
		width: 1920px;
		height: 1080px;
		background: transparent;
		isolation: isolate;
	}
	.layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
</style>
