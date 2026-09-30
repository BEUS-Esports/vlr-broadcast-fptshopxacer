<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';
	import type { VetoActionInput, VetoConflictPreview } from '#lib/server/services/vetoes.ts';
	let {
		matchId,
		revision,
		bestOf,
		actions,
		entries,
		maps,
		disabled = false
	}: {
		matchId: string;
		revision: number;
		bestOf: number;
		actions: VetoActionInput[];
		entries: Array<{ id: string; name: string }>;
		maps: Array<{ id: string; displayName: string }>;
		disabled?: boolean;
	} = $props();
	type Row = VetoActionInput & { key: string };
	function move(rows: Row[], index: number, direction: number) {
		const next = [...rows];
		[next[index], next[index + direction]] = [next[index + direction], next[index]];
		return next;
	}
	function preview(
		feedback: Record<string, unknown> | null,
		actions: Row[]
	): VetoConflictPreview[] {
		const submitted = (feedback?.draft as { actions?: Row[] } | undefined)?.actions;
		if (JSON.stringify(submitted) !== JSON.stringify(actions)) return [];
		const details = feedback?.details as { conflicts?: VetoConflictPreview[] } | undefined;
		return details?.conflicts ?? [];
	}
</script>

<p class="mb-4 text-sm text-surface-600-400">
	This edits the entire match. Picks may be assigned before games exist; action order does not
	alternate teams automatically.
</p>
<ManagementForm
	action="?/veto"
	initial={{
		matchId,
		expectedMatchRevision: revision,
		actions: actions.map((row, index): Row => ({ ...row, key: row.id ?? String(index) })),
		applyToDraftGames: [] as Array<{ gameId: string; expectedGameRevision: number }>
	}}
