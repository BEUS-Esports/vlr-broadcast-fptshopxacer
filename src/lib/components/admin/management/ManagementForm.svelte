<script lang="ts" generics="T extends Record<string, unknown>">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { getContext, onDestroy, onMount, untrack, type Snippet } from 'svelte';
	import type { SvelteMap } from 'svelte/reactivity';
	let {
		action,
		initial,
		confirmMessage,
		children
	}: {
		action: string;
		initial: T;
		confirmMessage?: string;
		children: Snippet<[T, boolean, Record<string, unknown> | null]>;
	} = $props();
	let draft = $state<T>(untrack(() => JSON.parse(JSON.stringify(initial))));
	let baseline = $state(untrack(() => JSON.stringify(initial)));
	let pending = $state(false);
	let message = $state('');
	let failed = $state(false);
	let feedback = $state<Record<string, unknown> | null>(null);
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	const dirty = $derived(JSON.stringify(draft) !== baseline);
	const drafts = getContext<SvelteMap<symbol, boolean> | undefined>('management-drafts');
	const id = Symbol();
	$effect(() => {
		drafts?.set(id, dirty);
	});
	onDestroy(() => drafts?.delete(id));
	// Only clean sections follow a refreshed load. Dirty sections keep their original revision.
	$effect(() => {
		const saved = JSON.stringify(initial);
		if (untrack(() => !dirty && !pending))
			untrack(() => {
				draft = JSON.parse(saved);
				baseline = saved;
			});
	});
	function resetToSaved() {
		baseline = JSON.stringify(initial);
		draft = JSON.parse(baseline);
	}
</script>

<form
	method="POST"
	{action}
	class="space-y-4"
	use:enhance={({ formData, cancel }) => {
		if (pending || (confirmMessage && !window.confirm(confirmMessage))) {
			cancel();
			return;
		}
		formData.set('payload', JSON.stringify(draft));
		pending = true;
		message = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' || result.type === 'redirect') {
					baseline = JSON.stringify(draft);
					await update({ reset: false, navigate: false });
					resetToSaved();
					message = 'Saved.';
					failed = false;
					feedback = null;
				} else {
					failed = true;
					feedback = result.type === 'failure' ? (result.data ?? null) : null;
					message =
						result.type === 'failure' && typeof result.data?.error === 'string'
							? result.data.error
							: 'Could not save. Your draft is still here. Reload and review before retrying.';
				}
			} finally {
				pending = false;
			}
		};
	}}
>
	<input type="hidden" name="payload" value={JSON.stringify(draft)} />
	<noscript><p>Enable JavaScript to edit management records.</p></noscript>
	<fieldset disabled={pending || !hydrated} class="min-w-0 space-y-4">
		{@render children(draft, pending, feedback)}
	</fieldset>
	{#if pending}<p role="status">Saving…</p>{/if}
	{#if message}<p
			role={failed ? 'alert' : 'status'}
			class={failed ? 'text-error-600-400' : 'text-success-600-400'}
		>
			{message}
		</p>{/if}
	{#if failed}
		<button
			type="button"
			class="btn preset-tonal-surface"
			onclick={async () => {
				if (!window.confirm('Discard this section’s draft and load the latest saved values?'))
					return;
				await invalidateAll();
				resetToSaved();
				message = '';
				failed = false;
				feedback = null;
			}}>Reload this section</button
		>
	{/if}
</form>
