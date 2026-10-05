<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Progress, Tabs } from '@skeletonlabs/skeleton-svelte';
	import { Download, Pencil, Plus, X } from '@lucide/svelte';
	import CatalogTable from '#lib/components/admin/CatalogTable.svelte';
	import type { PageProps } from './$types';

	type ResourceKind = 'map' | 'agent' | 'weapon';
	type TabValue = 'maps' | 'agents' | 'weapons';
	type SyncEvent =
		| {
				type: 'progress';
				phase: 'fetch' | 'download' | 'save';
				completed: number;
				total: number;
				message: string;
		  }
		| { type: 'done'; kind: ResourceKind; count: number; message: string }
		| { type: 'error'; message: string };

	let { data, form }: PageProps = $props();

	function initialTab(): TabValue {
		const requested = page.url.searchParams.get('tab');
		if (requested === 'maps' || requested === 'agents' || requested === 'weapons') return requested;
		if (page.url.searchParams.has('agent')) return 'agents';
		if (page.url.searchParams.has('weapon')) return 'weapons';
		if (page.url.searchParams.get('new') === 'agent') return 'agents';
		if (page.url.searchParams.get('new') === 'weapon') return 'weapons';
		return 'maps';
	}

	let tab = $state<TabValue>(initialTab());
	let syncing = $state<ResourceKind | null>(null);
	let syncMessage = $state('');
	let syncError = $state('');
	let syncCompleted = $state(0);
	let syncTotal = $state(0);

	const syncValue = $derived(
		syncing && syncTotal > 0 ? Math.round((syncCompleted / syncTotal) * 100) : null
	);

	const mapValues = $derived(
		form?.values?.kind === 'map' && 'displayName' in form.values ? form.values : null
	);
	const agentValues = $derived(
		form?.values?.kind === 'agent' && 'displayName' in form.values ? form.values : null
	);
	const weaponValues = $derived(
		form?.values?.kind === 'weapon' && 'displayName' in form.values ? form.values : null
	);

	const selectedMap = $derived(
		data.maps.find((row) => form?.values?.kind === 'map' && row.id === form.values.id) ??
			data.selectedMap
	);
	const selectedAgent = $derived(
		data.agents.find((row) => form?.values?.kind === 'agent' && row.id === form.values.id) ??
			data.selectedAgent
	);
	const selectedWeapon = $derived(
		data.weapons.find((row) => form?.values?.kind === 'weapon' && row.id === form.values.id) ??
			data.selectedWeapon
	);

	function plural(kind: ResourceKind) {
		return kind === 'map' ? 'maps' : kind === 'agent' ? 'agents' : 'weapons';
	}

	function handleSyncEvent(event: SyncEvent) {
		if (event.type === 'progress') {
			syncMessage = event.message;
			syncCompleted = event.completed;
			syncTotal = event.total;
			return;
		}
		if (event.type === 'error') {
			syncError = event.message;
			return;
		}
		syncMessage = event.message;
		if (syncTotal > 0) syncCompleted = syncTotal;
	}

	async function sync(kind: ResourceKind) {
		if (syncing) return;
		syncing = kind;
		syncMessage = `Starting ${plural(kind)} sync…`;
		syncError = '';
		syncCompleted = 0;
		syncTotal = 0;

		try {
			const response = await fetch(`/admin/resources/sync?kind=${kind}`, { method: 'POST' });
			if (!response.body) throw new Error('The server did not return a progress stream.');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { value, done } = await reader.read();
				buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.trim()) continue;
					handleSyncEvent(JSON.parse(line) as SyncEvent);
				}
				if (done) break;
			}

			if (buffer.trim()) handleSyncEvent(JSON.parse(buffer) as SyncEvent);
			if (!syncError) await refreshAll();
		} catch (cause) {
			syncError = cause instanceof Error ? cause.message : 'Catalogue sync failed.';
		} finally {
			syncing = null;
		}
	}
</script>