>
	{#snippet children(draft, pending, feedback)}
		<fieldset
			{disabled}
			class="space-y-4"
			oninput={(event) => {
				if (event.target instanceof HTMLSelectElement) draft.applyToDraftGames = [];
			}}
		>
			{#each draft.actions as row, index (row.key)}
				<section
					class="space-y-3 rounded-base border border-surface-200-800 p-4"
					aria-label={`Veto action ${index + 1}`}
				>
					<div class="flex flex-wrap items-center gap-2">
						<h3 class="mr-auto font-semibold">Action {index + 1}</h3>
						<button
							type="button"
							class="btn preset-tonal-surface btn-sm"
							aria-label={`Move action ${index + 1} up`}
							disabled={index === 0}
							onclick={() => {
								draft.actions = move(draft.actions, index, -1);
								draft.applyToDraftGames = [];
							}}>Move up</button
						><button
							type="button"
							class="btn preset-tonal-surface btn-sm"
							aria-label={`Move action ${index + 1} down`}
							disabled={index === draft.actions.length - 1}
							onclick={() => {
								draft.actions = move(draft.actions, index, 1);
								draft.applyToDraftGames = [];
							}}>Move down</button
						><button
							type="button"
							class="btn preset-tonal-error btn-sm"
							aria-label={`Remove action ${index + 1}`}
							onclick={() => {
								draft.actions = draft.actions.filter((_, i) => i !== index);
								draft.applyToDraftGames = [];
							}}>Remove</button
						>
					</div>
					<div class="grid gap-3 md:grid-cols-3">
						<label class="block"
							>Action {index + 1} type<select
								class="select mt-1 w-full"
								bind:value={row.action}
								onchange={() => {
									if (row.action === 'ban') {
										row.gameNumber = null;
										row.sideChooserEntryId = null;
										row.sideChoice = null;
									}
								}}
								><option value="ban">Ban</option><option value="pick">Pick</option><option
									value="decider">Decider</option
								></select
							></label
						>
						<label class="block"
							>Action {index + 1} map<select
								class="select mt-1 w-full"
								required
								bind:value={row.mapId}
								onchange={(event) => {
									for (const later of draft.actions.slice(index + 1)) {
										if (later.mapId === event.currentTarget.value) later.mapId = '';
									}
								}}
								><option value="">Choose map</option>{#each maps.filter((map) => !draft.actions
											.slice(0, index)
											.some((earlier) => earlier.mapId === map.id)) as map (map.id)}<option
										value={map.id}>{map.displayName}</option
									>{/each}</select
							></label
						>
						<label class="block"
							>Action {index + 1} acting team<select
								class="select mt-1 w-full"
								bind:value={row.actingEntryId}
								><option value={null}>Neutral decider</option
								>{#each entries as entry (entry.id)}<option value={entry.id}>{entry.name}</option
									>{/each}</select
							></label
						>
						<label class="block"
							>Action {index + 1} game<select
								class="select mt-1 w-full"
								bind:value={row.gameNumber}
								disabled={row.action === 'ban'}
								><option value={null}>Unassigned</option
								>{#each Array.from({ length: bestOf }, (_, i) => i + 1) as number (number)}<option
										value={number}>Game {number}</option
									>{/each}</select
							></label
						>
						<label class="block"
							>Action {index + 1} side chooser<select
								class="select mt-1 w-full"
								bind:value={row.sideChooserEntryId}
								disabled={row.action === 'ban'}
								><option value={null}>Unknown</option>{#each entries as entry (entry.id)}<option
										value={entry.id}>{entry.name}</option
									>{/each}</select
							></label
						>
						<label class="block"
							>Action {index + 1} starting side<select
								class="select mt-1 w-full"
								bind:value={row.sideChoice}
								disabled={row.action === 'ban'}
								><option value={null}>Unknown</option><option value="attack">Attack</option><option
									value="defense">Defense</option
								></select
							></label
						>
					</div>
				</section>
			{:else}<p>No veto actions yet. Add a ban, pick, or decider.</p>{/each}
			<button
				type="button"
				class="btn preset-tonal-primary"
				onclick={() => {
					draft.actions = [
						...draft.actions,
						{
							key: crypto.randomUUID(),
							action: 'pick',
							mapId: '',
							actingEntryId: entries[0]?.id ?? null,
							gameNumber: null,
							sideChooserEntryId: null,
							sideChoice: null
						}
					];
					draft.applyToDraftGames = [];
				}}>Add veto action</button
			>
			{#if preview(feedback, draft.actions).length}
				<section
					class="space-y-3 rounded-base border border-warning-500 p-4"
					aria-label="Veto conflict preview"
				>
					<h3 class="font-semibold">Affected games</h3>
					{#each preview(feedback, draft.actions) as conflict (conflict.gameId)}
						<div>
							<a class="underline" href={`/admin/games/${conflict.gameId}`}
								>{conflict.name} (Game {conflict.number})</a
							>
							<p>{conflict.reason}</p>
							<p>
								Proposed map: {maps.find((map) => map.id === conflict.proposed.mapId)
									?.displayName ?? 'Keep existing'}; attackers: {entries.find(
									(entry) => entry.id === conflict.proposed.startingAttackersEntryId
								)?.name ?? 'Keep existing'}; defenders: {entries.find(
									(entry) => entry.id === conflict.proposed.startingDefendersEntryId
								)?.name ?? 'Keep existing'}.
							</p>
							{#if conflict.terminal}<p class="font-semibold">
									Reopen this game before applying veto changes.
								</p>{:else if !conflict.resolvable}<p class="font-semibold">
									Remove its old assignment and save first, then change the game’s map before adding
									this ban.
								</p>{/if}
						</div>
					{/each}
					{#if preview(feedback, draft.actions).every((row) => !row.terminal && row.resolvable)}<label
							class="flex items-center gap-2"
							><input
								type="checkbox"
								class="checkbox"
								checked={draft.applyToDraftGames.length > 0}
								onchange={(event) => {
									draft.applyToDraftGames = event.currentTarget.checked
										? preview(feedback, draft.actions).map(({ gameId, expectedGameRevision }) => ({
												gameId,
												expectedGameRevision
											}))
										: [];
								}}
							/>Apply to affected draft games</label
						>{/if}
				</section>
			{/if}
			<div>
				<button type="submit" class="btn preset-filled-primary-500" disabled={pending}
					>Save match veto</button
				>
			</div>
		</fieldset>
	{/snippet}
</ManagementForm>
