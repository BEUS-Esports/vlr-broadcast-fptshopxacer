<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import LineupEditor from '#lib/components/admin/management/LineupEditor.svelte';
	import ManagementForm from '#lib/components/admin/management/ManagementForm.svelte';
	import ManagementWorkspace from '#lib/components/admin/management/ManagementWorkspace.svelte';
	import VetoEditor from '#lib/components/admin/management/VetoEditor.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const tabs = [
		{ value: 'info', label: 'Info' },
		{ value: 'lineup', label: 'Lineup' },
		{ value: 'veto', label: 'Map Veto' }
	];
	const revisions = $derived({
		expectedGameRevision: data.game.revision,
		expectedMatchRevision: data.match.revision
	});
	const teamA = $derived(data.entries.find((entry) => entry.id === data.match.teamAEntryId)!);
	const teamB = $derived(data.entries.find((entry) => entry.id === data.match.teamBEntryId)!);
	const exceptional = $derived(
		data.match.resultType !== null && data.match.resultType !== 'normal'
	);
	const exceptionalGame = $derived(
		data.game.resultType !== null && data.game.resultType !== 'normal'
	);
	const blocked = $derived(!!data.tournament.archivedAt || exceptional);
	function confirmResult(event: MouseEvent) {
		if (
			!window.confirm(
				`Record this final result? Current series: ${data.series.winsA}–${data.series.winsB}. The series will be recalculated.`
			)
		)
			event.preventDefault();
	}
</script>