<svelte:head><title>Game resources | FPT Shop × Acer</title></svelte:head>

<div class="admin-page">
	<header>
		<p class="text-sm font-semibold text-primary-600-400">Tournament catalog</p>
		<h1 class="h1">Game resources</h1>
		<p class="mt-2 text-surface-600-400">
			Prepare maps, playable agents, and weapons for your events and broadcast graphics.
		</p>
	</header>

	{#if form?.error}<p role="alert" class="card preset-filled-error-500 p-4">{form.error}</p>{/if}
	{#if data.refreshed}<p role="status" class="card preset-tonal-success p-4">
			Catalogue refreshed. Existing resources and downloaded images were kept.
		</p>{/if}

	<section class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="max-w-2xl">
				<h2 class="h3">VALORANT catalogue</h2>
				<p class="mt-1 text-sm text-surface-600-400">
					Sync only the resource type you need. Artwork is downloaded once and then served locally.
				</p>
			</div>
		</div>

		{#if syncing || syncMessage || syncError}
			<div class="mt-4 space-y-2" aria-live="polite">
				<div class="flex items-center justify-between gap-3 text-sm">
					<span class={syncError ? 'text-error-600-400' : 'text-surface-700-300'}>
						{syncError || syncMessage}
					</span>
					{#if syncing && syncTotal > 0}
						<span class="shrink-0 text-surface-600-400">{syncCompleted}/{syncTotal}</span>
					{/if}
				</div>
				{#if syncing}
					<Progress value={syncValue}>
						<Progress.Track class="h-2">
							<Progress.Range />
						</Progress.Track>
					</Progress>
				{/if}
			</div>
		{/if}
	</section>

	<Tabs value={tab} onValueChange={(details) => (tab = details.value as TabValue)}>
		<Tabs.List class="w-full overflow-x-auto border-b border-surface-200-800">
			<Tabs.Trigger value="maps" class="min-w-max">
				Maps <span class="ml-2 badge preset-tonal-primary">{data.maps.length}</span>
			</Tabs.Trigger>
			<Tabs.Trigger value="agents" class="min-w-max">
				Agents <span class="ml-2 badge preset-tonal-primary">{data.agents.length}</span>
			</Tabs.Trigger>
			<Tabs.Trigger value="weapons" class="min-w-max">
				Weapons <span class="ml-2 badge preset-tonal-primary">{data.weapons.length}</span>
			</Tabs.Trigger>
			<Tabs.Indicator />
		</Tabs.List>

		<Tabs.Content value="maps" class="pt-5">
			<section class="min-w-0" aria-label="Maps">
				<CatalogTable
					rows={data.maps}
					label="Maps"
					searchText={(item) => `${item.displayName} ${item.key}`}
					columns={['Map', 'Splash', 'Status', 'Actions']}
				>
					{#snippet actions()}
						<a
							class="btn preset-filled-primary-500"
							href="/admin/resources?tab=maps&new=map#map-editor"
						>
							<Plus size={16} aria-hidden="true" /> Add map
						</a>
						<button
							class="btn preset-tonal-primary"
							type="button"
							disabled={syncing !== null}
							onclick={() => sync('map')}
						>
							<Download size={16} aria-hidden="true" />
							{syncing === 'map' ? 'Syncing…' : 'Sync maps'}
						</button>
					{/snippet}

					{#snippet editor()}
						{#if selectedMap || form?.values?.kind === 'map' || page.url.searchParams.get('new') === 'map'}
							<section id="map-editor" class="admin-editor" aria-label="Map editor">
								<div class="flex items-center justify-between gap-3">
									<h3 class="h3">{selectedMap || mapValues?.id ? 'Edit map' : 'Add map'}</h3>
									<a class="btn preset-tonal-surface btn-sm" href="/admin/resources?tab=maps">
										<X size={16} aria-hidden="true" /> Close
									</a>
								</div>
								<form class="grid gap-4 md:grid-cols-2" method="POST" action="?/save">
									<input type="hidden" name="kind" value="map" />
									<input type="hidden" name="id" value={mapValues?.id ?? selectedMap?.id ?? ''} />
									<input
										type="hidden"
										name="revision"
										value={mapValues?.revision ?? selectedMap?.revision ?? ''}
									/>
									<label class="block text-sm font-medium">
										Name
										<input
											class="mt-1 input w-full"
											name="displayName"
											required
											maxlength="100"
											value={mapValues?.displayName ?? selectedMap?.displayName ?? ''}
										/>
									</label>
									<label class="block text-sm font-medium">
										Stable key
										<span class="font-normal text-surface-600-400">
											(lowercase letters, numbers, hyphens)
										</span>
										<input
											class="mt-1 input w-full"
											name="key"
											required
											pattern="[a-z0-9][a-z0-9-]*"
											maxlength="100"
											value={mapValues?.key ?? selectedMap?.key ?? ''}
										/>
									</label>
									<label class="flex items-center gap-2 text-sm md:col-span-2">
										<input
											type="checkbox"
											name="isActive"
											checked={mapValues
												? 'isActive' in mapValues
												: (selectedMap?.isActive ?? true)}
										/>
										Available for selection
									</label>
									{#if selectedMap?.splashPath}
										<img
											class="h-36 w-full rounded-base bg-surface-100-900 object-contain md:col-span-2"
											src={selectedMap.splashPath}
											alt="{selectedMap.displayName} splash"
										/>
									{/if}
									<div class="md:col-span-2">
										<button class="btn preset-filled-primary-500" type="submit">Save map</button>
									</div>
								</form>
								{#if selectedMap}
									<form
										class="mt-4 border-t border-surface-200-800 pt-4"
										method="POST"
										action="?/delete"
									>
										<input type="hidden" name="kind" value="map" />
										<input type="hidden" name="id" value={selectedMap.id} />
										<input type="hidden" name="revision" value={selectedMap.revision} />
										<button class="btn preset-tonal-error" type="submit">Delete unused map</button>
									</form>
								{/if}
							</section>
						{/if}
					{/snippet}

					{#snippet row(item)}
						<td class="align-middle">
							<div class="flex items-center gap-3">
								{#if item.displayIconPath}
									<img
										class="size-10 shrink-0 rounded-base bg-surface-100-900 object-contain p-1"
										src={item.displayIconPath}
										alt=""
										width="40"
										height="40"
										loading="lazy"
									/>
								{:else}
									<span
										class="flex size-10 shrink-0 items-center justify-center rounded-base preset-tonal-primary text-xs"
										aria-hidden="true">Map</span
									>
								{/if}
								<span class="font-semibold">{item.displayName}</span>
							</div>
						</td>
						<td class="align-middle">
							{#if item.splashPath}
								<img
									src={item.splashPath}
									class="h-14 w-28 rounded-base bg-surface-100-900 object-cover"
									width="112"
									height="56"
									loading="lazy"
									alt="Splash for {item.displayName}"
								/>
							{:else}
								<span class="text-surface-600-400">—</span>
							{/if}
						</td>
						<td class="align-middle">
							<span class="badge {item.isActive ? 'preset-tonal-success' : 'preset-tonal-surface'}">
								{item.isActive ? 'Active' : 'Inactive'}
							</span>
						</td>
						<td class="align-middle">
							<a
								class="btn preset-tonal-primary btn-sm"
								href="/admin/resources?tab=maps&map={item.id}#map-editor"
								aria-label="Edit {item.displayName}"
							>
								<Pencil size={14} aria-hidden="true" /> Edit
							</a>
						</td>
					{/snippet}
				</CatalogTable>
			</section>
		</Tabs.Content>

		<Tabs.Content value="agents" class="pt-5">
			<section class="min-w-0" aria-label="Agents">
				<CatalogTable
					rows={data.agents}
					label="Agents"
					searchText={(item) => `${item.displayName} ${item.key} ${item.roleName ?? ''}`}
					columns={['Agent', 'Portrait', 'Role', 'Status', 'Actions']}
				>
					{#snippet actions()}
						<a
							class="btn preset-filled-primary-500"
							href="/admin/resources?tab=agents&new=agent#agent-editor"
						>
							<Plus size={16} aria-hidden="true" /> Add agent
						</a>
						<button
							class="btn preset-tonal-primary"
							type="button"
							disabled={syncing !== null}
							onclick={() => sync('agent')}
						>
							<Download size={16} aria-hidden="true" />
							{syncing === 'agent' ? 'Syncing…' : 'Sync agents'}
						</button>
					{/snippet}

					{#snippet editor()}
						{#if selectedAgent || form?.values?.kind === 'agent' || page.url.searchParams.get('new') === 'agent'}
							<section id="agent-editor" class="admin-editor" aria-label="Agent editor">
								<div class="flex items-center justify-between gap-3">
									<h3 class="h3">
										{selectedAgent || agentValues?.id ? 'Edit agent' : 'Add agent'}
									</h3>
									<a class="btn preset-tonal-surface btn-sm" href="/admin/resources?tab=agents">
										<X size={16} aria-hidden="true" /> Close
									</a>
								</div>
								<form class="grid gap-4 md:grid-cols-2" method="POST" action="?/save">
									<input type="hidden" name="kind" value="agent" />
									<input
										type="hidden"
										name="id"
										value={agentValues?.id ?? selectedAgent?.id ?? ''}
									/>
									<input
										type="hidden"
										name="revision"
										value={agentValues?.revision ?? selectedAgent?.revision ?? ''}
									/>
									<label class="block text-sm font-medium">
										Name
										<input
											class="mt-1 input w-full"
											name="displayName"
											required
											maxlength="100"
											value={agentValues?.displayName ?? selectedAgent?.displayName ?? ''}
										/>
									</label>
									<label class="block text-sm font-medium">
										Stable key
										<span class="font-normal text-surface-600-400">
											(lowercase letters, numbers, hyphens)
										</span>
										<input
											class="mt-1 input w-full"
											name="key"
											required
											pattern="[a-z0-9][a-z0-9-]*"
											maxlength="100"
											value={agentValues?.key ?? selectedAgent?.key ?? ''}
										/>
									</label>
									<label class="block text-sm font-medium">
										Role <span class="font-normal text-surface-600-400">(optional)</span>
										<input
											class="mt-1 input w-full"
											name="roleName"
											maxlength="100"
											value={agentValues?.roleName ?? selectedAgent?.roleName ?? ''}
										/>
									</label>
									<label class="flex items-center gap-2 text-sm md:col-span-2">
										<input
											type="checkbox"
											name="isActive"
											checked={agentValues
												? 'isActive' in agentValues
												: (selectedAgent?.isActive ?? true)}
										/>
										Available for selection
									</label>
									{#if selectedAgent?.fullPortraitPath}
										<img
											class="h-36 w-full rounded-base bg-surface-100-900 object-contain md:col-span-2"
											src={selectedAgent.fullPortraitPath}
											alt="{selectedAgent.displayName} portrait"
										/>
									{/if}
									<div class="md:col-span-2">
										<button class="btn preset-filled-primary-500" type="submit">Save agent</button>
									</div>
								</form>
								{#if selectedAgent}
									<form
										class="mt-4 border-t border-surface-200-800 pt-4"
										method="POST"
										action="?/delete"
									>
										<input type="hidden" name="kind" value="agent" />
										<input type="hidden" name="id" value={selectedAgent.id} />
										<input type="hidden" name="revision" value={selectedAgent.revision} />
										<button class="btn preset-tonal-error" type="submit">Delete unused agent</button
										>
									</form>
								{/if}
							</section>
						{/if}
					{/snippet}

					{#snippet row(item)}
						<td class="align-middle">
							<div class="flex items-center gap-3">
								{#if item.displayIconPath}
									<img
										class="size-10 shrink-0 rounded-base bg-surface-100-900 object-contain p-1"
										src={item.displayIconPath}
										alt=""
										width="40"
										height="40"
										loading="lazy"
									/>
								{:else}
									<span
										class="flex size-10 shrink-0 items-center justify-center rounded-base preset-tonal-primary text-xs"
										aria-hidden="true">Agent</span
									>
								{/if}
								<span class="font-semibold">{item.displayName}</span>
							</div>
						</td>
						<td class="align-middle">
							{#if item.fullPortraitPath}
								<img
									src={item.fullPortraitPath}
									class="h-16 w-16 rounded-base bg-surface-100-900 object-contain"
									width="64"
									height="64"
									loading="lazy"
									alt="Portrait for {item.displayName}"
								/>
							{:else}
								<span class="text-surface-600-400">—</span>
							{/if}
						</td>
						<td class="align-middle">
							<div class="flex items-center gap-2">
								{#if item.roleIconPath}
									<img
										class="size-8 shrink-0 object-contain"
										src={item.roleIconPath}
										alt=""
										width="32"
										height="32"
										loading="lazy"
									/>
								{/if}
								{item.roleName ?? '—'}
							</div>
						</td>
						<td class="align-middle">
							<span class="badge {item.isActive ? 'preset-tonal-success' : 'preset-tonal-surface'}">
								{item.isActive ? 'Active' : 'Inactive'}
							</span>
						</td>
						<td class="align-middle">
							<a
								class="btn preset-tonal-primary btn-sm"
								href="/admin/resources?tab=agents&agent={item.id}#agent-editor"
								aria-label="Edit {item.displayName}"
							>
								<Pencil size={14} aria-hidden="true" /> Edit
							</a>
						</td>
					{/snippet}
				</CatalogTable>
			</section>
		</Tabs.Content>

		<Tabs.Content value="weapons" class="pt-5">
			<section class="min-w-0" aria-label="Weapons">
				<CatalogTable
					rows={data.weapons}
					label="Weapons"
					searchText={(item) => `${item.displayName} ${item.key} ${item.category ?? ''}`}
					columns={['Weapon', 'Killfeed', 'Category', 'Status', 'Actions']}
				>
					{#snippet actions()}
						<a
							class="btn preset-filled-primary-500"
							href="/admin/resources?tab=weapons&new=weapon#weapon-editor"
						>
							<Plus size={16} aria-hidden="true" /> Add weapon
						</a>
						<button
							class="btn preset-tonal-primary"
							type="button"
							disabled={syncing !== null}
							onclick={() => sync('weapon')}
						>
							<Download size={16} aria-hidden="true" />
							{syncing === 'weapon' ? 'Syncing…' : 'Sync weapons'}
						</button>
					{/snippet}

					{#snippet editor()}
						{#if selectedWeapon || form?.values?.kind === 'weapon' || page.url.searchParams.get('new') === 'weapon'}
							<section id="weapon-editor" class="admin-editor" aria-label="Weapon editor">
								<div class="flex items-center justify-between gap-3">
									<h3 class="h3">
										{selectedWeapon || weaponValues?.id ? 'Edit weapon' : 'Add weapon'}
									</h3>
									<a class="btn preset-tonal-surface btn-sm" href="/admin/resources?tab=weapons">
										<X size={16} aria-hidden="true" /> Close
									</a>
								</div>
								<form class="grid gap-4 md:grid-cols-2" method="POST" action="?/save">
									<input type="hidden" name="kind" value="weapon" />
									<input
										type="hidden"
										name="id"
										value={weaponValues?.id ?? selectedWeapon?.id ?? ''}
									/>
									<input
										type="hidden"
										name="revision"
										value={weaponValues?.revision ?? selectedWeapon?.revision ?? ''}
									/>
									<label class="block text-sm font-medium">
										Name
										<input
											class="mt-1 input w-full"
											name="displayName"
											required
											maxlength="100"
											value={weaponValues?.displayName ?? selectedWeapon?.displayName ?? ''}
										/>
									</label>
									<label class="block text-sm font-medium">
										Stable key
										<span class="font-normal text-surface-600-400">
											(lowercase letters, numbers, hyphens)
										</span>
										<input
											class="mt-1 input w-full"
											name="key"
											required
											pattern="[a-z0-9][a-z0-9-]*"
											maxlength="100"
											value={weaponValues?.key ?? selectedWeapon?.key ?? ''}
										/>
									</label>
									<label class="block text-sm font-medium">
										Category <span class="font-normal text-surface-600-400">(optional)</span>
										<input
											class="mt-1 input w-full"
											name="category"
											maxlength="100"
											value={weaponValues?.category ?? selectedWeapon?.category ?? ''}
										/>
									</label>
									<label class="flex items-center gap-2 text-sm md:col-span-2">
										<input
											type="checkbox"
											name="isActive"
											checked={weaponValues
												? 'isActive' in weaponValues
												: (selectedWeapon?.isActive ?? true)}
										/>
										Available for selection
									</label>
									{#if selectedWeapon?.displayIconPath}
										<img
											class="h-24 w-full rounded-base bg-surface-100-900 object-contain p-3 md:col-span-2"
											src={selectedWeapon.displayIconPath}
											alt={selectedWeapon.displayName}
										/>
									{/if}
									<div class="md:col-span-2">
										<button class="btn preset-filled-primary-500" type="submit">Save weapon</button>
									</div>
								</form>
								{#if selectedWeapon}
									<form
										class="mt-4 border-t border-surface-200-800 pt-4"
										method="POST"
										action="?/delete"
									>
										<input type="hidden" name="kind" value="weapon" />
										<input type="hidden" name="id" value={selectedWeapon.id} />
										<input type="hidden" name="revision" value={selectedWeapon.revision} />
										<button class="btn preset-tonal-error" type="submit"
											>Delete unused weapon</button
										>
									</form>
								{/if}
							</section>
						{/if}
					{/snippet}

					{#snippet row(item)}
						<td class="align-middle">
							<div class="flex items-center gap-3">
								{#if item.displayIconPath}
									<img
										class="h-10 w-28 shrink-0 rounded-base bg-surface-100-900 object-contain p-1"
										src={item.displayIconPath}
										alt=""
										width="112"
										height="40"
										loading="lazy"
									/>
								{:else}
									<span
										class="flex h-10 w-28 shrink-0 items-center justify-center rounded-base preset-tonal-primary text-xs"
										aria-hidden="true">Weapon</span
									>
								{/if}
								<span class="font-semibold">{item.displayName}</span>
							</div>
						</td>
						<td class="align-middle">
							{#if item.killStreamIconPath}
								<img
									class="h-8 w-24 object-contain"
									src={item.killStreamIconPath}
									alt="Killfeed icon for {item.displayName}"
									width="96"
									height="32"
									loading="lazy"
								/>
							{:else}
								<span class="text-surface-600-400">—</span>
							{/if}
						</td>
						<td class="align-middle">{item.category ?? '—'}</td>
						<td class="align-middle">
							<span class="badge {item.isActive ? 'preset-tonal-success' : 'preset-tonal-surface'}">
								{item.isActive ? 'Active' : 'Inactive'}
							</span>
						</td>
						<td class="align-middle">
							<a
								class="btn preset-tonal-primary btn-sm"
								href="/admin/resources?tab=weapons&weapon={item.id}#weapon-editor"
								aria-label="Edit {item.displayName}"
							>
								<Pencil size={14} aria-hidden="true" /> Edit
							</a>
						</td>
					{/snippet}
				</CatalogTable>
			</section>
		</Tabs.Content>
	</Tabs>
</div>
