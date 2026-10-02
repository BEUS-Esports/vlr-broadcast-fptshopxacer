<script lang="ts" generics="T extends Record<string, unknown>">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { getContext, onDestroy, onMount, untrack, type Snippet } from 'svelte';
	import type { DraftRegistry } from './DraftGuard.svelte';
	let {
		action,
		initial,
		confirmMessage,
		recordDraft = true,
		changesContext = false,
		children
	}: {
		action: string;
		initial: T;
		confirmMessage?: string;
		recordDraft?: boolean;
		changesContext?: boolean;
		children: Snippet<[T, boolean, Record<string, unknown> | null]>;
	} = $props();
	const formState = $state({
		draft: untrack(() => JSON.parse(JSON.stringify(initial)) as T),
		baseline: untrack(() => JSON.stringify(initial))
	});
	let pending = $state(false);
	let message = $state('');
	let failed = $state(false);
	let feedback = $state<Record<string, unknown> | null>(null);
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	const dirty = $derived(JSON.stringify(formState.draft) !== formState.baseline);
	const saved = $derived(JSON.stringify(initial));
	const drafts = getContext<DraftRegistry | undefined>('management-drafts');
	const id = Symbol();
	$effect.pre(() => {
		drafts?.set(id, { dirty, record: recordDraft, reset: resetToSaved });
	});
	onDestroy(() => drafts?.delete(id));
	// Only clean sections follow a refreshed load. Dirty sections keep their original revision.
	$effect.pre(() => {
		if (!dirty && !pending) {
			formState.draft = JSON.parse(saved);
			formState.baseline = saved;
		}
	});
	function resetToSaved() {
		formState.baseline = JSON.stringify(initial);
		formState.draft = JSON.parse(formState.baseline);
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
		if (changesContext) {
			const affected = [...(drafts?.entries() ?? [])].filter(
				([key, form]) => key !== id && form.record && form.dirty
			);
			if (
				affected.length &&
				!window.confirm('Discard unsaved preparation before changing the live game?')
			) {
				cancel();
				return;
			}
			for (const [, form] of affected) form.reset();
		}
		formData.set('payload', JSON.stringify(formState.draft));
		pending = true;
		message = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' || result.type === 'redirect') {
					formState.baseline = JSON.stringify(formState.draft);
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
	<input type="hidden" name="payload" value={JSON.stringify(formState.draft)} />
	<noscript><p>Enable JavaScript to edit management records.</p></noscript>
	<fieldset disabled={pending || !hydrated} class="min-w-0 space-y-4">
		{@render children(formState.draft, pending, feedback)}
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
