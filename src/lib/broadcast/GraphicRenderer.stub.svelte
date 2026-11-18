<script lang="ts" module>
	// Test hook: lets a test decide what the stub template's `stop` does and see `play` calls.
	export const hooks: { stop: () => Promise<void>; plays: number } = {
		stop: async () => {},
		plays: 0
	};
</script>

<script lang="ts">
	import type { GraphicTemplateProps } from './templates';

	let { graphic }: GraphicTemplateProps = $props();

	export function play() {
		hooks.plays++;
		return Promise.resolve();
	}

	export function stop() {
		return hooks.stop();
	}
</script>

<p data-stub={graphic}>stub</p>
