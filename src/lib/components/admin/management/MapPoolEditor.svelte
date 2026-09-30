<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';
	let {
		revision,
		mapIds,
		maps,
		disabled = false
	}: {
		revision: number;
		mapIds: string[];
		maps: Array<{
			id: string;
			displayName: string;
			isActive: boolean;
			listViewIconPath?: string | null;
		}>;
		disabled?: boolean;
	} = $props();
</script>

<ManagementForm action="?/mapPool" initial={{ expectedRevision: revision, mapIds }}>
	{#snippet children(draft, pending)}
		<fieldset {disabled} class="space-y-4">
			<legend class="h3">Tournament map pool</legend>
			<p class="text-sm text-surface-600-400">
				Maps used by games or vetoes must remain in the pool.
			</p>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each maps.filter((map) => map.isActive || mapIds.includes(map.id)) as map (map.id)}
					<label class="flex items-center gap-3 rounded-base border border-surface-200-800 p-3">
						<input
							type="checkbox"
							class="checkbox"
							checked={draft.mapIds.includes(map.id)}
							onchange={(event) => {
								draft.mapIds = event.currentTarget.checked
									? [...draft.mapIds, map.id]
									: draft.mapIds.filter((id) => id !== map.id);
							}}
						/>
						{#if map.listViewIconPath}<img
								class="h-12 w-20 rounded-base object-cover"
								src={map.listViewIconPath}
								alt=""
							/>{/if}
						<span>{map.displayName}{map.isActive ? '' : ' · Unavailable in catalogue'}</span>
					</label>
				{/each}
			</div>
			<button class="btn preset-filled-primary-500" type="submit" disabled={pending}
				>Save map pool</button
			>
		</fieldset>
	{/snippet}
</ManagementForm>
