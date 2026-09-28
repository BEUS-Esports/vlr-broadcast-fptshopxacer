<script lang="ts">
	import { page } from '$app/state';
	import { Plus, Pencil, X } from '@lucide/svelte';
	import CatalogTable from '#lib/components/admin/CatalogTable.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const mapValues = $derived(
		form?.values?.kind === 'map' && 'displayName' in form.values ? form.values : null
	);
	const agentValues = $derived(
		form?.values?.kind === 'agent' && 'displayName' in form.values ? form.values : null
	);
	const selectedMap = $derived(
		data.maps.find((row) => form?.values?.kind === 'map' && row.id === form.values.id) ??
			data.selectedMap
	);
	const selectedAgent = $derived(
		data.agents.find((row) => form?.values?.kind === 'agent' && row.id === form.values.id) ??
			data.selectedAgent
	);
</script>

<svelte:head><title>Game resources | FPT Shop × Acer</title></svelte:head>
<div class="admin-page">
	<header>
		<p class="text-sm font-semibold text-primary-600-400">Tournament catalog</p>
		<h1 class="h1">Game resources</h1>
		<p class="mt-2 text-surface-600-400">Prepare maps and playable agents for your events.</p>
	</header>
	{#if form?.error}<p role="alert" class="card preset-filled-error-500 p-4">{form.error}</p>{/if}
	{#if data.refreshed}<p role="status" class="card preset-tonal-success p-4">
			Catalogue refreshed. Your existing resources and downloaded images were kept.
		</p>{/if}
	<section class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="max-w-2xl">
				<h2 class="h3">VALORANT catalogue</h2>
				<p class="mt-1 text-sm text-surface-600-400">
					Import competitive maps, playable agents, and artwork from valorant-api.com for local use.
				</p>
			</div>
			<form method="POST" action="?/refresh">
				<button class="btn preset-tonal-primary" type="submit">Refresh catalogue</button>
			</form>
		</div>
	</section>

	<section class="min-w-0 space-y-4" aria-label="Maps">
		<h2 class="flex items-center gap-3 h3">
			Maps <span class="badge preset-tonal-primary">{data.maps.length}</span>
		</h2>
		<CatalogTable
			rows={data.maps}
			label="Maps"
			searchText={(item) => `${item.displayName} ${item.key}`}
			columns={['Map', 'Splash Image', 'Status', 'Actions']}
		>
			{#snippet actions()}
				<a class="btn preset-filled-primary-500" href="/admin/resources?new=map#map-editor"
					><Plus size={16} aria-hidden="true" /> Add map</a
				>
			{/snippet}
			{#snippet editor()}
				{#if selectedMap || form?.values?.kind === 'map' || page.url.searchParams.get('new') === 'map'}
					<section id="map-editor" class="admin-editor" aria-label="Map editor">
						<div class="flex items-center justify-between gap-3">
							<h3 class="h3">{selectedMap || mapValues?.id ? 'Edit map' : 'Add map'}</h3>
							<a class="btn preset-tonal-surface btn-sm" href="/admin/resources"
								><X size={16} aria-hidden="true" /> Close</a
							>
						</div>
						<form class="grid gap-4 md:grid-cols-2" method="POST" action="?/save">
							<input type="hidden" name="kind" value="map" /><input
								type="hidden"
								name="id"
								value={mapValues?.id ?? selectedMap?.id ?? ''}
							/><input
								type="hidden"
								name="revision"
								value={mapValues?.revision ?? selectedMap?.revision ?? ''}
							/>
							<label class="block text-sm font-medium"
								>Name<input
									class="mt-1 input w-full"
									name="displayName"
									required
									maxlength="100"
									value={mapValues?.displayName ?? selectedMap?.displayName ?? ''}
								/></label
							>
							<label class="block text-sm font-medium"
								>Stable key <span class="font-normal text-surface-600-400"
									>(lowercase letters, numbers, hyphens)</span
								><input
									class="mt-1 input w-full"
									name="key"
									required
									pattern="[a-z0-9][a-z0-9-]*"
									maxlength="100"
									value={mapValues?.key ?? selectedMap?.key ?? ''}
								/></label
							>
							<label class="flex items-center gap-2 text-sm md:col-span-2"
								><input
									type="checkbox"
									name="isActive"
									checked={mapValues ? 'isActive' in mapValues : (selectedMap?.isActive ?? true)}
								/>Available for selection</label
							>
							{#if selectedMap?.splashPath}<img
									class="h-36 w-full rounded-base bg-surface-100-900 object-contain md:col-span-2"
									src={selectedMap.splashPath}
									alt="{selectedMap.displayName} splash"
								/>{/if}
							<div class="md:col-span-2">
								<button class="btn preset-filled-primary-500" type="submit">Save map</button>
							</div>
						</form>
						{#if selectedMap}<form
								class="mt-4 border-t border-surface-200-800 pt-4"
								method="POST"
								action="?/delete"
							>
								<input type="hidden" name="kind" value="map" /><input
									type="hidden"
									name="id"
									value={selectedMap.id}
								/><input type="hidden" name="revision" value={selectedMap.revision} /><button
									class="btn preset-tonal-error"
									type="submit">Delete unused map</button
								>
							</form>{/if}
					</section>
				{/if}
			{/snippet}
			{#snippet row(item)}
				<td
					><div class="flex items-center gap-3">
						{#if item.displayIconPath}<img
								class="size-12 shrink-0 rounded-base bg-surface-100-900 object-contain p-1"
								src={item.displayIconPath}
								alt=""
								width="48"
								height="48"
								loading="lazy"
							/>
						{:else}<span
								class="flex size-12 shrink-0 items-center justify-center rounded-base preset-tonal-primary text-xs"
								aria-hidden="true">Map</span
							>{/if}
						<span class="font-semibold">{item.displayName}</span>
					</div></td
				>
				<td>
					<img
						src={item.splashPath}
						class="scale-50"
						alt="Splash image for map {item.displayName}"
					/>
				</td>

				<td
					><span class="badge {item.isActive ? 'preset-tonal-success' : 'preset-tonal-surface'}"
						>{item.isActive ? 'Active' : 'Inactive'}</span
					></td
				>
				<td
					><a
						class="btn preset-tonal-primary btn-sm"
						href="/admin/resources?map={item.id}#map-editor"
						aria-label="Edit {item.displayName}"><Pencil size={14} aria-hidden="true" /> Edit</a
					></td
				>
			{/snippet}
		</CatalogTable>
	</section>

	<section class="min-w-0 space-y-4" aria-label="Agents">
		<h2 class="flex items-center gap-3 h3">
			Agents <span class="badge preset-tonal-primary">{data.agents.length}</span>
		</h2>
		<CatalogTable
			rows={data.agents}
			label="Agents"
			searchText={(item) => `${item.displayName} ${item.key} ${item.roleName ?? ''}`}
			columns={['Agent', 'Portrait', 'Role', 'Status', 'Actions']}
		>
			{#snippet actions()}
				<a class="btn preset-filled-primary-500" href="/admin/resources?new=agent#agent-editor"
					><Plus size={16} aria-hidden="true" /> Add agent</a
				>
			{/snippet}
			{#snippet editor()}
				{#if selectedAgent || form?.values?.kind === 'agent' || page.url.searchParams.get('new') === 'agent'}
					<section id="agent-editor" class="admin-editor" aria-label="Agent editor">
						<div class="flex items-center justify-between gap-3">
							<h3 class="h3">{selectedAgent || agentValues?.id ? 'Edit agent' : 'Add agent'}</h3>
							<a class="btn preset-tonal-surface btn-sm" href="/admin/resources"
								><X size={16} aria-hidden="true" /> Close</a
							>
						</div>
						<form class="grid gap-4 md:grid-cols-2" method="POST" action="?/save">
							<input type="hidden" name="kind" value="agent" /><input
								type="hidden"
								name="id"
								value={agentValues?.id ?? selectedAgent?.id ?? ''}
							/><input
								type="hidden"
								name="revision"
								value={agentValues?.revision ?? selectedAgent?.revision ?? ''}
							/>
							<label class="block text-sm font-medium"
								>Name<input
									class="mt-1 input w-full"
									name="displayName"
									required
									maxlength="100"
									value={agentValues?.displayName ?? selectedAgent?.displayName ?? ''}
								/></label
							>
							<label class="block text-sm font-medium"
								>Stable key <span class="font-normal text-surface-600-400"
									>(lowercase letters, numbers, hyphens)</span
								><input
									class="mt-1 input w-full"
									name="key"
									required
									pattern="[a-z0-9][a-z0-9-]*"
									maxlength="100"
									value={agentValues?.key ?? selectedAgent?.key ?? ''}
								/></label
							>
							<label class="block text-sm font-medium"
								>Role <span class="font-normal text-surface-600-400">(optional)</span><input
									class="mt-1 input w-full"
									name="roleName"
									maxlength="100"
									value={agentValues?.roleName ?? selectedAgent?.roleName ?? ''}
								/></label
							>
							<label class="flex items-center gap-2 text-sm md:col-span-2"
								><input
									type="checkbox"
									name="isActive"
									checked={agentValues
										? 'isActive' in agentValues
										: (selectedAgent?.isActive ?? true)}
								/>Available for selection</label
							>
							{#if selectedAgent?.fullPortraitPath}<img
									class="h-36 w-full rounded-base bg-surface-100-900 object-contain md:col-span-2"
									src={selectedAgent.fullPortraitPath}
									alt="{selectedAgent.displayName} portrait"
								/>{/if}
							<div class="md:col-span-2">
								<button class="btn preset-filled-primary-500" type="submit">Save agent</button>
							</div>
						</form>
						{#if selectedAgent}<form
								class="mt-4 border-t border-surface-200-800 pt-4"
								method="POST"
								action="?/delete"
							>
								<input type="hidden" name="kind" value="agent" /><input
									type="hidden"
									name="id"
									value={selectedAgent.id}
								/><input type="hidden" name="revision" value={selectedAgent.revision} /><button
									class="btn preset-tonal-error"
									type="submit">Delete unused agent</button
								>
							</form>{/if}
					</section>
				{/if}
			{/snippet}
			{#snippet row(item)}
				<td
					><div class="flex items-center gap-3">
						{#if item.displayIconPath}<img
								class="size-12 shrink-0 rounded-base bg-surface-100-900 object-contain p-1"
								src={item.displayIconPath}
								alt=""
								width="48"
								height="48"
								loading="lazy"
							/>
						{:else}<span
								class="flex size-12 shrink-0 items-center justify-center rounded-base preset-tonal-primary text-xs"
								aria-hidden="true">Agent</span
							>{/if}
						<span class="font-semibold">{item.displayName}</span>
					</div></td
				>
				<td class="text-surface-600-400">
					<img
						src={item.fullPortraitPath}
						class="scale-50"
						alt="Portrait Image for agent {item.displayName} "
					/>
				</td>
				<td>
					<div class="flex items-center gap-3">
						{#if item.roleIconPath}
							<img
								class="size-12 shrink-0 rounded-base"
								src={item.roleIconPath}
								alt=""
								width="48"
								height="48"
								loading="lazy"
							/>
						{/if}
						{item.roleName ?? '—'}
					</div>
				</td>
				<td
					><span class="badge {item.isActive ? 'preset-tonal-success' : 'preset-tonal-surface'}"
						>{item.isActive ? 'Active' : 'Inactive'}</span
					></td
				>
				<td
					><a
						class="btn preset-tonal-primary btn-sm"
						href="/admin/resources?agent={item.id}#agent-editor"
						aria-label="Edit {item.displayName}"><Pencil size={14} aria-hidden="true" /> Edit</a
					></td
				>
			{/snippet}
		</CatalogTable>
	</section>
</div>
