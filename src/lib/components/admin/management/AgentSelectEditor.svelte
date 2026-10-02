<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';

	let {
		revision,
		entries,
		lineup,
		players,
		agents,
		action = '?/agents',
		disabled = false
	}: {
		revision: number;
		entries: Array<{ id: string; name: string }>;
		lineup: Array<{
			entryId: string;
			playerId: string | null;
			slot: number;
			agentId: string | null;
		}>;
		players: Array<{ id: string; displayName: string }>;
		agents: Array<{ id: string; displayName: string; isActive: boolean }>;
		action?: string;
		disabled?: boolean;
	} = $props();
	const savedPlayers = $derived(
		lineup.filter((row) => row.playerId).sort((a, b) => a.slot - b.slot)
	);
</script>

<ManagementForm
	{action}
	initial={{
		expectedGameRevision: revision,
		entries,
		agentNames: Object.fromEntries(agents.map((agent) => [agent.id, agent.displayName])),
		players: savedPlayers.map((row) => ({
			playerId: row.playerId!,
			entryId: row.entryId,
			agentId: row.agentId ?? ''
		})),
		identity: savedPlayers.map((row) => ({
			playerId: row.playerId!,
			slot: row.slot,
			name: players.find((player) => player.id === row.playerId)?.displayName ?? row.playerId!,
			agentId: row.agentId,
			agentName: agents.find((agent) => agent.id === row.agentId)?.displayName ?? row.agentId
		}))
	}}
>
	{#snippet children(draft, pending)}
		{#if !draft.players.length}
			<p>Save lineup players before selecting agents.</p>
		{:else}
			<fieldset disabled={disabled || pending} class="space-y-5">
				<legend class="sr-only">Saved lineup agent assignments</legend>
				<p class="text-sm text-surface-600-400">
					Unknown is allowed during preparation. Agent selections stay with the saved player and
					team.
				</p>
				{#each draft.entries as entry, teamIndex (entry.id)}
					<section class="space-y-3" aria-label={`Team ${teamIndex === 0 ? 'A' : 'B'} agents`}>
						<h3 class="h4">Team {teamIndex === 0 ? 'A' : 'B'} · {entry.name}</h3>
						{#each draft.players.filter((row) => row.entryId === entry.id) as row (row.playerId)}
							{@const saved = draft.identity.find((player) => player.playerId === row.playerId)!}
							{@const name = saved.name}
							<label class="grid gap-2 sm:grid-cols-2">
								<span>Slot {saved.slot} · {name}</span>
								<select
									class="select w-full"
									aria-label={`${name} Agent`}
									bind:value={row.agentId}
									onchange={(event) => {
										const selected = agents.find((agent) => agent.id === event.currentTarget.value);
										if (selected) draft.agentNames[selected.id] = selected.displayName;
									}}
								>
									<option value="">Unknown</option>
									{#each agents.filter((agent) => agent.isActive) as agent (agent.id)}
										<option value={agent.id}>{agent.displayName}</option>
									{/each}
									{#if saved.agentId && !agents.some((agent) => agent.isActive && agent.id === saved.agentId)}
										<option value={saved.agentId}>{saved.agentName} · Historical</option>
									{/if}
									{#if row.agentId && row.agentId !== saved.agentId && !agents.some((agent) => agent.isActive && agent.id === row.agentId)}
										<option value={row.agentId}
											>{draft.agentNames[row.agentId] ?? row.agentId} · Unavailable</option
										>
									{/if}
								</select>
							</label>
						{/each}
					</section>
				{/each}
				<button type="submit" class="btn preset-filled-primary-500">Save agent selections</button>
			</fieldset>
		{/if}
	{/snippet}
</ManagementForm>
