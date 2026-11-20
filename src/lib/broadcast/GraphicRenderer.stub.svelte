<script lang="ts" module>
	// Test hook: lets a test decide what the stub template's `stop` does, and see `play` calls and the
	// order of mount/play/stop events (as `<event>:<graphic>`).
	export const hooks: { stop: () => Promise<void>; plays: number; events: string[] } = {
		stop: async () => {},
		plays: 0,
		events: []
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphicTemplateProps } from './templates';

	let { graphic }: GraphicTemplateProps = $props();

	onMount(() => void hooks.events.push(`mount:${graphic}`));

	export function play() {
		hooks.plays++;
		hooks.events.push(`play:${graphic}`);
		return Promise.resolve();
	}

	export function stop() {
		hooks.events.push(`stop:${graphic}`);
		return hooks.stop();
	}
</script>

<p data-stub={graphic}>stub</p>
