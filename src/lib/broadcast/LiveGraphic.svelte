<script lang="ts">
	import { onMount } from 'svelte';
	import { createBroadcastClient } from './client';
	import type { GraphicId } from './controls';
	import GraphicRenderer from './GraphicRenderer.svelte';
	import { createLiveClient } from '#lib/live/client.ts';
	import { liveResources } from '#lib/live/resources.svelte.ts';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';

	let { graphic }: { graphic: GraphicId } = $props();
	const client = createBroadcastClient();
	let broadcast = $state.raw(client.getState());
	let telemetry = $state.raw<LiveGameEnvelope | null>(null);
	const snapshot = $derived(broadcast.snapshot);

	onMount(() => {
		const liveClient = createLiveClient();
		const stopLive = liveClient.subscribe((value) => (telemetry = value));
		liveClient.connect();
		const unsubscribe = client.subscribe((next) => (broadcast = next));
		client.connect();
		return () => {
			unsubscribe();
			client.disconnect();
			stopLive();
			liveClient.disconnect();
		};
	});
</script>

<div
	data-live-graphic={graphic}
	data-game-id={snapshot?.selection?.gameId ?? ''}
	data-control-revision={snapshot?.controlRevision ?? 0}
	data-data-revision={snapshot?.dataRevision ?? 0}
	data-stream-epoch={broadcast.cursor?.epoch ?? ''}
	data-stream-sequence={broadcast.cursor?.sequence ?? 0}
>
	<GraphicRenderer
		{snapshot}
		{graphic}
		{telemetry}
		resources={liveResources.current}
		clock={broadcast.clock}
	/>
</div>
