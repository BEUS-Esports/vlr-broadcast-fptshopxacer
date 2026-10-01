<script lang="ts">
	import LiveGraphic from '#lib/broadcast/LiveGraphic.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<LiveGraphic graphic={data.graphic} />
