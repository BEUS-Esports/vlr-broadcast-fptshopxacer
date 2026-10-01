<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
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
	data-control-revision={snapshot?.controlRevision ?? 0}
	data-data-revision={snapshot?.dataRevision ?? 0}
	data-stream-epoch={broadcast.cursor?.epoch ?? ''}
	data-stream-sequence={broadcast.cursor?.sequence ?? 0}
>
	{#if snapshot && snapshot.controls.visibility[graphic]}
		<div transition:fade={{ duration: prefersReducedMotion.current ? 0 : 150 }}>
			<Template {snapshot} {graphic} />
		</div>
	{/if}
</div>
