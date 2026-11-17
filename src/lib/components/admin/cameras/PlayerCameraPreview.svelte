<script lang="ts">
	import type { Snippet } from 'svelte';
	import { VDO_NINJA_ORIGIN } from '#lib/cameras/vdo-ninja.ts';

	let {
		src,
		title,
		connected = $bindable(false),
		actions
	}: {
		src: string | null;
		title: string;
		connected?: boolean;
		actions?: Snippet;
	} = $props();

	let frame = $state<HTMLIFrameElement>();

	// A new link is a new connection; wait for the iframe to report again.
	$effect.pre(() => {
		void src;
		connected = false;
	});

	function onmessage(event: MessageEvent) {
		if (!frame || event.source !== frame.contentWindow || event.origin !== VDO_NINJA_ORIGIN) return;
		const data = event.data as { action?: unknown; value?: unknown } | null;
		if (data?.action === 'view-connection') connected = data.value === true;
	}
</script>

<svelte:window {onmessage} />

<div class="aspect-video w-full overflow-hidden bg-surface-950">
	{#if src}
		<iframe bind:this={frame} {src} {title} allow="autoplay" class="h-full w-full border-0"
		></iframe>
	{/if}
</div>
<div class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
	<span class={connected ? 'text-success-600-400' : 'text-surface-600-400'}>
		<span aria-hidden="true">{connected ? '●' : '○'}</span>
		<span>{connected ? 'Connected' : 'Not connected'}</span>
	</span>
	{@render actions?.()}
</div>
