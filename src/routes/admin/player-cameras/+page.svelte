<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import type { createBroadcastClient } from '#lib/broadcast/client.ts';
	import { copyText } from '#lib/cameras/clipboard.ts';
	import ManagementForm from '#lib/components/admin/management/ManagementForm.svelte';
	import PlayerCameraPreview from '#lib/components/admin/cameras/PlayerCameraPreview.svelte';
	import {
		directorUrl,
		previewUrl,
		pushUrl,
		seatIds,
		type SeatId
	} from '#lib/cameras/vdo-ninja.ts';
	import { toaster } from '#lib/toaster.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const room = $derived(data.cameras.room);
	const password = $derived(data.cameras.password);
	// Seeded per seat: a bindable prop with a fallback cannot be bound to `undefined`.
	let connected = $state(
		Object.fromEntries(seatIds.map((id) => [id, false])) as Record<SeatId, boolean>
	);
	const connectedCount = $derived(seatIds.filter((id) => connected[id]).length);

	// Follow live selection, lineup and booth changes made from other pages or PCs.
	const broadcastClient = getContext<ReturnType<typeof createBroadcastClient>>('broadcast-client');
	onMount(() => {
		let revision = `${data.controlRevision}:${data.dataRevision}`;
		let refreshing = false;
		let queued = false;
		async function refresh() {
			queued = true;
			if (refreshing) return;
			refreshing = true;
			try {
				do {
					queued = false;
					await refreshAll();
				} while (queued);
			} finally {
				refreshing = false;
			}
		}
		return broadcastClient.subscribe((state) => {
			if (!state.snapshot) return;
			const next = `${state.snapshot.controlRevision}:${state.snapshot.dataRevision}`;
			if (next === revision) return;
			revision = next;
			void refresh();
		});
	});

	async function copy(text: string, title: string) {
		try {
			await copyText(text);
			toaster.success({ title });
		} catch {
			toaster.error({ title: 'Could not copy to the clipboard' });
		}
	}

	function allLinks() {
		return seatIds.map((id) => `${id}  ${pushUrl(id, room, password)}`).join('\n');
	}
</script>

<svelte:head><title>Player Cameras | Broadcast controller</title></svelte:head>

<div class="admin-page">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-2">
			<h1 class="h1">Manage Player Cameras</h1>
			<p>Preview every booth feed and hand each seat its own permanent VDO.Ninja link.</p>
		</div>
		<p class="card border border-surface-200-800 px-4 py-2" aria-live="polite">
			{connectedCount}/10 feeds connected
		</p>
	</header>

	{#if !room}
		<p class="card preset-tonal-warning p-4">
			Set a room name to enable links. Previews and player links appear once the room is saved.
		</p>
	{/if}

	{#each data.booths as booth (booth.booth)}
		{@const count = booth.seats.filter((seat) => connected[seat.id]).length}
		<section class="space-y-3" aria-label={`Booth ${booth.booth}`}>
			<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
				<h2 class="h3">
					{[`Booth ${booth.booth}`, booth.role, booth.team?.name].filter(Boolean).join(' · ')}
				</h2>
				<p class="text-sm text-surface-600-400">{count}/5 connected</p>
				{#if booth.booth === 1}
					<div class="ml-auto">
						<ManagementForm
							action="?/booths"
							recordDraft={false}
							initial={{
								expectedRevision: data.controlRevision,
								boothsSwapped: !data.boothsSwapped
							}}
						>
							<button type="submit" class="btn preset-tonal-primary">Swap booths</button>
						</ManagementForm>
					</div>
				{/if}
			</div>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
				{#each booth.seats as seat (seat.id)}
					<article
						class="overflow-hidden card border border-surface-200-800 bg-surface-100-900"
						data-seat={seat.id}
					>
						<h3 class="truncate px-3 py-2 text-sm font-semibold">
							{#if seat.player}
								{booth.team ? `${booth.team.tag} · ` : ''}{seat.player}
							{:else}
								{seat.id} <span class="font-normal text-surface-600-400">· Empty seat</span>
							{/if}
						</h3>
						<PlayerCameraPreview
							src={room ? previewUrl(seat.id, room, password) : null}
							title={`Camera preview ${seat.id}`}
							bind:connected={connected[seat.id]}
						>
							{#snippet actions()}
								<button
									type="button"
									class="btn preset-tonal btn-sm"
									disabled={!room}
									onclick={() => copy(pushUrl(seat.id, room, password), `${seat.id} link copied`)}
									>Copy link</button
								>
							{/snippet}
						</PlayerCameraPreview>
					</article>
				{/each}
			</div>
		</section>
	{/each}

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="admin-editor" aria-label="Room setup">
			<div class="space-y-1">
				<h2 class="h3">Room setup</h2>
				<p class="text-sm text-surface-600-400">One room, one permanent link per seat.</p>
			</div>
			<ManagementForm
				action="?/room"
				recordDraft={false}
				confirmMessage={room
					? 'Every handed-out player link stops working. Change the room or password?'
					: undefined}
				initial={{ expectedRevision: data.cameras.revision, room, password }}
			>
				{#snippet children(draft)}
					<label class="label">
						<span>Room name</span>
						<input
							class="input"
							bind:value={draft.room}
							required
							maxlength="32"
							pattern="[A-Za-z0-9_]+"
							autocomplete="off"
						/>
					</label>
					<label class="label">
						<span>Password</span>
						<input
							class="input font-mono"
							bind:value={draft.password}
							required
							minlength="8"
							maxlength="32"
							pattern="[A-Za-z0-9_]+"
							autocomplete="off"
						/>
					</label>
					<p class="text-sm text-surface-600-400">Letters, digits and underscores only.</p>
					<button type="submit" class="btn preset-tonal-primary">Save room</button>
				{/snippet}
			</ManagementForm>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn preset-filled-primary-500"
					disabled={!room}
					onclick={() => copy(allLinks(), 'All player links copied')}>Copy all player links</button
				>
				{#if room}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- External VDO.Ninja link, not an app route. -->
					<a
						href={directorUrl(room, password)}
						class="btn preset-tonal"
						target="_blank"
						rel="noopener noreferrer">Open director room</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else}
					<button type="button" class="btn preset-tonal" disabled>Open director room</button>
				{/if}
			</div>
			{#if room}
				<details>
					<summary class="cursor-pointer text-sm">Show all player links</summary>
					<label class="label mt-2">
						<span class="sr-only">All player links</span>
						<textarea
							class="textarea font-mono text-xs"
							rows="10"
							readonly
							value={allLinks()}
							onfocus={(event) => event.currentTarget.select()}></textarea>
					</label>
				</details>
			{/if}
		</section>

		<section class="admin-editor" aria-label="Fixed seat links">
			<h2 class="h3">Every seat has a fixed link</h2>
			<p>
				Each booth PC opens its seat's link once and keeps it for the whole event. Seat N of a booth
				shows lineup slot N of the team sitting there.
			</p>
			<p class="flex justify-between gap-4 card bg-surface-200-800 px-4 py-3 font-mono text-sm">
				<span>BOOTH 1 / SEAT 1</span><span>push=BOOTH1_S1</span>
			</p>
			<p class="text-sm text-surface-600-400">
				Copy the seat's link and send it to that booth PC. Keep the push parameter unchanged when
				sharing. Teams moving booths between maps only need Swap booths.
			</p>
			<p class="text-xs text-surface-600-400">Powered by VDO.Ninja</p>
		</section>
	</div>
</div>
