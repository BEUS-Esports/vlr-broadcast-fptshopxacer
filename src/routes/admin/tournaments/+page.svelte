<script lang="ts">
	import { page } from '$app/state';
	import { Plus } from '@lucide/svelte';
	import CatalogTable from '#lib/components/admin/CatalogTable.svelte';
	import ManagementForm from '#lib/components/admin/management/ManagementForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let showArchived = $state(false);
	let lastSuggestion = $state('');
	const visible = $derived(data.tournaments.filter((row) => showArchived || !row.archivedAt));
	const createOpen = $derived(page.url.searchParams.has('new') || Boolean(form?.draft));
	function suggestSlug(name: string) {
		return name
			.trim()
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}
</script>

<svelte:head><title>Tournaments | FPT Shop × Acer</title></svelte:head>
<div class="admin-page">
	<header>
		<p class="text-sm font-semibold text-primary-600-400">Event management</p>
		<h1 class="h1">Tournaments</h1>
		<p class="mt-2 text-surface-600-400">Create events and open their preparation workspaces.</p>
	</header>
	<CatalogTable
		rows={visible}
		label="Tournaments"
		searchText={(row) => `${row.name} ${row.slug}`}
		columns={['Name', 'Slug', 'Status', 'Actions']}
	>
		{#snippet actions()}
			<a class="btn preset-filled-primary-500" href="/admin/tournaments?new=1#tournament-editor"
				><Plus size={16} aria-hidden="true" /> Add tournament</a
			>
			<label class="flex items-center gap-2 text-sm"
				><input type="checkbox" bind:checked={showArchived} /> Show archived</label
			>
		{/snippet}
		{#snippet editor()}
			{#if createOpen}
				<section id="tournament-editor" class="admin-editor" aria-label="New tournament">
					<div class="flex items-center justify-between gap-3">
						<h2 class="h3">New tournament</h2>
						<a class="btn preset-tonal-surface btn-sm" href="/admin/tournaments">Close</a>
					</div>
					<ManagementForm
						action="?/create"
						initial={{
							name: String(form?.draft?.name ?? ''),
							slug: String(form?.draft?.slug ?? '')
						}}
					>
						{#snippet children(draft, pending)}
							<div class="grid gap-4 md:grid-cols-2">
								<label class="block text-sm font-medium"
									>Tournament name<input
										class="mt-1 input w-full"
										required
										maxlength="150"
										bind:value={draft.name}
										oninput={() => {
											if (!draft.slug || draft.slug === lastSuggestion) {
												draft.slug = suggestSlug(draft.name);
												lastSuggestion = draft.slug;
											}
										}}
									/></label
								>
								<label class="block text-sm font-medium"
									>Slug<input
										class="mt-1 input w-full"
										required
										maxlength="100"
										pattern="[a-z0-9]+(-[a-z0-9]+)*"
										bind:value={draft.slug}
									/><span class="mt-1 block text-xs text-surface-600-400"
										>Lowercase letters, numbers, and single hyphens.</span
									></label
								>
							</div>
							<button class="btn preset-filled-primary-500" disabled={pending}
								>Create tournament</button
							>
						{/snippet}
					</ManagementForm>
				</section>
			{/if}
		{/snippet}
		{#snippet row(tournament)}
			<td class="font-semibold">{tournament.name}</td>
			<td class="text-sm text-surface-600-400">{tournament.slug}</td>
			<td
				><span
					class="badge {tournament.archivedAt ? 'preset-tonal-warning' : 'preset-tonal-success'}"
					>{tournament.archivedAt ? 'Archived' : 'Active'}</span
				></td
			>
			<td
				><a class="btn preset-tonal-primary btn-sm" href="/admin/tournaments/{tournament.id}"
					>Open workspace</a
				></td
			>
		{/snippet}
	</CatalogTable>
</div>
