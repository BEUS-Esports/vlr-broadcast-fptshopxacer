<script lang="ts" module>
	// Test hook: lets a test decide what the stub template's `stop` does.
	export const hooks: { stop: () => Promise<void> } = { stop: async () => {} };
</script>

<script lang="ts">
	import type { GraphicTemplateProps } from './templates';

	let { graphic }: GraphicTemplateProps = $props();

	export function stop() {
		return hooks.stop();
	}
</script>

<p data-stub={graphic}>stub</p>
