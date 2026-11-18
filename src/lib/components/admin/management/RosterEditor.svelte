<script lang="ts">
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
	const matches = $derived(
		players
			.filter((player) => !player.archivedAt || playerIds.includes(player.id))
			.filter((player) =>
				[player.displayName, player.fullName, player.riotId, player.id].some((value) =>
					value?.toLowerCase().includes(search.trim().toLowerCase())
				)
			)
			.map((player) => ({
				...player,
				teamName: assignments.find((row) => row.playerId === player.id)?.teamName
			}))
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
			<div class="grid gap-4 lg:grid-cols-2">
				<div class="space-y-2">
					<label class="label">
						<span class="label-text">Search players</span>
						<!-- Enter would submit the roster form; ticking is the only way to pick. -->
						<input
							type="search"
							class="input"
							placeholder="Search name, Riot ID, or player ID…"
							bind:value={search}
							onkeydown={(event) => event.key === 'Enter' && event.preventDefault()}
						/>
					</label>
					<ul
						aria-label="Matching players"
						class="max-h-96 space-y-1 overflow-y-auto rounded-base border border-surface-200-800 p-1"
					>
						{#each matches as player (player.id)}
							<li>
								<label
									class="flex cursor-pointer items-center gap-3 rounded-base p-2 hover:preset-tonal has-disabled:cursor-not-allowed has-disabled:opacity-50"
								>
									<input
										type="checkbox"
										class="checkbox"
										checked={draft.playerIds.includes(player.id)}
										disabled={!!player.teamName || pending}
										onchange={(event) =>
											(draft.playerIds = event.currentTarget.checked
												? [...draft.playerIds, player.id]
												: draft.playerIds.filter((id) => id !== player.id))}
									/>
									{#if player.portraitPath}<img
											src={player.portraitPath}
											alt=""
											class="size-10 rounded-base object-cover"
										/>{/if}
									<span class="min-w-0 flex-1">
										<span class="block">{player.displayName}</span>
										<span class="block text-xs text-surface-600-400">
											{[player.fullName, player.riotId, player.id].filter(Boolean).join(' · ')}
										</span>
										{#if player.teamName}<span class="block text-xs"
												>Assigned to {player.teamName}</span
											>{/if}
										{#if player.archivedAt}<span class="block text-xs">Archived</span>{/if}
									</span>
								</label>
							</li>
						{:else}<li class="p-3 text-sm">No matching players.</li>{/each}
					</ul>
				</div>
				<ul aria-label="Selected players" class="grid content-start gap-2 sm:grid-cols-2">
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
							No players selected. Tick players on the left to add them.
						</li>{/each}
				</ul>
			</div>
			<button class="btn preset-filled-primary-500" disabled={pending} type="submit"
				>Save roster</button
			>
		</fieldset>
	{/snippet}
</ManagementForm>
