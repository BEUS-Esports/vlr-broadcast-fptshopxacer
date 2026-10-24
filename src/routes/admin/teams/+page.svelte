<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Plus, Pencil, X } from '@lucide/svelte';
	import CatalogTable from '#lib/components/admin/CatalogTable.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const selected = $derived(data.teams.find((row) => row.id === form?.values?.id) ?? data.selected);
	const editorOpen = $derived(
		Boolean(selected || form?.values || page.url.searchParams.has('new'))
	);
</script>

<svelte:head><title>Teams | FPT Shop × Acer</title></svelte:head>
<div class="admin-page">
	<header>
		<p class="text-sm font-semibold text-primary-600-400">Tournament catalog</p>
		<h1 class="h1">Teams</h1>
		<p class="mt-2 text-surface-600-400">
			Manage team profiles and logos, ready to use across your events.
		</p>
	</header>
	{#if form?.error}<p role="alert" class="card preset-filled-error-500 p-4">{form.error}</p>{/if}
	<CatalogTable
		rows={data.teams}
		label="Teams"
		searchText={(team) => `${team.name} ${team.tag}`}
		columns={['Team name', 'Tag', 'Normal logo', 'White logo', 'Black logo', 'Actions']}
	>
		{#snippet actions()}
			<a class="btn preset-filled-primary-500" href={resolve('/admin/teams?new=1#team-editor')}
				><Plus size={16} aria-hidden="true" /> Add team</a
			>
			<span class="badge preset-tonal-surface">Import coming soon</span>
		{/snippet}
		{#snippet editor()}
			{#if editorOpen}
				<section id="team-editor" class="admin-editor" aria-label="Team editor">
					<div class="flex items-center justify-between gap-3">
						<h2 class="h3">{selected || form?.values?.id ? 'Edit team' : 'Add team'}</h2>
						<a class="btn preset-tonal-surface btn-sm" href={resolve('/admin/teams')}
							><X size={16} aria-hidden="true" /> Close</a
						>
					</div>
					<form class="space-y-4" method="POST" action="?/save" enctype="multipart/form-data">
						<input type="hidden" name="id" value={form?.values?.id ?? selected?.id ?? ''} />
						<input
							type="hidden"
							name="revision"
							value={form?.values?.revision ?? selected?.revision ?? ''}
						/>
						<div class="grid gap-4 md:grid-cols-2">
							<label class="block text-sm font-medium">
								Team name
								<input
									class="mt-1 input w-full"
									name="name"
									required
									maxlength="100"
									value={form?.values?.name ?? selected?.name ?? ''}
								/>
							</label>
							<label class="block text-sm font-medium">
								Team tag
								<input
									class="mt-1 input w-full"
									name="tag"
									required
									maxlength="20"
									value={form?.values?.tag ?? selected?.tag ?? ''}
								/>
							</label>
						</div>
						<fieldset class="grid gap-4 md:grid-cols-3">
							<legend class="mb-2 text-sm font-medium">Team logos (optional)</legend>
							<label class="block text-sm">
								Normal logo
								{#if selected?.logoPath}<img
										class="mt-2 h-24 w-full rounded-base bg-surface-100-900 object-contain p-2"
										src={selected.logoPath}
										alt="Current normal logo"
									/>{/if}
								<input
									class="mt-1 input block w-full"
									type="file"
									name="logo"
									accept="image/png,image/jpeg,image/webp"
								/>
							</label>
							<label class="block text-sm">
								White logo
								{#if selected?.logoWhitePath}<img
										class="mt-2 h-24 w-full rounded-base bg-surface-950 object-contain p-2"
										src={selected.logoWhitePath}
										alt="Current white logo"
									/>{/if}
								<input
									class="mt-1 input block w-full"
									type="file"
									name="logoWhite"
									accept="image/png,image/jpeg,image/webp"
								/>
							</label>
							<label class="block text-sm">
								Black logo
								{#if selected?.logoBlackPath}<img
										class="mt-2 h-24 w-full rounded-base bg-white object-contain p-2"
										src={selected.logoBlackPath}
										alt="Current black logo"
									/>{/if}
								<input
									class="mt-1 input block w-full"
									type="file"
									name="logoBlack"
									accept="image/png,image/jpeg,image/webp"
								/>
							</label>
						</fieldset>
						<p class="text-xs text-surface-600-400">
							PNG, JPEG, or WebP. Up to 10 MB per logo. Leave a file empty to keep its current logo.
						</p>
						<button class="btn preset-filled-primary-500" type="submit"
							>{selected || form?.values?.id ? 'Save team' : 'Create team'}</button
						>
					</form>
					{#if selected}
						<form class="border-t border-surface-200-800 pt-4" method="POST" action="?/delete">
							<input type="hidden" name="id" value={selected.id} />
							<input type="hidden" name="revision" value={selected.revision} />
							<button class="btn preset-tonal-error" type="submit">Delete unused team</button>
							<p class="mt-2 text-xs text-surface-600-400">
								Teams used by a tournament or game cannot be deleted.
							</p>
						</form>
					{/if}
				</section>
			{/if}
		{/snippet}
		{#snippet row(team)}
			<td class="font-semibold">{team.name}</td>
			<td><span class="font-semibold">{team.tag}</span></td>
			{#each [{ path: team.logoPath, label: 'Normal', background: 'bg-surface-100-900' }, { path: team.logoWhitePath, label: 'White', background: 'bg-surface-950' }, { path: team.logoBlackPath, label: 'Black', background: 'bg-white' }] as logo (logo.label)}
				<td
					>{#if logo.path}<img
							class="size-14 rounded-base object-contain p-2 {logo.background}"
							src={logo.path}
							alt="{logo.label} logo of {team.name}"
							width="56"
							height="56"
							loading="lazy"
						/>{:else}<span class="text-xs text-surface-600-400">No logo</span>{/if}</td
				>
			{/each}
			<td
				><a
					class="btn preset-tonal-primary btn-sm"
					href={resolve(`/admin/teams?edit=${team.id}#team-editor`)}
					aria-label="Edit {team.name}"><Pencil size={14} aria-hidden="true" /> Edit</a
				></td
			>
		{/snippet}
	</CatalogTable>
</div>
