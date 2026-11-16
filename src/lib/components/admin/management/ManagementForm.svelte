<script lang="ts" generics="T extends Record<string, unknown>">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { getContext, onDestroy, onMount, tick, untrack, type Snippet } from 'svelte';
	import type { DraftRegistry } from './DraftGuard.svelte';
	import type { createBroadcastClient } from '#lib/broadcast/client.ts';
	type BroadcastClient = ReturnType<typeof createBroadcastClient>;
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
	// The last save got no answer from the server, so nothing in this section was saved.
	let unreachable = $state(false);
	const broadcastClient = getContext<BroadcastClient | undefined>('broadcast-client');
	onMount(() => {
		hydrated = true;
		let previous = broadcastClient?.getState().connection;
		return broadcastClient?.subscribe(({ connection }) => {
			if (connection === 'connected' && previous !== 'connected' && unreachable) {
				unreachable = false;
				failed = false;
				feedback = null;
				message = 'Connection restored. This section was not saved; save it again.';
			}
			previous = connection;
		});
	});
	const dirty = $derived(JSON.stringify(formState.draft) !== formState.baseline);
	const saved = $derived(JSON.stringify(initial));
	const drafts = getContext<DraftRegistry | undefined>('management-drafts');
	const id = Symbol();
	$effect.pre(() => {
		drafts?.set(id, { dirty, record: recordDraft, reset: resetToSaved, rebase });
	});
	onDestroy(() => drafts?.delete(id));
	// Only clean sections follow a refreshed load. Dirty sections keep their original revision.
	$effect.pre(() => {
		if (!dirty && !pending) {
			formState.draft = JSON.parse(saved);
			formState.baseline = saved;
		}
	});
	const isRevision = (key: string) => /^expected\w*Revision$/.test(key);
	const withoutRevisions = (json: string) =>
		JSON.stringify(JSON.parse(json), (key, value) => (isRevision(key) ? undefined : value));
	// Called after another section on this page saved. If only revisions moved, nothing this
	// section shows changed, so the draft moves to them; the server still rejects later conflicts.
	// Changes by other operators never rebase: they keep the draft stale until an explicit reload.
	function rebase() {
		if (!dirty || pending || withoutRevisions(saved) !== withoutRevisions(formState.baseline))
			return;
		const latest = JSON.parse(saved) as Record<string, unknown>;
		const draft = formState.draft as Record<string, unknown>;
		for (const key of Object.keys(latest)) if (isRevision(key)) draft[key] = latest[key];
		formState.baseline = saved;
	}
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
		const affected = [...(drafts?.entries() ?? [])].filter(
			([key, form]) => changesContext && key !== id && form.record && form.dirty
		);
		if (
			affected.length &&
			!window.confirm('Discard unsaved preparation before changing the live game?')
		) {
			cancel();
			return;
		}
		formData.set('payload', JSON.stringify(formState.draft));
		pending = true;
		message = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' || result.type === 'redirect') {
					for (const [, form] of affected) form.reset();
					formState.baseline = JSON.stringify(formState.draft);
					await update({ reset: false, navigate: false });
					await tick();
					for (const [key, form] of drafts?.entries() ?? []) if (key !== id) form.rebase();
					resetToSaved();
					message = 'Saved.';
					failed = false;
					unreachable = false;
					feedback = null;
				} else {
					failed = true;
					// enhance reports a failed fetch as an error without an HTTP status.
					unreachable = result.type === 'error' && result.status === undefined;
					feedback = result.type === 'failure' ? (result.data ?? null) : null;
					message =
						result.type === 'failure' && typeof result.data?.error === 'string'
							? result.data.error
							: unreachable
								? 'Could not reach the server. Your draft is still here; save it again once the connection is back.'
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
	{#if failed && !unreachable}
		<button
			type="button"
			class="btn preset-tonal-surface"
			onclick={async () => {
				if (!window.confirm('Discard this section’s draft and load the latest saved values?'))
					return;
				await refreshAll();
				resetToSaved();
				message = '';
				failed = false;
				feedback = null;
			}}>Reload this section</button
		>
	{/if}
</form>
