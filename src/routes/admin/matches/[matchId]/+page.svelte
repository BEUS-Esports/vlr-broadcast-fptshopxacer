<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import ManagementForm from '#lib/components/admin/management/ManagementForm.svelte';
	import ManagementWorkspace from '#lib/components/admin/management/ManagementWorkspace.svelte';
	import VetoEditor from '#lib/components/admin/management/VetoEditor.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const tabs = [
		{ value: 'info', label: 'Info' },
		{ value: 'games', label: 'Games' },
		{ value: 'veto', label: 'Map Veto' }
	];
	const teamName = (id: string | null) =>
		data.entries.find((entry) => entry.id === id)?.name ?? 'Unknown';
	const nextNumber = $derived(
		[1, 2, 3, 4, 5].find(
			(number) => number <= data.match.bestOf && !data.games.some((game) => game.number === number)
		)
	);
	const exceptional = $derived(
		data.match.resultType === 'forfeit' ||
			data.match.resultType === 'walkover' ||
			data.match.resultType === 'cancelled'
	);
</script>

<svelte:head><title>{data.match.label} | Matches</title></svelte:head>
{#key data.match.id}
	<div class="admin-page">
		<header>
			<a
				class="text-sm text-primary-600-400 underline"
				href={`/admin/tournaments/${data.match.tournamentId}?tab=matches`}
				>← {data.tournament.name} matches</a
			>
			<h1 class="mt-2 h1">{data.match.label}</h1>
			<p class="mt-1 text-sm text-surface-600-400">
				{teamName(data.match.teamAEntryId)} vs {teamName(data.match.teamBEntryId)} · BO{data.match
					.bestOf}
			</p>
		</header>
		<ManagementWorkspace {tabs}>
			<Tabs.Content value="info" aria-label="Match information" class="space-y-5">
				<div class="admin-editor">
					<h2 class="h3">Result summary</h2>
					<p class="mt-2 text-lg font-semibold">
						{data.summary.winsA}–{data.summary.winsB} recorded game wins
					</p>
					{#if exceptional}
						<p class="mt-1">
							Match-wide {data.match.resultType}{data.match.winnerEntryId
								? ` · ${teamName(data.match.winnerEntryId)} wins`
								: ''}. Recorded games remain saved separately.
						</p>
					{:else if data.summary.state === 'completed'}
						<p class="mt-1">Series winner: {teamName(data.summary.winnerEntryId)}</p>
					{:else if data.summary.state === 'draw'}<p class="mt-1">Series drawn.</p>
					{:else}<p class="mt-1">
							Series incomplete. Draft and cancelled games do not count as wins.
						</p>{/if}
					{#if data.summary.conflicts.length}<p role="alert" class="mt-2 text-error-600-400">
							Conflicting game IDs: {data.summary.conflicts
								.map((conflict) => conflict.gameId)
								.join(', ')}
						</p>{/if}
				</div>
				<section class="admin-editor" aria-label="Match details">
					<h2 class="h3">Match details</h2>
					<ManagementForm
						action="?/save"
						initial={{
							expectedRevision: data.match.revision,
							label: data.match.label,
							bestOf: data.match.bestOf
						}}
					>
						{#snippet children(draft, pending)}
							<div class="grid gap-4 sm:grid-cols-2">
								<label class="block text-sm font-medium"
									>Label<input
										class="mt-1 input w-full"
										required
										maxlength="150"
										bind:value={draft.label}
										disabled={!!data.tournament.archivedAt}
									/></label
								>
								<label class="block text-sm font-medium"
									>Format<select
										class="select mt-1 w-full"
										bind:value={draft.bestOf}
										disabled={!!data.tournament.archivedAt}
										><option value={1}>BO1</option><option value={2}>BO2</option><option value={3}
											>BO3</option
										><option value={5}>BO5</option></select
									></label
								>
							</div>
							<p class="text-sm text-surface-600-400">
								Reopen terminal games before changing format. Every game and veto assignment must
								fit the new format.
							</p>
							<button
								class="btn preset-filled-primary-500"
								disabled={pending || !!data.tournament.archivedAt}>Save match details</button
							>
						{/snippet}
					</ManagementForm>
				</section>
				<section class="admin-editor" aria-label="Match participants">
					<h2 class="h3">Team A and Team B</h2>
					{#if data.participantBlockers.length}<p class="my-2 text-sm text-surface-600-400">
							Participants are locked by {data.participantBlockers.join(', ')}. Clear those records
							explicitly before changing team identity.
						</p>{/if}
					<ManagementForm
						action="?/participants"
						initial={{
							expectedRevision: data.match.revision,
							teamAEntryId: data.match.teamAEntryId,
							teamBEntryId: data.match.teamBEntryId
						}}
						confirmMessage="Change the stable Team A and Team B identities for this match?"
					>
						{#snippet children(draft, pending)}
							<div class="grid gap-4 sm:grid-cols-2">
								<label class="block text-sm font-medium"
									>Team A<select
										class="select mt-1 w-full"
										bind:value={draft.teamAEntryId}
										disabled={!!data.participantBlockers.length || !!data.tournament.archivedAt}
										>{#each data.entries as entry (entry.id)}<option value={entry.id}
												>{entry.name}</option
											>{/each}</select
									></label
								>
								<label class="block text-sm font-medium"
									>Team B<select
										class="select mt-1 w-full"
										bind:value={draft.teamBEntryId}
										disabled={!!data.participantBlockers.length || !!data.tournament.archivedAt}
										>{#each data.entries as entry (entry.id)}<option value={entry.id}
												>{entry.name}</option
											>{/each}</select
									></label
								>
							</div>
							<button
								class="btn preset-filled-primary-500"
								disabled={pending ||
									!!data.participantBlockers.length ||
									!!data.tournament.archivedAt}>Save participants</button
							>
						{/snippet}
					</ManagementForm>
				</section>
				<section class="admin-editor" aria-label="Match-wide outcome">
					<h2 class="h3">Match-wide outcome</h2>
					<p class="my-2 text-sm text-surface-600-400">
						Forfeit, walkover, and cancellation override the series result while keeping played
						games intact. Game results are locked until this outcome is cleared.
					</p>
					{#if exceptional}
						<ManagementForm
							action="?/clearOutcome"
							initial={{ expectedRevision: data.match.revision }}
							confirmMessage="Clear this match-wide outcome and restore the series result from saved games?"
						>
							{#snippet children(draft, pending)}<button
									class="btn preset-tonal-warning"
									disabled={pending || !draft.expectedRevision || !!data.tournament.archivedAt}
									>Clear match-wide outcome</button
								>{/snippet}
						</ManagementForm>
					{:else}
						<ManagementForm
							action="?/outcome"
							initial={{
								expectedRevision: data.match.revision,
								resultType: 'forfeit',
								winnerEntryId: data.match.teamAEntryId
							}}
							confirmMessage="Set a match-wide outcome? Existing game results will remain saved."
						>
							{#snippet children(draft, pending)}
								<div class="grid gap-4 sm:grid-cols-2">
									<label class="block text-sm font-medium"
										>Outcome<select
											class="select mt-1 w-full"
											bind:value={draft.resultType}
											disabled={!!data.tournament.archivedAt}
											><option value="forfeit">Forfeit</option><option value="walkover"
												>Walkover</option
											><option value="cancelled">Cancelled</option></select
										></label
									>
									{#if draft.resultType !== 'cancelled'}<label class="block text-sm font-medium"
											>Winner<select
												class="select mt-1 w-full"
												bind:value={draft.winnerEntryId}
												disabled={!!data.tournament.archivedAt}
												><option value={data.match.teamAEntryId}
													>{teamName(data.match.teamAEntryId)}</option
												><option value={data.match.teamBEntryId}
													>{teamName(data.match.teamBEntryId)}</option
												></select
											></label
										>{/if}
								</div>
								<button
									class="btn preset-tonal-warning"
									disabled={pending || !!data.tournament.archivedAt}
									onclick={() => {
										if (draft.resultType === 'cancelled') draft.winnerEntryId = '';
									}}>Set match-wide outcome</button
								>
							{/snippet}
						</ManagementForm>
					{/if}
				</section>
				{#if !data.games.length && !data.vetoes.length && !data.match.resultType}
					<section class="admin-editor" aria-label="Delete match">
						<h2 class="h3">Delete empty match</h2>
						<ManagementForm
							action="?/delete"
							initial={{ expectedRevision: data.match.revision }}
							confirmMessage="Permanently delete this empty match?"
						>
							{#snippet children(draft, pending)}<button
									class="btn preset-tonal-error"
									disabled={pending || !draft.expectedRevision || !!data.tournament.archivedAt}
									>Delete match</button
								>{/snippet}
						</ManagementForm>
					</section>
				{/if}
			</Tabs.Content>
			<Tabs.Content value="games" aria-label="Match games" class="space-y-5">
				<div class="admin-editor">
					<h2 class="h3">Games</h2>
					{#each data.games as game (game.id)}
						<a
							class="mt-3 flex items-center justify-between rounded-container border border-surface-200-800 p-3 hover:bg-surface-100-900"
							href={`/admin/games/${game.id}`}
							><span>Game {game.number} · {game.name}</span><span
								class="text-sm text-surface-600-400"
								>{game.resultType ??
									(data.summary.clinchNumber && game.number > data.summary.clinchNumber
										? 'Not needed'
										: 'Draft')} →</span
							></a
						>
					{:else}<p class="mt-2 text-sm text-surface-600-400">No games saved yet.</p>{/each}
				</div>
				{#if nextNumber && !data.tournament.archivedAt && !exceptional}
					<div class="admin-editor">
						<h2 class="h3">Create one game</h2>
						<ManagementForm
							action="?/createGame"
							initial={{
								expectedMatchRevision: data.match.revision,
								number: nextNumber,
								name: `Game ${nextNumber}`
							}}
						>
							{#snippet children(draft, pending)}
								<div class="grid gap-4 sm:grid-cols-2">
									<label class="block text-sm font-medium"
										>Game number<select class="select mt-1 w-full" bind:value={draft.number}
											>{#each [1, 2, 3, 4, 5].filter((number) => number <= data.match.bestOf && !data.games.some((game) => game.number === number)) as number (number)}<option
													value={number}>{number}</option
												>{/each}</select
										></label
									><label class="block text-sm font-medium"
										>Display name<input
											class="mt-1 input w-full"
											required
											maxlength="150"
											bind:value={draft.name}
										/></label
									>
								</div>
								<button class="btn preset-filled-primary-500" disabled={pending}>Create game</button
								>
							{/snippet}
						</ManagementForm>
					</div>
				{/if}
			</Tabs.Content>
			<Tabs.Content value="veto" aria-label="Match map veto" class="admin-editor"
				><h2 class="h3">Map Veto</h2>
				<VetoEditor
					matchId={data.match.id}
					revision={data.match.revision}
					bestOf={data.match.bestOf}
					actions={data.vetoes}
					entries={data.entries.filter(
						(entry) => entry.id === data.match.teamAEntryId || entry.id === data.match.teamBEntryId
					)}
					maps={data.maps}
					disabled={!!data.tournament.archivedAt}
				/></Tabs.Content
			>
		</ManagementWorkspace>
	</div>
{/key}
