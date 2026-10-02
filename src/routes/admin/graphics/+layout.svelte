<script lang="ts">
	import DraftGuard from '#lib/components/admin/management/DraftGuard.svelte';
	import GraphicsWorkspace from '#lib/components/admin/graphics/GraphicsWorkspace.svelte';
	import type { LayoutProps } from './$types';
	let { data, children }: LayoutProps = $props();
</script>

<DraftGuard><GraphicsWorkspace {data}>{@render children()}</GraphicsWorkspace></DraftGuard>
