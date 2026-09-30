<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';
	let {
		entryId,
		revision,
		playerIds,
		players,
		disabled = false
	}: {
		entryId: string;
		revision: number;
		playerIds: string[];
		players: Array<{ id: string; displayName: string; archivedAt: Date | null }>;
		disabled?: boolean;
	} = $props();
</script>

<ManagementForm
	action="?/roster"
	initial={{ entryId, expectedTournamentRevision: revision, playerIds }}
>
	{#snippet children(draft, pending)}
		<fieldset {disabled} class="space-y-3">
			<legend class="font-semibold">Available players ({draft.playerIds.length})</legend>
			<p class="text-sm text-surface-600-400">
				Roster changes preserve saved game lineups. Select any number of players.
			</p>
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each players.filter((player) => !player.archivedAt || playerIds.includes(player.id)) as player (player.id)}
					<label class="flex items-center gap-2 rounded-base border border-surface-200-800 p-3">
						<input
							class="checkbox"
							type="checkbox"
							checked={draft.playerIds.includes(player.id)}
							onchange={(event) => {
								draft.playerIds = event.currentTarget.checked
									? [...draft.playerIds, player.id]
									: draft.playerIds.filter((id) => id !== player.id);
							}}
						/>
						<span
							>{player.displayName}
							<small class="text-surface-600-400"
								>({player.id}){player.archivedAt ? ' · Archived' : ''}</small
							></span
						>
					</label>
				{/each}
			</div>
			<button class="btn preset-filled-primary-500" disabled={pending} type="submit"
				>Save roster</button
			>
		</fieldset>
	{/snippet}
</ManagementForm>
