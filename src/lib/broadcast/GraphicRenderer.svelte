<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import type { GraphicId, ProgramOutput } from './controls';
	import type { BroadcastSnapshot } from './types';
	import type { BroadcastClock } from './client';
	import { programSnapshot } from './selectors';
	import {
		resolveGraphicTemplate,
		TEMPLATE_ACTION_TIMEOUT_MS,
		type TemplateControls
	} from './templates';
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
		output = 'standalone',
		telemetry = null,
		resources = null,
		clock = null
	}: {
		snapshot: BroadcastSnapshot | null;
		graphic: GraphicId;
		mode?: 'program' | 'preview' | 'preview-live';
		output?: ProgramOutput;
		telemetry?: LiveGameEnvelope | null;
		resources?: LiveResources | null;
		clock?: BroadcastClock | null;
	} = $props();
	const rendered = $derived(
		snapshot && (mode === 'program' ? programSnapshot(snapshot, graphic, output) : snapshot)
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

	let layer = $state<HTMLDivElement>();
	// Null while the In-Game HUD (not a template) is shown, so the HUD always uses the fallback.
	let instance = $state<object | null>(null);
	// shortcut: svelte-check types a dynamic component's bind:this as an opaque SvelteComponent, hence the cast.
	const controls = $derived(instance as TemplateControls | null);

	function fade(from: number, to: number) {
		return layer
			?.animate([{ opacity: from }, { opacity: to }], {
				duration: prefersReducedMotion.current ? 0 : 150,
				fill: 'forwards'
			})
			.finished.then(
				() => {},
				() => {}
			);
	}

	// Races a template call against the timeout: a hung or throwing template is cut, never awaited forever.
	async function run(action: () => Promise<void> | undefined) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				action(),
				new Promise<void>((resolve) => {
					timer = setTimeout(() => {
						console.warn(`Graphic template action timed out after ${TEMPLATE_ACTION_TIMEOUT_MS}ms`);
						resolve();
					}, TEMPLATE_ACTION_TIMEOUT_MS);
				})
			]);
		} catch (error) {
			console.warn('Graphic template action failed', error);
		} finally {
			clearTimeout(timer);
		}
	}

	// Program output starts hidden (opacity 0) so nothing paints before play(): callers must call play() in
	// the same task as the mount (await tick(), then play(), nothing else awaited in between). A template that
	// exports play() owns its first paint and must show nothing until play() runs.
	export function play() {
		return run(() => {
			if (!controls?.play) return fade(0, 1);
			if (layer) layer.style.opacity = '';
			return controls.play();
		});
	}

	export function stop() {
		return run(() => (controls?.stop ? controls.stop() : fade(1, 0)));
	}

	// The `snapshot` prop already holds the new data here; a template only animates the change.
	export function update(next: BroadcastSnapshot) {
		return run(() => controls?.update?.(next));
	}
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
		<div bind:this={layer} style:opacity={mode === 'program' ? 0 : undefined}>
			{#if (liveGame && telemetry) || (mode === 'preview-live' && graphic === 'in-game')}
				<InGameHud
					snapshot={presented}
					live={liveGame}
					status={telemetry?.status ?? null}
					{resources}
					identity={liveIdentity}
				/>
			{:else if mode !== 'preview-live'}
				<Template bind:this={instance} snapshot={agentSnapshot ?? presented} {graphic} />
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
	{#if presented && graphic === 'in-game'}<CenterMatchBanner
			snapshot={presented}
			{clock}
			exitMs={template.bannerExitMs}
		/>{/if}
</div>
