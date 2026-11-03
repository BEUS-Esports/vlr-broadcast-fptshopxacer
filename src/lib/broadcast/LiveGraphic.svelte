<script lang="ts">
	import type { GraphicId } from './controls';
	import LiveOutput from './LiveOutput.svelte';
	let { graphic }: { graphic: GraphicId } = $props();
</script>

<LiveOutput graphics={[graphic]} />
