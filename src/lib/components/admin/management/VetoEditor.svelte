<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';
	import type { VetoActionInput, VetoConflictPreview } from '#lib/server/services/vetoes.ts';
	let {
		matchId,
		revision,
		bestOf,
		teamAEntryId,
		actions,
		entries,
		maps,
		disabled = false
	}: {
		matchId: string;
		revision: number;
		bestOf: number;
		teamAEntryId: string;
		actions: VetoActionInput[];
		entries: Array<{ id: string; name: string }>;
		maps: Array<{ id: string; displayName: string }>;
		disabled?: boolean;
	} = $props();
	type Row = VetoActionInput & { key: string };
	const teamBEntryId = $derived(entries.find((entry) => entry.id !== teamAEntryId)?.id);
	function presetActions(upperBracketEntryId?: string): Row[] {
		if (!teamBEntryId) return [];
		const types: VetoActionInput['action'][] =
			bestOf === 1
				? ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider']
				: bestOf === 3
					? ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider']
					: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'];
		const gameNumbers =
			bestOf === 1
				? [null, null, null, null, null, null, 1]
				: bestOf === 3
					? [null, null, 1, 2, null, null, 3]
					: [null, null, 1, 2, 3, 4, 5];
		const actors = upperBracketEntryId
			? [
					upperBracketEntryId,
					upperBracketEntryId,
					teamAEntryId,
					teamBEntryId,
					teamAEntryId,
					teamBEntryId,
					null
				]
			: [teamAEntryId, teamBEntryId, teamAEntryId, teamBEntryId, teamAEntryId, teamBEntryId, null];
		return actors.map((actingEntryId, index) => ({
			key: crypto.randomUUID(),
			action: types[index],
			mapId: '',
			actingEntryId,
			gameNumber: gameNumbers[index],
			sideChooserEntryId: null,
			sideChoice: null
		}));
	}
	function fillDraft(
		draft: {
			actions: Row[];
			applyToDraftGames: Array<{ gameId: string; expectedGameRevision: number }>;
		},
		upperBracketEntryId?: string
	) {
		if (
			draft.actions.length &&
			!window.confirm(
				'Replace the current veto draft with this order? Saved actions stay unchanged until you save.'
			)
		)
			return;
		draft.actions = presetActions(upperBracketEntryId);
		draft.applyToDraftGames = [];
	}
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
	This edits the entire match. Standard map vetoes start with Team A; the upper bracket team may ban
	twice first in a grand final. Every action remains editable.
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
			{#if bestOf === 2}
				<p class="text-sm text-surface-600-400">
					No map veto preset for BO2; enter actions manually.
				</p>
			{:else if teamBEntryId}
				<section class="space-y-2" aria-label="Veto order presets">
					<p class="text-sm text-surface-600-400">
						Fill the seven-map veto order, then choose maps and side selections. Side choices stay
						unknown until entered. Refill only replaces this draft after confirmation.
					</p>
					{#if maps.length !== 7}
						<p class="text-sm text-warning-600-400">
							The preset needs exactly seven maps in the tournament pool.
						</p>
					{/if}
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="btn preset-tonal-primary"
							disabled={maps.length !== 7}
							onclick={() => fillDraft(draft)}>Fill Map Veto</button
						>
						{#if bestOf === 5}
							<button
								type="button"
								class="btn preset-tonal-primary"
								disabled={maps.length !== 7}
								onclick={() => fillDraft(draft, teamAEntryId)}
								>Fill Grand Final (Upper Bracket Team A)</button
							>
							<button
								type="button"
								class="btn preset-tonal-primary"
								disabled={maps.length !== 7}
								onclick={() => fillDraft(draft, teamBEntryId)}
								>Fill Grand Final (Upper Bracket Team B)</button
							>
						{/if}
					</div>
					{#if bestOf === 1}<p class="text-sm text-surface-600-400">
							Team A chooses the side for the decider.
						</p>
					{:else if bestOf === 3}<p class="text-sm text-surface-600-400">
							Side choosers: Team B for Game 1; Team A for Games 2 and 3.
						</p>
					{:else}<p class="text-sm text-surface-600-400">
							Side choosers: Team B for Games 1, 3, and 5; Team A for Games 2 and 4.
						</p>{/if}
				</section>
			{/if}
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
							actingEntryId: teamAEntryId,
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
