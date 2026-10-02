<script lang="ts">
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { GraphicId } from './controls';
	import type { BroadcastSnapshot } from './types';
	import { programSnapshot } from './selectors';
	import { resolveGraphicTemplate } from './templates';

	let {
		snapshot,
		graphic,
		mode = 'program'
	}: {
		snapshot: BroadcastSnapshot | null;
		graphic: GraphicId;
		mode?: 'program' | 'preview';
	} = $props();
	const rendered = $derived(
		snapshot && (mode === 'preview' ? snapshot : programSnapshot(snapshot, graphic))
	);
	const template = $derived(resolveGraphicTemplate(rendered?.tournament?.slug));
	const Template = $derived(template.component);
</script>

<div
	data-graphic={graphic}
	data-render-mode={mode}
	data-template={template.id}
	data-game-id={rendered?.selection?.gameId ?? ''}
	data-control-revision={rendered?.controlRevision ?? 0}
	data-data-revision={rendered?.dataRevision ?? 0}
>
	{#if rendered}
		<div transition:fade={{ duration: prefersReducedMotion.current ? 0 : 150 }}>
			<Template snapshot={rendered} {graphic} />
		</div>
	{/if}
</div>
