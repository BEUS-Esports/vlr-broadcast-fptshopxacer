<script lang="ts">
	import { onMount } from 'svelte';
	import { createBroadcastClient } from './client';
	import type { GraphicId } from './controls';
	import { resolveGraphicTemplate } from './templates';

	let { graphic }: { graphic: GraphicId } = $props();
	const client = createBroadcastClient();
	let broadcast = $state.raw(client.getState());
	const snapshot = $derived(broadcast.snapshot);
	const template = $derived(resolveGraphicTemplate(snapshot?.tournament?.slug));
	const Template = $derived(template.component);

	onMount(() => {
		const unsubscribe = client.subscribe((next) => (broadcast = next));
		client.connect();
		return () => {
			unsubscribe();
			client.disconnect();
		};
	});
</script>

<div
	data-graphic={graphic}
	data-template={template.id}
	data-game-id={snapshot?.selection?.gameId ?? ''}
	data-revision={snapshot?.revision ?? 0}
>
	{#if snapshot && snapshot.controls.visibility[graphic]}
		<Template {snapshot} {graphic} />
	{/if}
</div>
