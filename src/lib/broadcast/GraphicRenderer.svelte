<script lang="ts">
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { GraphicId } from './controls';
	import type { BroadcastSnapshot } from './types';
	import { programSnapshot } from './selectors';
	import { resolveGraphicTemplate } from './templates';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';
	import { externalGame, withObservedAgents, type LiveResources } from '#lib/live/selectors.ts';
	import InGameHud from './live/InGameHud.svelte';
	import ProviderAttribution from './live/ProviderAttribution.svelte';

	let {
		snapshot,
		graphic,
		mode = 'program',
		telemetry = null,
		resources = null
	}: {
		snapshot: BroadcastSnapshot | null;
		graphic: GraphicId;
		mode?: 'program' | 'preview';
		telemetry?: LiveGameEnvelope | null;
		resources?: LiveResources | null;
	} = $props();
	const rendered = $derived(
		snapshot && (mode === 'preview' ? snapshot : programSnapshot(snapshot, graphic))
	);
	const template = $derived(resolveGraphicTemplate(rendered?.tournament?.slug));
	const Template = $derived(template.component);
	const liveGame = $derived(
		rendered && graphic === 'in-game' ? externalGame(rendered, telemetry) : null
	);
	const agentSnapshot = $derived(
		rendered && graphic === 'agent-select'
			? withObservedAgents(rendered, telemetry, resources)
			: rendered
	);
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
			{#if liveGame && telemetry}
				<InGameHud snapshot={rendered} live={liveGame} status={telemetry.status} {resources} />
			{:else}
				<Template snapshot={agentSnapshot ?? rendered} {graphic} />
				{#if graphic === 'agent-select' && agentSnapshot !== rendered && telemetry}<ProviderAttribution
						status={telemetry.status}
					/>{/if}
			{/if}
		</div>
	{/if}
</div>
