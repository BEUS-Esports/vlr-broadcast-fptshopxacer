<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';

	let {
		revision,
		selected,
		candidates,
		scope,
		disabled = false
	}: {
		revision: number;
		selected: string | null;
		candidates: Array<{ id: string; displayName: string }>;
		scope: string;
		disabled?: boolean;
	} = $props();
</script>

<section class="mt-5 space-y-3" aria-label={`${scope} MVP`}>
	<h3 class="h4">{scope} MVP</h3>
	<p class="text-sm text-surface-600-400">
		The operator selects MVP. Statistics never change this choice.
	</p>
	<ManagementForm action="?/mvp" initial={{ expectedRevision: revision, playerId: selected ?? '' }}>
		{#snippet children(draft, pending)}
			<label class="block max-w-md"
				>Player
				<select class="select mt-1 w-full" bind:value={draft.playerId} {disabled}>
					<option value="">No MVP selected</option>
					{#each candidates as candidate (candidate.id)}
						<option value={candidate.id}>{candidate.displayName}</option>
					{/each}
				</select>
			</label>
			<button type="submit" class="btn preset-filled-primary-500" disabled={pending || disabled}>
				Save {scope} MVP
			</button>
		{/snippet}
	</ManagementForm>
</section>
