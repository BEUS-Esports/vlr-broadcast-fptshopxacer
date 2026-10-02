<script lang="ts">
	import ManagementForm from '../management/ManagementForm.svelte';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
	import type { GraphicsControlData } from './GraphicsWorkspace.svelte';
	let {
		data,
		live,
		connection
	}: { data: GraphicsControlData; live: BroadcastSnapshot; connection: string } = $props();
	const locked = $derived(Object.values(live.controls.visibility).some(Boolean));
	const selectionInitial = $derived({
		expectedRevision: live.controlRevision,
		tournamentId: live.selection?.tournamentId ?? '',
		matchId: live.selection?.matchId ?? '',
		gameId: live.selection?.gameId ?? ''
	});
	const swapped = $derived(
		!!live.selection && live.presentation.leftEntryId === live.competition.teamBEntryId
	);
	const sidesInitial = $derived({
		expectedRevision: live.controlRevision,
		currentAttackersEntryId:
			live.sides.source === 'manual' ? (live.sides.attackersEntryId ?? '') : ''
	});
	const teamName = (id: string | null) =>
		live.teams.find((team) => team.entryId === id)?.name ?? 'Unknown';
</script>

<section aria-label="Global Setup" class="admin-editor space-y-4">
	<h2 class="h2">Global Setup</h2>
	<p aria-label="Broadcast connection" role="status">
		Connection: {connection} · Control revision {live.controlRevision} · Data revision {live.dataRevision}
	</p>
	{#if locked}<p role="status" class="text-warning-600-400">
			Hide all shown graphics before changing or clearing the live selection.
		</p>{/if}
	<section aria-label="On air" class="space-y-2">
		<h2 class="h3">On air</h2>
		{#if live.selection}
			<p class="font-semibold">
				{live.tournament?.name} · {live.match?.label} · Game {live.game?.number}: {live.game?.name} ·
				{live.game?.map?.displayName ?? 'Unknown map'}
			</p>
			<p>
				Team A: {teamName(live.competition.teamAEntryId)} · Team B: {teamName(
					live.competition.teamBEntryId
				)}
			</p>
			<p>
				Left: {teamName(live.presentation.leftEntryId)} · Right: {teamName(
					live.presentation.rightEntryId
				)}
			</p>
			<p>
				<span class="text-blue-600-400">Attackers: {teamName(live.sides.attackersEntryId)}</span> ·
				<span class="text-red-600-400">Defenders: {teamName(live.sides.defendersEntryId)}</span>
				· {live.sides.source}
			</p>
		{:else}<p>No game selected. Choose saved preparation below.</p>{/if}
		<ul aria-label="Preparation readiness" class="flex flex-wrap gap-3 text-sm">
			{#each Object.entries(live.readiness) as [name, ready] (name)}<li>
					{name}: {ready ? 'Ready' : 'Missing'}
				</li>{/each}
		</ul>
	</section>
	<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
		<section aria-label="Live game selection" class="space-y-3">
			<h2 class="h3">Select game</h2>
			<ManagementForm
				action="/admin/graphics?/select"
				recordDraft={false}
				changesContext
				initial={selectionInitial}
			>
				{#snippet children(draft)}
					<div class="grid gap-4 md:grid-cols-3">
						<label class="label"
							><span>Tournament</span><select
								class="select"
								bind:value={draft.tournamentId}
								disabled={locked}
								onchange={() => {
									draft.matchId = '';
									draft.gameId = '';
								}}
								><option value="">Choose tournament</option
								>{#each data.tournamentOptions as tournament (tournament.id)}<option
										value={tournament.id}>{tournament.name}</option
									>{/each}</select
							></label
						>
						<label class="label"
							><span>Match</span><select
								class="select"
								bind:value={draft.matchId}
								disabled={locked || !draft.tournamentId}
								onchange={() => {
									draft.gameId = '';
								}}
								><option value="">Choose match</option
								>{#each data.matchOptions.filter((match) => match.tournamentId === draft.tournamentId) as match (match.id)}<option
										value={match.id}>{match.label}</option
									>{/each}</select
							></label
						>
						<label class="label"
							><span>Game</span><select
								class="select"
								bind:value={draft.gameId}
								disabled={locked || !draft.matchId}
								><option value="">Choose game</option
								>{#each data.gameOptions.filter((game) => game.matchId === draft.matchId) as game (game.id)}<option
										value={game.id}>Game {game.number}: {game.name}</option
									>{/each}</select
							></label
						>
					</div>
					<p class="text-sm">Selection draft · based on revision {draft.expectedRevision}</p>
					<button
						class="btn preset-filled-primary-500"
						disabled={locked ||
							!draft.tournamentId ||
							!draft.matchId ||
							!data.gameOptions.some(
								(game) => game.id === draft.gameId && game.matchId === draft.matchId
							)}>Take game live</button
					>
				{/snippet}
			</ManagementForm>
			<ManagementForm
				action="/admin/graphics?/clear"
				recordDraft={false}
				changesContext
				initial={{ expectedRevision: live.controlRevision }}
			>
				<button class="btn preset-tonal-error" disabled={locked || !live.selection}
					>Clear live selection</button
				>
			</ManagementForm>
		</section>
		<section aria-label="Presentation controls" class="space-y-3">
			<h2 class="h3">Presentation and current side</h2>
			<p>Screen positions: {swapped ? 'B-left / A-right' : 'A-left / B-right'}</p>
			<ManagementForm
				action="/admin/graphics?/controls"
				recordDraft={false}
				initial={{ expectedRevision: live.controlRevision, swapped: !swapped }}
			>
				<button type="submit" class="btn preset-tonal-primary" disabled={!live.selection}
					>Swap Left/Right</button
				>
			</ManagementForm>
			<ManagementForm action="/admin/graphics?/controls" recordDraft={false} initial={sidesInitial}>
				{#snippet children(draft)}
					<label class="label"
						><span>Current attackers</span><select
							class="select"
							bind:value={draft.currentAttackersEntryId}
							disabled={!live.selection}
							><option value="">Use prepared starting sides</option
							>{#each live.teams.filter( (team) => [live.competition.teamAEntryId, live.competition.teamBEntryId].includes(team.entryId) ) as team (team.entryId)}<option
									value={team.entryId}>{team.name}</option
								>{/each}</select
						></label
					>
					<p class="text-sm">
						Manual current sides change colors. Screen positions and saved starting sides are
						independent.
					</p>
					<button type="submit" class="btn preset-filled-primary-500" disabled={!live.selection}
						>Save presentation</button
					>
				{/snippet}
			</ManagementForm>
		</section>
	</div>
</section>
