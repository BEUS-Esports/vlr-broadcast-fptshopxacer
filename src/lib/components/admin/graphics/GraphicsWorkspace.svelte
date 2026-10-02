<script module lang="ts">
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
	import type { loadGraphicsControl } from '#lib/server/services/graphics-control.ts';
	export type GraphicsControlData = Awaited<ReturnType<typeof loadGraphicsControl>>;
	export type GraphicsContext = {
		readonly live: BroadcastSnapshot;
		readonly management: GraphicsControlData['management'];
		readonly connection: string;
	};
</script>

<script lang="ts">
	import { onMount, getContext, setContext, untrack, type Snippet } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { createBroadcastClient, type BroadcastClientState } from '#lib/broadcast/client.ts';
	import type { DraftRegistry } from '../management/DraftGuard.svelte';
	import GraphicsGlobalSetup from './GraphicsGlobalSetup.svelte';
	let { data, children }: { data: GraphicsControlData; children: Snippet } = $props();
	let stream = $state<BroadcastClientState>({
		connection: 'disconnected',
		snapshot: null,
		cursor: null
	});
	let refreshError = $state('');
	const live = $derived(
		stream.snapshot &&
			stream.snapshot.controlRevision >= data.snapshot.controlRevision &&
			stream.snapshot.dataRevision >= data.snapshot.dataRevision
			? stream.snapshot
			: data.snapshot
	);
	const editor = $state({ management: untrack(() => data.management) });
	const management = $derived(editor.management);
	const drafts = getContext<DraftRegistry>('management-drafts');
	const recordsDirty = $derived([...drafts.values()].some((form) => form.record && form.dirty));
	const changedContext = $derived(
		(management?.game.id ?? null) !== (data.management?.game.id ?? null)
	);
	$effect.pre(() => {
		const next = data.management;
		if (!changedContext || !recordsDirty) editor.management = next;
	});
	setContext<GraphicsContext>('graphics-control', {
		get live() {
			return live;
		},
		get management() {
			return management;
		},
		get connection() {
			return stream.connection;
		}
	});
	onMount(() => {
		const client = createBroadcastClient();
		let revision = `${data.snapshot.controlRevision}:${data.snapshot.dataRevision}`;
		let refreshing = false;
		let queued = false;
		async function refresh() {
			queued = true;
			if (refreshing) return;
			refreshing = true;
			try {
				do {
					queued = false;
					await invalidateAll();
				} while (queued);
				refreshError = '';
			} catch {
				refreshError =
					'Could not refresh saved preparation and game options. Reload before editing.';
			} finally {
				refreshing = false;
			}
		}
		const unsubscribe = client.subscribe((state) => {
			stream = state;
			if (!state.snapshot) return;
			const next = `${state.snapshot.controlRevision}:${state.snapshot.dataRevision}`;
			if (next !== revision) {
				revision = next;
				void refresh();
			}
		});
		client.connect();
		return () => {
			unsubscribe();
			client.disconnect();
		};
	});
</script>

<div class="admin-page">
	{#if page.url.pathname === '/admin/graphics'}
		<header class="space-y-2">
			<h1 class="h1">Global Settings</h1>
			<p>
				Choose the live game and presentation settings. Open each graphic from the sidebar to
				prepare, preview, and show it.
			</p>
		</header>
	{/if}
	<GraphicsGlobalSetup {data} {live} connection={stream.connection} />
	{#if refreshError}<p role="alert">{refreshError}</p>{/if}
	{#if changedContext && recordsDirty}
		<section class="admin-editor" aria-label="Retained preparation draft">
			<p role="alert">
				The live selection changed. Your unsaved draft still edits Game {management?.game.number}: {management
					?.game.name} in {management?.match.label}.
			</p>
			<button
				type="button"
				class="btn preset-tonal-warning"
				onclick={() => {
					if (!window.confirm('Discard unsaved preparation and follow the current live game?'))
						return;
					for (const form of drafts.values()) if (form.record) form.reset();
					editor.management = data.management;
				}}>Discard draft and follow live game</button
			>
		</section>
	{/if}
	{@render children()}
</div>
