<script lang="ts">
	import { tick } from 'svelte';
	import type { GraphicId, ProgramOutput } from './controls';
	import type { BroadcastSnapshot } from './types';
	import type { BroadcastClock } from './client';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';
	import type { LiveResources } from '#lib/live/selectors.ts';
	import GraphicRenderer from './GraphicRenderer.svelte';
	import { programSnapshot } from './selectors';
	import { createLayerSequencer, type LayerTarget } from './sequencer';
	import type StingerPlayer from './StingerPlayer.svelte';

	let {
		snapshot,
		candidates,
		output,
		telemetry = null,
		resources = null,
		clock = null,
		stinger = null
	}: {
		snapshot: BroadcastSnapshot | null;
		candidates: readonly GraphicId[];
		output: ProgramOutput;
		telemetry?: LiveGameEnvelope | null;
		resources?: LiveResources | null;
		clock?: BroadcastClock | null;
		/** Only passed for the composite fullscreen layer. */
		stinger?: StingerPlayer | null;
	} = $props();

	const target = $derived.by(() => {
		if (!snapshot) return null;
		for (const graphic of candidates) {
			const capture = programSnapshot(snapshot, graphic, output);
			if (capture) return { graphic, revision: capture.controlRevision };
		}
		return null;
	});

	// The graphic on screen. Its snapshot follows the latest one only while it is still the target, so a
	// leaving graphic stays frozen at its last visible data until its stop() resolves.
	let mounted = $state.raw<{ graphic: GraphicId; snapshot: BroadcastSnapshot } | null>(null);
	let renderer = $state<GraphicRenderer>();

	$effect(() => {
		if (snapshot && mounted && mounted.graphic === target?.graphic && mounted.snapshot !== snapshot)
			mounted = { graphic: mounted.graphic, snapshot };
	});

	// The first snapshot this page sees mounts as-is, without a stinger.
	let firstSnapshot: BroadcastSnapshot | null = null;

	const sequencer = createLayerSequencer({
		async enter({ graphic }) {
			if (!snapshot) return;
			mounted = { graphic, snapshot };
			// Nothing else may be awaited before play(): the program wrapper is hidden until it runs.
			await tick();
			await renderer?.play();
		},
		async exit() {
			// stop() must settle before unmounting, or a destroyed template's stop would be called.
			await renderer?.stop();
			mounted = null;
		},
		async refresh() {
			if (snapshot) await renderer?.update(snapshot);
		},
		async transition(from: LayerTarget | null, to: LayerTarget | null) {
			const player = stinger;
			if (!player || !snapshot?.stinger || snapshot === firstSnapshot) return false;
			if (from) await renderer?.stop();
			// The null tick forces a fresh GraphicRenderer (its program wrapper starts hidden). Nothing may be
			// awaited between the second tick and play().
			const cut = async () => {
				mounted = null;
				await tick();
				if (to && snapshot) {
					mounted = { graphic: to.graphic, snapshot };
					await tick();
					await renderer?.play();
				}
			};
			if (!(await player.run(cut))) await cut();
			return true;
		}
	});

	$effect(() => {
		if (snapshot && !firstSnapshot) firstSnapshot = snapshot;
		sequencer.set(target);
	});
</script>

{#if mounted}
	<GraphicRenderer
		bind:this={renderer}
		snapshot={mounted.snapshot}
		graphic={mounted.graphic}
		{output}
		{telemetry}
		{resources}
		{clock}
	/>
{/if}
