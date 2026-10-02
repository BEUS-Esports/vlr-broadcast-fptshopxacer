<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';

	let {
		revision,
		selected,
		candidates,
		scope,
		action = '?/mvp',
		disabled = false
	}: {
		revision: number;
		selected: string | null;
		candidates: Array<{ id: string; displayName: string }>;
		scope: string;
		action?: string;
		disabled?: boolean;
	} = $props();
</script>

<section class="mt-5 space-y-3" aria-label={`${scope} MVP`}>
	<h3 class="h4">{scope} MVP</h3>
	<p class="text-sm text-surface-600-400">
		The operator selects MVP. Statistics never change this choice.
	</p>
	<ManagementForm
		{action}
		initial={{
			expectedRevision: revision,
			playerId: selected ?? '',
			playerNames: Object.fromEntries(
				candidates.map((candidate) => [candidate.id, candidate.displayName])
			)
		}}
	>
		{#snippet children(draft, pending)}
			<label class="block max-w-md"
				>Player
				<select
					class="select mt-1 w-full"
					bind:value={draft.playerId}
					{disabled}
					onchange={(event) => {
						const selected = candidates.find(
							(candidate) => candidate.id === event.currentTarget.value
						);
						if (selected) draft.playerNames[selected.id] = selected.displayName;
					}}
				>
					<option value="">No MVP selected</option>
					{#each candidates as candidate (candidate.id)}
						<option value={candidate.id}>{candidate.displayName}</option>
					{/each}
					{#if draft.playerId && !candidates.some((candidate) => candidate.id === draft.playerId)}
						<option value={draft.playerId}
							>{draft.playerNames[draft.playerId] ?? draft.playerId} · Unavailable</option
						>
					{/if}
				</select>
			</label>
			<button type="submit" class="btn preset-filled-primary-500" disabled={pending || disabled}>
				Save {scope} MVP
			</button>
		{/snippet}
	</ManagementForm>
</section>
