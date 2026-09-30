<script lang="ts">
	import { Combobox, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import ManagementForm from './ManagementForm.svelte';
	let {
		entryId,
		revision,
		playerIds,
		players,
		assignments,
		disabled = false
	}: {
		entryId: string;
		revision: number;
		playerIds: string[];
		players: Array<{
			id: string;
			displayName: string;
			fullName?: string | null;
			riotId?: string | null;
			portraitPath?: string | null;
			archivedAt: Date | null;
		}>;
		assignments: Array<{ playerId: string; teamName: string }>;
		disabled?: boolean;
	} = $props();
	let search = $state('');
	const collection = $derived(
		useListCollection({
			items: players
				.filter((player) => !player.archivedAt || playerIds.includes(player.id))
				.filter((player) =>
					[player.displayName, player.fullName, player.riotId, player.id].some((value) =>
						value?.toLowerCase().includes(search.trim().toLowerCase())
					)
				)
				.map((player) => ({
					...player,
					teamName: assignments.find((row) => row.playerId === player.id)?.teamName
				})),
			itemToValue: (player) => player.id,
			itemToString: (player) => player.displayName,
			isItemDisabled: (player) => !!player.teamName
		})
	);
</script>

<ManagementForm
	action="?/roster"
	initial={{ entryId, expectedTournamentRevision: revision, playerIds }}
>
	{#snippet children(draft, pending)}
		<fieldset {disabled} class="space-y-3">
			<legend class="font-semibold">Available players ({draft.playerIds.length})</legend>
			<p class="text-sm text-surface-600-400">
				Each player can join one team in this tournament. Roster changes preserve saved game
				lineups.
			</p>
			<Combobox
				{collection}
				multiple
				value={draft.playerIds}
				inputValue={search}
				disabled={disabled || pending}
				onInputValueChange={(details) => (search = details.inputValue)}
				onValueChange={(details) => {
					draft.playerIds = details.value;
					search = '';
				}}
			>
				<Combobox.Label>Search players</Combobox.Label>
				<Combobox.Control>
					<Combobox.Input placeholder="Search name, Riot ID, or player ID…" />
					<Combobox.Trigger aria-label="Show players">▾</Combobox.Trigger>
				</Combobox.Control>
				<Combobox.Positioner>
					<Combobox.Content class="z-10 max-h-64 overflow-y-auto">
						{#each collection.items as player (player.id)}
							<Combobox.Item item={player} class="gap-3 data-disabled:opacity-50">
								{#if player.portraitPath}<img
										src={player.portraitPath}
										alt=""
										class="size-10 rounded-base object-cover"
									/>{/if}
								<div class="min-w-0 flex-1">
									<Combobox.ItemText>{player.displayName}</Combobox.ItemText>
									<p class="text-xs text-surface-600-400">
										{[player.fullName, player.riotId, player.id].filter(Boolean).join(' · ')}
									</p>
									{#if player.teamName}<p class="text-xs">Assigned to {player.teamName}</p>{/if}
									{#if player.archivedAt}<p class="text-xs">Archived</p>{/if}
								</div>
								<Combobox.ItemIndicator>✓</Combobox.ItemIndicator>
							</Combobox.Item>
						{:else}<li class="p-3 text-sm">No matching players.</li>{/each}
					</Combobox.Content>
				</Combobox.Positioner>
			</Combobox>
			<ul aria-label="Selected players" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each draft.playerIds as playerId (playerId)}
					{@const player = players.find((row) => row.id === playerId)}
					{@const assignment = assignments.find((row) => row.playerId === playerId)}
					<li class="flex items-center gap-3 rounded-base border border-surface-200-800 p-3">
						{#if player?.portraitPath}<img
								src={player.portraitPath}
								alt=""
								class="size-12 rounded-base object-cover"
							/>{/if}
						<div class="min-w-0 flex-1 break-words">
							<p class="font-medium">{player?.displayName ?? playerId}</p>
							<p class="text-xs text-surface-600-400">
								{[player?.fullName, player?.riotId, playerId].filter(Boolean).join(' · ')}
							</p>
							{#if player?.archivedAt}<p class="text-xs">Archived</p>{/if}
							{#if assignment}<p class="text-xs text-error-600-400">
									Also assigned to {assignment.teamName}. Remove from one roster before saving.
								</p>{/if}
						</div>
						<button
							type="button"
							class="btn preset-tonal-surface btn-sm"
							aria-label={`Remove ${player?.displayName ?? playerId} (${playerId})`}
							onclick={() => (draft.playerIds = draft.playerIds.filter((id) => id !== playerId))}
							>Remove</button
						>
					</li>
				{:else}<li class="text-sm text-surface-600-400">
						No players selected. Search above to add players.
					</li>{/each}
			</ul>
			<button class="btn preset-filled-primary-500" disabled={pending} type="submit"
				>Save roster</button
			>
		</fieldset>
	{/snippet}
</ManagementForm>
