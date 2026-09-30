<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { setContext, type Snippet } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	let { tabs, children }: { tabs: Array<{ value: string; label: string }>; children: Snippet } =
		$props();
	const drafts = new SvelteMap<symbol, boolean>();
	setContext('management-drafts', drafts);
	const dirty = $derived([...drafts.values()].some(Boolean));
	const url = $derived(page.url);
	const tab = $derived(
		tabs.find((item) => item.value === url.searchParams.get('tab'))?.value ?? tabs[0].value
	);
	beforeNavigate(({ to, cancel }) => {
		if (
			dirty &&
			to?.url.pathname !== page.url.pathname &&
			!window.confirm('Leave this workspace and discard unsaved changes?')
		)
			cancel();
	});
	function selectTab(value: string | null) {
		if (!value || value === tab) return;
		const target = new URL(url.href);
		target.searchParams.set('tab', value);
		void goto(target, { reset: false });
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>
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
