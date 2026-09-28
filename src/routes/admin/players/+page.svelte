<script lang="ts">
	import { page } from '$app/state';
	import { Plus, Pencil, X } from '@lucide/svelte';
	import CatalogTable from '#lib/components/admin/CatalogTable.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const selected = $derived(
		data.players.find((row) => row.id === form?.values?.id) ?? data.selected
	);
	const editorOpen = $derived(
		Boolean(selected || form?.values || page.url.searchParams.has('new'))
	);
</script>

<svelte:head><title>Players | FPT Shop × Acer</title></svelte:head>
<div class="admin-page">
	<header>
		<p class="text-sm font-semibold text-primary-600-400">Tournament catalog</p>
		<h1 class="h1">Players</h1>
		<p class="mt-2 text-surface-600-400">
			Manage reusable player profiles. Choose tournament rosters and game lineups independently.
		</p>
	</header>
	{#if form?.error}<p role="alert" class="card preset-filled-error-500 p-4">{form.error}</p>{/if}
	<CatalogTable
		rows={data.players}
		label="Players"
		searchText={(player) => `${player.displayName} ${player.fullName ?? ''} ${player.riotId ?? ''}`}
		columns={['Player', 'Full name', 'Riot ID', 'Actions']}
	>
		{#snippet actions()}
			<a class="btn preset-filled-primary-500" href="/admin/players?new=1#player-editor"
				><Plus size={16} aria-hidden="true" /> Add player</a
			>
		{/snippet}
		{#snippet editor()}
			{#if editorOpen}
				<section id="player-editor" class="admin-editor" aria-label="Player editor">
					<div class="flex items-center justify-between gap-3">
						<h2 class="h3">{selected || form?.values?.id ? 'Edit player' : 'Add player'}</h2>
						<a class="btn preset-tonal-surface btn-sm" href="/admin/players"
							><X size={16} aria-hidden="true" /> Close</a
						>
					</div>
					<form
						class="grid gap-4 md:grid-cols-2"
						method="POST"
						action="?/save"
						enctype="multipart/form-data"
					>
						<input type="hidden" name="id" value={form?.values?.id ?? selected?.id ?? ''} />
						<input
							type="hidden"
							name="revision"
							value={form?.values?.revision ?? selected?.revision ?? ''}
						/>
						<label class="block text-sm font-medium"
							>In-game / display name
							<input
								class="mt-1 input w-full"
								name="displayName"
								required
								maxlength="100"
								value={form?.values?.displayName ?? selected?.displayName ?? ''}
							/>
						</label>
						<label class="block text-sm font-medium"
							>Full name <span class="font-normal text-surface-600-400">(optional)</span>
							<input
								class="mt-1 input w-full"
								name="fullName"
								maxlength="150"
								value={form?.values?.fullName ?? selected?.fullName ?? ''}
							/>
						</label>
						<label class="block text-sm font-medium"
							>Riot ID <span class="font-normal text-surface-600-400">(optional)</span>
							<input
								class="mt-1 input w-full"
								name="riotId"
								maxlength="100"
								value={form?.values?.riotId ?? selected?.riotId ?? ''}
							/>
						</label>
						<label class="block text-sm font-medium"
							>Portrait
							{#if selected?.portraitPath}<img
									class="mt-2 h-32 w-full rounded-base bg-surface-100-900 object-contain p-2"
									src={selected.portraitPath}
									alt="Current portrait of {selected.displayName}"
								/>
							{:else}<span
									class="mt-2 flex h-32 items-center justify-center rounded-base bg-surface-100-900 text-sm text-surface-600-400"
									>No portrait</span
								>{/if}
							<input
								class="mt-2 input w-full"
								type="file"
								name="portrait"
								accept="image/png,image/jpeg,image/webp"
							/>
						</label>
						<p class="text-xs text-surface-600-400 md:col-span-2">
							PNG, JPEG, or WebP. Up to 10 MB.
						</p>
						<div class="md:col-span-2">
							<button class="btn preset-filled-primary-500" type="submit">Save player</button>
						</div>
					</form>
					{#if selected}
						<form class="mt-5 border-t border-surface-200-800 pt-5" method="POST" action="?/delete">
							<input type="hidden" name="id" value={selected.id} />
							<input type="hidden" name="revision" value={selected.revision} />
							<button class="btn preset-tonal-error" type="submit">Delete unused player</button>
							<p class="mt-2 text-xs text-surface-600-400">
								Players in a roster or lineup cannot be deleted.
							</p>
						</form>
					{/if}
				</section>
			{/if}
		{/snippet}
		{#snippet row(player)}
			<td
				><div class="flex items-center gap-3">
					{#if player.portraitPath}<img
							class="size-12 shrink-0 rounded-base bg-surface-100-900 object-contain"
							src={player.portraitPath}
							alt=""
							width="48"
							height="48"
							loading="lazy"
						/>
					{:else}<span
							class="flex size-12 shrink-0 items-center justify-center rounded-base preset-tonal-primary font-semibold"
							aria-hidden="true">{player.displayName.slice(0, 2).toUpperCase()}</span
						>{/if}
					<span class="font-semibold">{player.displayName}</span>
				</div></td
			>
			<td>{player.fullName ?? '—'}</td><td>{player.riotId ?? '—'}</td>
			<td
				><a
					class="btn preset-tonal-primary btn-sm"
					href="/admin/players?edit={player.id}#player-editor"
					aria-label="Edit {player.displayName}"><Pencil size={14} aria-hidden="true" /> Edit</a
				></td
			>
		{/snippet}
	</CatalogTable>
</div>