<svelte:head><title>{data.game.name} | {data.match.label}</title></svelte:head>
{#key data.game.id}
	<div class="admin-page">
		<header class="space-y-2">
			<nav aria-label="Breadcrumb" class="flex flex-wrap gap-2 text-sm text-primary-600-400">
				<a class="underline" href={`/admin/tournaments/${data.tournament.id}`}
					>{data.tournament.name}</a
				><span>/</span><a class="underline" href={`/admin/matches/${data.match.id}?tab=games`}
					>{data.match.label}</a
				>
			</nav>
			<h1 class="h1">{data.game.name}</h1>
			<p>
				Game {data.game.number} · {teamA.name} vs {teamB.name} · {data.game.resultType ??
					(data.series.clinchNumber && data.game.number > data.series.clinchNumber
						? 'Not needed'
						: 'Draft')}
			</p>
			<p class="font-semibold" aria-label="Series result">
				Series: {data.series.winsA}–{data.series.winsB} · {data.series.state}
			</p>
			{#if exceptional}<p class="text-warning-600-400">
					Match outcome: {data.match.resultType}.
					<a class="underline" href={`/admin/matches/${data.match.id}`}>Clear the match outcome</a> before
					editing games.
				</p>{/if}
			{#if data.tournament.archivedAt}<p>
					Unarchive the tournament before editing preparation.
				</p>{/if}
		</header>
		<ManagementWorkspace {tabs}>
			<Tabs.Content value="info" aria-label="Game information" class="space-y-5">
				<section class="admin-editor" aria-label="Game preparation">
					<h2 class="h3">Game preparation</h2>
					{#if data.game.resultType}<p>
							Reopen this game before changing its map, sides, or lineup.
						</p>{/if}
					<ManagementForm
						action="?/info"
						initial={{
							...revisions,
							name: data.game.name,
							mapId: data.game.mapId ?? '',
							startingAttackersEntryId: data.game.startingAttackersEntryId ?? '',
							startingDefendersEntryId: data.game.startingDefendersEntryId ?? ''
						}}
					>
						{#snippet children(draft, pending)}
							<fieldset disabled={blocked} class="grid gap-4 md:grid-cols-2">
								<label class="block"
									>Game name<input
										class="mt-1 input w-full"
										required
										maxlength="150"
										bind:value={draft.name}
									/></label
								>
								<label class="block"
									>Map<select
										class="select mt-1 w-full"
										bind:value={draft.mapId}
										disabled={!!data.game.resultType || !!data.vetoPreparation.mapId}
										>{#if !data.vetoPreparation.mapId || !draft.mapId}<option value=""
												>Unknown</option
											>{/if}
										{#if draft.mapId && !data.preparationMaps.some((map) => map.id === draft.mapId)}
											<option value={draft.mapId} disabled>
												{data.maps.find((map) => map.id === draft.mapId)?.displayName ??
													draft.mapId} (no longer available)
											</option>
										{/if}
										{#each data.preparationMaps as map (map.id)}<option value={map.id}
												>{map.displayName}</option
											>{/each}</select
									></label
								>
								<label class="block"
									>Starting attackers<select
										class="select mt-1 w-full"
										bind:value={draft.startingAttackersEntryId}
										disabled={!!data.game.resultType ||
											!!data.vetoPreparation.startingAttackersEntryId}
										><option value="">Unknown</option
										>{#each data.entries as entry (entry.id)}<option value={entry.id}
												>{entry.name}</option
											>{/each}</select
									></label
								>
								<label class="block"
									>Starting defenders<select
										class="select mt-1 w-full"
										bind:value={draft.startingDefendersEntryId}
										disabled={!!data.game.resultType ||
											!!data.vetoPreparation.startingDefendersEntryId}
										><option value="">Unknown</option
										>{#each data.entries as entry (entry.id)}<option value={entry.id}
												>{entry.name}</option
											>{/each}</select
									></label
								>
							</fieldset>
							{#if data.vetoPreparation.mapId}<p class="text-sm text-surface-600-400">
									This game's map is assigned in Map Veto. Change the assignment there.
								</p>{/if}
							{#if data.vetoPreparation.startingAttackersEntryId}<p
									class="text-sm text-surface-600-400"
								>
									Starting sides are assigned in Map Veto. Change the side choice there.
								</p>{/if}
							<p class="text-sm text-surface-600-400">
								Scores stay attached to {teamA.name} and {teamB.name} when sides change. Resolve veto
								conflicts in the match-wide Map Veto tab.
							</p>
							<button
								type="submit"
								class="btn preset-filled-primary-500"
								disabled={pending || blocked}>Save game info</button
							>
						{/snippet}
					</ManagementForm>
				</section>
				<section class="admin-editor" aria-label="Game result">
					<h2 class="h3">Round scores</h2>
					<ManagementForm
						action="?/finalize"
						initial={{
							...revisions,
							scoreA: data.game.scoreA === null ? '' : String(data.game.scoreA),
							scoreB: data.game.scoreB === null ? '' : String(data.game.scoreB)
						}}
					>
						{#snippet children(draft, pending)}
							<fieldset disabled={blocked || exceptionalGame} class="grid gap-4 md:grid-cols-2">
								<label class="block"
									>{teamA.name} score (Team A)<input
										class="mt-1 input w-full"
										inputmode="numeric"
										pattern="[0-9]*"
										bind:value={draft.scoreA}
									/></label
								>
								<label class="block"
									>{teamB.name} score (Team B)<input
										class="mt-1 input w-full"
										inputmode="numeric"
										pattern="[0-9]*"
										bind:value={draft.scoreB}
									/></label
								>
							</fieldset>
							<p class="text-sm text-surface-600-400">
								Both blank means unknown. Draft scores do not count towards the series.
							</p>
							<div class="flex flex-wrap gap-3">
								{#if !data.game.resultType}<button
										type="submit"
										formaction="?/saveDraft"
										class="btn preset-tonal-primary"
										disabled={pending || blocked}>Save draft scores</button
									>{/if}
								<button
									type="submit"
									class="btn preset-filled-primary-500"
									disabled={pending || blocked || exceptionalGame}
									onclick={confirmResult}
									>{data.game.resultType ? 'Correct result' : 'Finalize result'}</button
								>
							</div>
						{/snippet}
					</ManagementForm>
					{#if data.game.resultType}
						<ManagementForm
							action="?/reopen"
							initial={revisions}
							confirmMessage={`Reopen Game ${data.game.number}? Its result will stop contributing to the series. Preparation and normal scores are retained.`}
						>
							{#snippet children(draft, pending)}<button
									type="submit"
									class="btn preset-tonal-warning"
									disabled={pending || !draft.expectedGameRevision || blocked}>Reopen game</button
								>{/snippet}
						</ManagementForm>
					{/if}
				</section>
				<section class="admin-editor" aria-label="Exceptional game result">
					<h2 class="h3">Exceptional game result</h2>
					{#if data.game.resultType}<p>
							Reopen the game before recording a different outcome.
						</p>{/if}
					<ManagementForm
						action="?/outcome"
						initial={{ ...revisions, mode: 'forfeit', winnerEntryId: data.match.teamAEntryId }}
						confirmMessage="Record this exceptional game result and recalculate the series? Round scores will become unknown."
					>
						{#snippet children(draft, pending)}
							<label class="block"
								>Result type<select class="select mt-1 w-full" bind:value={draft.mode}
									><option value="forfeit">Forfeit</option><option value="walkover">Walkover</option
									><option value="cancelled">Cancelled</option></select
								></label
							>
							{#if draft.mode !== 'cancelled'}<label class="block"
									>Winning team<select class="select mt-1 w-full" bind:value={draft.winnerEntryId}
										>{#each data.entries as entry (entry.id)}<option value={entry.id}
												>{entry.name}</option
											>{/each}</select
									></label
								>{/if}
							<button
								type="submit"
								class="btn preset-tonal-warning"
								disabled={pending || blocked || !!data.game.resultType}>Record game outcome</button
							>
						{/snippet}
					</ManagementForm>
				</section>
				{#if !data.game.resultType}<section class="admin-editor" aria-label="Delete draft game">
						<ManagementForm
							action="?/delete"
							initial={revisions}
							confirmMessage={`Delete Game ${data.game.number} and all its saved lineup slots? Other game numbers remain unchanged.`}
							>{#snippet children(draft, pending)}<button
									type="submit"
									class="btn preset-tonal-error"
									disabled={pending || !draft.expectedGameRevision || blocked}
									>Delete draft game</button
								>{/snippet}</ManagementForm
						>
					</section>{/if}
			</Tabs.Content>
			<Tabs.Content value="lineup" class="admin-editor" aria-label="Game lineup"
				><h2 class="h3">Lineup</h2>
				<LineupEditor
					revision={data.game.revision}
					entries={[teamA, teamB]}
					lineup={data.lineup}
					roster={data.roster}
					players={data.players}
					disabled={blocked || !!data.game.resultType}
				/>{#if data.game.resultType}<p>
						Reopen this game in Info before changing its lineup.
					</p>{/if}</Tabs.Content
			>
			<Tabs.Content value="veto" class="admin-editor" aria-label="Match-wide map veto"
				><h2 class="h3">Match-wide Map Veto</h2>
				<VetoEditor
					matchId={data.match.id}
					revision={data.match.revision}
					bestOf={data.match.bestOf}
					actions={data.vetoActions}
					entries={data.entries}
					maps={data.maps}
					disabled={!!data.tournament.archivedAt}
				/></Tabs.Content
			>
		</ManagementWorkspace>
	</div>
{/key}
