<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import ManagementForm from '#lib/components/admin/management/ManagementForm.svelte';
	import ManagementWorkspace from '#lib/components/admin/management/ManagementWorkspace.svelte';
	import MvpPicker from '#lib/components/admin/management/MvpPicker.svelte';
	import StatisticsView from '#lib/components/admin/management/StatisticsView.svelte';
	import RosterEditor from '#lib/components/admin/management/RosterEditor.svelte';
	import MapPoolEditor from '#lib/components/admin/management/MapPoolEditor.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const tabs = [
		{ value: 'overview', label: 'Overview' },
		{ value: 'teams', label: 'Teams & Players' },
		{ value: 'maps', label: 'Map Pool' },
		{ value: 'matches', label: 'Matches' },
		{ value: 'statistics', label: 'Statistics' }
	];
</script>

<svelte:head><title>{data.tournament.name} | Tournaments</title></svelte:head>
{#key data.tournament.id}
	<div class="admin-page">
		<header>
			<a class="text-sm text-primary-600-400 underline" href="/admin/tournaments">← Tournaments</a>
			<div class="mt-2 flex flex-wrap items-center gap-3">
				<h1 class="h1">{data.tournament.name}</h1>
				<span
					class="badge {data.tournament.archivedAt
						? 'preset-tonal-warning'
						: 'preset-tonal-success'}">{data.tournament.archivedAt ? 'Archived' : 'Active'}</span
				>
			</div>
			<p class="mt-1 text-sm text-surface-600-400">/{data.tournament.slug}</p>
		</header>
		<ManagementWorkspace {tabs}>
			<Tabs.Content value="overview" aria-label="Tournament overview" class="space-y-5">
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="card preset-filled-surface-100-900 p-4">
						<strong class="text-2xl">{data.counts.entries}</strong>
						<p class="text-sm text-surface-600-400">Teams</p>
					</div>
					<div class="card preset-filled-surface-100-900 p-4">
						<strong class="text-2xl">{data.counts.maps}</strong>
						<p class="text-sm text-surface-600-400">Pool maps</p>
					</div>
					<div class="card preset-filled-surface-100-900 p-4">
						<strong class="text-2xl">{data.counts.matches}</strong>
						<p class="text-sm text-surface-600-400">Matches</p>
					</div>
				</div>
				<section class="admin-editor" aria-label="Tournament details">
					<h2 class="h3">Tournament details</h2>
					{#if data.tournament.archivedAt}
						<p class="text-sm text-surface-600-400">
							Unarchive this tournament to edit its preparation.
						</p>
					{:else}
						<ManagementForm
							action="?/save"
							initial={{
								name: String(form?.draft?.name ?? data.tournament.name),
								slug: String(form?.draft?.slug ?? data.tournament.slug),
								expectedRevision: Number(form?.draft?.expectedRevision ?? data.tournament.revision)
							}}
						>
							{#snippet children(draft, pending)}
								<div class="grid gap-4 md:grid-cols-2">
									<label class="block text-sm font-medium"
										>Tournament name<input
											class="mt-1 input w-full"
											required
											maxlength="150"
											bind:value={draft.name}
										/></label
									>
									<label class="block text-sm font-medium"
										>Slug<input
											class="mt-1 input w-full"
											required
											maxlength="100"
											pattern="[a-z0-9]+(-[a-z0-9]+)*"
											bind:value={draft.slug}
										/></label
									>
								</div>
								<button class="btn preset-filled-primary-500" disabled={pending}
									>Save details</button
								>
							{/snippet}
						</ManagementForm>
					{/if}
				</section>
				<section class="admin-editor" aria-label="Tournament status">
					<h2 class="h3">Status</h2>
					<p class="text-sm text-surface-600-400">
						Archived tournaments remain readable. Unarchive before changing preparation.
					</p>
					<ManagementForm
						action="?/archive"
						initial={{
							expectedRevision: data.tournament.revision,
							archived: !data.tournament.archivedAt
						}}
						confirmMessage={data.tournament.archivedAt ? undefined : 'Archive this tournament?'}
					>
						{#snippet children(draft, pending)}<button
								class="btn {data.tournament.archivedAt
									? 'preset-filled-primary-500'
									: 'preset-tonal-warning'}"
								disabled={pending || !draft.expectedRevision}
								>{data.tournament.archivedAt
									? 'Unarchive tournament'
									: 'Archive tournament'}</button
							>{/snippet}
					</ManagementForm>
				</section>
				{#if !data.tournament.archivedAt && !data.counts.entries && !data.counts.matches}
					<section class="admin-editor" aria-label="Delete tournament">
						<h2 class="h3">Delete unused tournament</h2>
						<ManagementForm
							action="?/delete"
							initial={{ expectedRevision: data.tournament.revision }}
							confirmMessage="Permanently delete this unused tournament?"
						>
							{#snippet children(draft, pending)}<button
									class="btn preset-tonal-error"
									disabled={pending || !draft.expectedRevision}>Delete tournament</button
								>{/snippet}
						</ManagementForm>
					</section>
				{/if}
			</Tabs.Content>
			<Tabs.Content value="teams" aria-label="Tournament teams and players" class="space-y-5">
				<div class="admin-editor">
					<h2 class="h3">Teams & Players</h2>
					<ManagementForm
						action="?/addEntry"
						initial={{ expectedTournamentRevision: data.tournament.revision, teamId: '' }}
					>
						{#snippet children(draft, pending)}
							<label class="block"
								>Participating team<select
									class="select mt-1 w-full"
									required
									bind:value={draft.teamId}
									disabled={!!data.tournament.archivedAt}
									><option value="">Choose a team</option
									>{#each data.teams as team (team.id)}<option value={team.id}
											>{team.name} ({team.tag})</option
										>{/each}</select
								></label
							>
							<button
								type="submit"
								class="btn preset-filled-primary-500"
								disabled={pending || !!data.tournament.archivedAt}>Add team entry</button
							>
						{/snippet}
					</ManagementForm>
				</div>
				{#each data.entries as entry (entry.id)}
					<section class="admin-editor" aria-label={`${entry.name} roster`}>
						<div class="flex items-center gap-3">
							{#if entry.logoPath}<img
									src={entry.logoPath}
									alt=""
									class="size-12 object-contain"
								/>{/if}
							<h3 class="h3">
								{entry.name} <span class="text-sm text-surface-600-400">{entry.tag}</span>
							</h3>
						</div>
						<RosterEditor
							entryId={entry.id}
							revision={data.tournament.revision}
							playerIds={data.rosters
								.filter((row) => row.entryId === entry.id)
								.map((row) => row.playerId)}
							players={data.players}
							assignments={data.rosters
								.filter((row) => row.entryId !== entry.id)
								.map((row) => ({
									playerId: row.playerId,
									teamName: data.entries.find((team) => team.id === row.entryId)!.name
								}))}
							disabled={!!data.tournament.archivedAt}
						/>
						<ManagementForm
							action="?/removeEntry"
							initial={{ entryId: entry.id, expectedTournamentRevision: data.tournament.revision }}
							confirmMessage={`Remove ${entry.name} and its current roster from this tournament? Saved matches or lineups block removal.`}
						>
							{#snippet children(draft, pending)}<button
									type="submit"
									class="btn preset-tonal-error"
									disabled={pending ||
										!draft.expectedTournamentRevision ||
										!!data.tournament.archivedAt}>Remove entry</button
								>{/snippet}
						</ManagementForm>
					</section>
				{:else}<p>Add a reusable team, then choose its available players.</p>{/each}
			</Tabs.Content>
			<Tabs.Content value="maps" aria-label="Tournament map pool" class="admin-editor"
				><MapPoolEditor
					revision={data.tournament.revision}
					mapIds={data.mapIds}
					maps={data.maps}
					disabled={!!data.tournament.archivedAt}
				/></Tabs.Content
			>
			<Tabs.Content value="matches" aria-label="Tournament matches" class="space-y-5">
				<div class="admin-editor">
					<h2 class="h3">Matches</h2>
					{#each data.matches as match (match.id)}
						<a
							class="mt-3 flex items-center justify-between rounded-container border border-surface-200-800 p-3 hover:bg-surface-100-900"
							href={`/admin/matches/${match.id}`}
							><span
								>{match.label} · {data.entries.find((entry) => entry.id === match.teamAEntryId)
									?.name} vs {data.entries.find((entry) => entry.id === match.teamBEntryId)
									?.name}</span
							><span class="text-sm text-surface-600-400">BO{match.bestOf} →</span></a
						>
					{:else}<p class="mt-2 text-sm text-surface-600-400">No matches yet.</p>{/each}
				</div>
				{#if !data.tournament.archivedAt}
					<div class="admin-editor">
						<h2 class="h3">Create match</h2>
						<ManagementForm
							action="?/createMatch"
							initial={{ teamAEntryId: '', teamBEntryId: '', label: '', bestOf: 3 }}
						>
							{#snippet children(draft, pending)}
								<div class="grid gap-4 sm:grid-cols-2">
									<label class="block text-sm font-medium"
										>Team A<select
											class="select mt-1 w-full"
											required
											bind:value={draft.teamAEntryId}
											><option value="">Choose a team</option
											>{#each data.entries as entry (entry.id)}<option value={entry.id}
													>{entry.name}</option
												>{/each}</select
										></label
									>
									<label class="block text-sm font-medium"
										>Team B<select
											class="select mt-1 w-full"
											required
											bind:value={draft.teamBEntryId}
											><option value="">Choose a team</option
											>{#each data.entries as entry (entry.id)}<option value={entry.id}
													>{entry.name}</option
												>{/each}</select
										></label
									>
									<label class="block text-sm font-medium"
										>Label<input
											class="mt-1 input w-full"
											required
											maxlength="150"
											bind:value={draft.label}
										/></label
									>
									<label class="block text-sm font-medium"
										>Format<select class="select mt-1 w-full" bind:value={draft.bestOf}
											><option value={1}>BO1</option><option value={2}>BO2</option><option value={3}
												>BO3</option
											><option value={5}>BO5</option></select
										></label
									>
								</div>
								<button
									class="btn preset-filled-primary-500"
									disabled={pending || data.entries.length < 2}>Create match</button
								>
							{/snippet}
						</ManagementForm>
					</div>
				{/if}
			</Tabs.Content>
			<Tabs.Content value="statistics" aria-label="Tournament statistics" class="admin-editor">
				<StatisticsView statistics={data.statistics} entries={data.entries} />
				<MvpPicker
					revision={data.tournament.revision}
					selected={data.tournament.mvpPlayerId}
					candidates={data.mvpCandidates}
					scope="Tournament"
					disabled={!!data.tournament.archivedAt}
				/>
			</Tabs.Content>
		</ManagementWorkspace>
	</div>
{/key}
