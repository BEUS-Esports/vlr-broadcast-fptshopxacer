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
		void goto(target, { reset: false });
	}
</script>

<DraftGuard>
	<noscript>
		<nav aria-label="Workspace sections" class="flex flex-wrap gap-4">
			{#each tabs as item (item.value)}<a class="underline" href={`?tab=${item.value}`}
					>{item.label}</a
				>{/each}
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
