<script lang="ts">
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { GraphicId } from './controls';
	import type { BroadcastSnapshot } from './types';
	import type { BroadcastClock } from './client';
	import { programSnapshot } from './selectors';
	import { resolveGraphicTemplate } from './templates';
	import { filterSponsor } from './sponsor';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';
	import {
		externalGame,
		mappedGame,
		withObservedAgents,
		type LiveResources
	} from '#lib/live/selectors.ts';
	import InGameHud from './live/InGameHud.svelte';
	import ProviderAttribution from './live/ProviderAttribution.svelte';
	import CenterMatchBanner from './in-game/CenterMatchBanner.svelte';

	let {
		snapshot,
		graphic,
		mode = 'program',
		telemetry = null,
		resources = null,
		clock = null
	}: {
		snapshot: BroadcastSnapshot | null;
		graphic: GraphicId;
		mode?: 'program' | 'preview' | 'preview-live';
		telemetry?: LiveGameEnvelope | null;
		resources?: LiveResources | null;
		clock?: BroadcastClock | null;
	} = $props();
	const rendered = $derived(
		snapshot && (mode === 'program' ? programSnapshot(snapshot, graphic) : snapshot)
	);
	const template = $derived(resolveGraphicTemplate(rendered?.tournament?.slug));
	const Template = $derived(template.component);
	const presented = $derived(
		rendered && { ...rendered, sponsor: filterSponsor(rendered.sponsor, template.sponsor) }
	);
	const liveGame = $derived(
		rendered && graphic === 'in-game' && mode !== 'preview'
			? externalGame(rendered, telemetry, mode === 'preview-live' ? 'preview' : 'program')
			: null
	);
	const liveIdentity = $derived(
		mode === 'preview-live' &&
			liveGame &&
			rendered &&
			(!mappedGame(rendered, telemetry) ||
				liveGame?.teams.some((team) => team.players.some((player) => !player.playerId)))
			? 'provider'
			: 'local'
	);
	const agentSnapshot = $derived(
		presented && graphic === 'agent-select'
			? withObservedAgents(presented, telemetry, resources)
			: presented
	);
	const reportScope = $derived(
		graphic === 'post-game'
			? 'game'
			: graphic === 'mvp'
				? rendered?.controls.mvpScope
				: graphic === 'player-stats'
					? rendered?.controls.playerStats.scope
					: null
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
	{#if rendered && presented}
		<div transition:fade={{ duration: prefersReducedMotion.current ? 0 : 150 }}>
			{#if (liveGame && telemetry) || (mode === 'preview-live' && graphic === 'in-game')}
				<InGameHud
					snapshot={presented}
					live={liveGame}
					status={telemetry?.status ?? null}
					{resources}
					identity={liveIdentity}
				/>
			{:else if mode !== 'preview-live'}
				<Template snapshot={agentSnapshot ?? presented} {graphic} />
				{#if reportScope && rendered.scopes[reportScope].usesSpectra}
					<ProviderAttribution
						status={{
							provider: 'spectra',
							attribution: telemetry?.status.spectraAttribution ?? 'unknown'
						}}
					/>
				{/if}
				{#if graphic === 'agent-select' && agentSnapshot !== presented && telemetry}<ProviderAttribution
						status={telemetry.status}
					/>{/if}
			{/if}
		</div>
	{/if}
	{#if presented && graphic === 'in-game'}<CenterMatchBanner snapshot={presented} {clock} />{/if}
</div>
