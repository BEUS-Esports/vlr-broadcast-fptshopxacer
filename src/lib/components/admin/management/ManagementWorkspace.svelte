<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { type Snippet } from 'svelte';
	import DraftGuard from './DraftGuard.svelte';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	let { tabs, children }: { tabs: Array<{ value: string; label: string }>; children: Snippet } =
		$props();
	const url = $derived(page.url);
	const tab = $derived(
		tabs.find((item) => item.value === url.searchParams.get('tab'))?.value ?? tabs[0].value
	);
	function selectTab(value: string | null) {
		if (!value || value === tab) return;
		const target = new URL(url.href);
		target.searchParams.set('tab', value);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- The current page URL already includes the base path.
		void goto(target, { reset: false });
	}
</script>

<DraftGuard>
	<noscript>
		<nav aria-label="Workspace sections" class="flex flex-wrap gap-4">
			{#each tabs as item (item.value)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Query-only links retain the current page's resolved path. -->
				<a class="underline" href={`?tab=${item.value}`}>{item.label}</a>{/each}
		</nav>
	</noscript>
	<Tabs value={tab} onValueChange={({ value }) => selectTab(value)} class="space-y-5">
		<Tabs.List aria-label="Workspace sections" class="flex-wrap">
			{#each tabs as item (item.value)}
				<Tabs.Trigger value={item.value}>{item.label}</Tabs.Trigger>
			{/each}
			<Tabs.Indicator />
		</Tabs.List>
		{@render children()}
	</Tabs>
</DraftGuard>
