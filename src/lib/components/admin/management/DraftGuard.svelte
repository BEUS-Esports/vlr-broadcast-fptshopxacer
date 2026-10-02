<script module lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	export type DraftRegistry = SvelteMap<
		symbol,
		{ dirty: boolean; record: boolean; reset: () => void }
	>;
</script>

<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { setContext, type Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	const drafts: DraftRegistry = new SvelteMap();
	setContext('management-drafts', drafts);
	const dirty = $derived([...drafts.values()].some((form) => form.dirty));
	beforeNavigate(({ to, cancel }) => {
		if (
			dirty &&
			to?.url.pathname !== page.url.pathname &&
			!window.confirm('Leave this workspace and discard unsaved changes?')
		)
			cancel();
	});
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>
{@render children()}
