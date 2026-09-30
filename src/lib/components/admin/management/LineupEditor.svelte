<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';
	let {
		revision,
		entries,
		lineup,
		roster,
		players,
		disabled = false
	}: {
		revision: number;
		entries: Array<{ id: string; name: string }>;
		lineup: Array<{ entryId: string; slot: number; playerId: string | null }>;
		roster: Array<{ entryId: string; playerId: string }>;
		players: Array<{ id: string; displayName: string; archivedAt?: Date | null }>;
		disabled?: boolean;
	} = $props();
	function current(entryId: string, playerId: string) {
		return (
			!players.find((player) => player.id === playerId)?.archivedAt &&
			roster.some((row) => row.entryId === entryId && row.playerId === playerId)
		);
	}
	function move(slots: Array<{ playerId: string | null }>, index: number, direction: number) {
		[slots[index].playerId, slots[index + direction].playerId] = [
			slots[index + direction].playerId,
			slots[index].playerId
		];
	}
</script>

<ManagementForm
	action="?/lineup"
	initial={{
		expectedGameRevision: revision,
		teams: entries.map((entry) => ({
			entryId: entry.id,
			slots: Array.from({ length: 5 }, (_, index) => ({
				slot: index + 1,
				playerId:
					lineup.find((row) => row.entryId === entry.id && row.slot === index + 1)?.playerId ?? null
			}))
		}))
	}}
>
	{#snippet children(draft, pending)}
		<fieldset disabled={disabled || pending} class="space-y-4">
			<legend class="sr-only">Game lineup selections</legend>
			<div class="grid gap-5 lg:grid-cols-2">
				{#each draft.teams as team (team.entryId)}
					{@const entry = entries.find((entry) => entry.id === team.entryId)!}
					{@const count = team.slots.filter((slot) => slot.playerId).length}
					<section
						class="space-y-3 rounded-base border border-surface-200-800 p-4"
						aria-label={`${entry.name} lineup`}
					>
						<h3 class="h4">{entry.name}</h3>
						<p aria-live="polite">
							{count}/5 selected{count === 5 ? ' · Ready' : ' · Incomplete draft'}
						</p>
						{#each team.slots as slot, index (slot.slot)}
							<div class="space-y-2">
								<label class="block"
									>{entry.name} slot {slot.slot}
									<select class="select mt-1 w-full" bind:value={slot.playerId}>
										<option value={null}>Empty slot</option>
										{#each players.filter((player) => current(team.entryId, player.id) || lineup.some((row) => row.entryId === team.entryId && row.playerId === player.id)) as player (player.id)}
											<option value={player.id}
												>{player.displayName} ({player.id}){current(team.entryId, player.id)
													? ''
													: ' · Historical'}</option
											>
										{/each}
									</select>
								</label>
								{#if slot.playerId && !current(team.entryId, slot.playerId)}<p
										class="text-sm text-warning-600-400"
									>
										{players.find((player) => player.id === slot.playerId)?.archivedAt
											? 'Archived player · Historical selection'
											: 'No longer on current roster'}
									</p>{/if}
								<div class="flex gap-2">
									<button
										type="button"
										class="btn preset-tonal btn-sm"
										aria-label={`${entry.name} slot ${slot.slot} Move Up`}
										disabled={index === 0}
										onclick={() => move(team.slots, index, -1)}>Move Up</button
									>
									<button
										type="button"
										class="btn preset-tonal btn-sm"
										aria-label={`${entry.name} slot ${slot.slot} Move Down`}
										disabled={index === 4}
										onclick={() => move(team.slots, index, 1)}>Move Down</button
									>
								</div>
							</div>
						{/each}
					</section>
				{/each}
			</div>
			<p class="text-sm text-surface-600-400">
				Empty slots can be saved as a draft. Changes affect only this game.
			</p>
			<button type="submit" class="btn preset-filled-primary-500">Save lineup</button>
		</fieldset>
	{/snippet}
</ManagementForm>
