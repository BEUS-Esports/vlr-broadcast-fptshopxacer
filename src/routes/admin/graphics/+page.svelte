<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import ManagementForm from '#lib/components/admin/management/ManagementForm.svelte';
	import ManagementWorkspace from '#lib/components/admin/management/ManagementWorkspace.svelte';
	import { createBroadcastClient, type BroadcastClientState } from '#lib/broadcast/client.ts';
	import {
		broadcastScopes,
		graphicIds,
		graphicLabels,
		type GraphicId
	} from '#lib/broadcast/controls.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let stream = $state<BroadcastClientState>({ connection: 'disconnected', snapshot: null });
	let refreshError = $state('');
	const live = $derived(
		stream.snapshot && stream.snapshot.revision > data.snapshot.revision
			? stream.snapshot
			: data.snapshot
	);
	const selectionInitial = $derived({
		expectedRevision: live.revision,
		tournamentId: live.selection?.tournamentId ?? '',
		matchId: live.selection?.matchId ?? '',
		gameId: live.selection?.gameId ?? ''
	});
	const presentationInitial = $derived({
		expectedRevision: live.revision,
		swapped: !!live.selection && live.presentation.leftEntryId === live.competition.teamBEntryId,
		currentAttackersEntryId:
			live.sides.source === 'manual' ? (live.sides.attackersEntryId ?? '') : ''
	});
	const tabs = graphicIds.map((value) => ({ value, label: graphicLabels[value] }));
	const teamName = (id: string | null) =>
		live.teams.find((team) => team.entryId === id)?.name ?? 'Unknown';
	function editorLinks(id: GraphicId) {
		if (!live.selection) return [];
		const { gameId, matchId, tournamentId } = live.selection;
		switch (id) {
			case 'player-lineup':
				return [{ href: `/admin/games/${gameId}?tab=lineup`, label: 'Edit saved lineup' }];
			case 'map-veto':
				return [{ href: `/admin/matches/${matchId}?tab=veto`, label: 'Edit saved match veto' }];
			case 'agent-select':
				return [
					{ href: `/admin/games/${gameId}?tab=statistics`, label: 'Edit saved agent assignments' }
				];
			case 'post-game':
			case 'player-stats':
				return [
					{ href: `/admin/games/${gameId}?tab=statistics`, label: 'Edit saved game statistics' }
				];
			case 'in-game':
				return [{ href: `/admin/games/${gameId}?tab=info`, label: 'Edit saved game preparation' }];
			case 'mvp':
				return [
					{ href: `/admin/games/${gameId}?tab=statistics`, label: 'Edit saved game MVP' },
					{ href: `/admin/matches/${matchId}?tab=statistics`, label: 'Edit saved match MVP' },
					{
						href: `/admin/tournaments/${tournamentId}?tab=statistics`,
						label: 'Edit saved tournament MVP'
					}
				];
		}
	}
	onMount(() => {
		const client = createBroadcastClient();
		let refreshedRevision = data.snapshot.revision;
		const unsubscribe = client.subscribe((state) => {
			stream = state;
			if (state.snapshot && state.snapshot.revision > refreshedRevision) {
				refreshedRevision = state.snapshot.revision;
				void invalidateAll()
					.then(() => {
						refreshError = '';
					})
					.catch(() => {
						refreshError = 'Could not refresh selector options. Reload to see newly saved games.';
					});
			}
		});
		client.connect();
		return () => {
			unsubscribe();
			client.disconnect();
		};
	});
</script>

<svelte:head><title>Graphics Controller</title></svelte:head>
<div class="admin-page">
	<header class="space-y-2">
		<h1 class="h1">Graphics Controller</h1>
		<p>Choose a complete game, then take it live. Saved preparation feeds every graphic.</p>
		<p aria-label="Broadcast connection" role="status">
			Connection: {stream.connection} · Snapshot: {stream.snapshot ? 'received' : 'loaded'} · Revision
			{live.revision}
		</p>
		{#if refreshError}<p role="alert">{refreshError}</p>{/if}
	</header>
	<section aria-label="On air" class="admin-editor border-t-success-500">
		<h2 class="h2">On air</h2>
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
	<section aria-label="Live game selection" class="admin-editor">
		<h2 class="h2">Select game</h2>
		<ManagementForm action="?/select" initial={selectionInitial}>
			{#snippet children(draft)}
				<div class="grid gap-4 md:grid-cols-3">
					<label class="label"
						><span>Tournament</span><select
							class="select"
							bind:value={draft.tournamentId}
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
							disabled={!draft.tournamentId}
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
							disabled={!draft.matchId}
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
					disabled={!draft.tournamentId ||
						!draft.matchId ||
						!data.gameOptions.some(
							(game) => game.id === draft.gameId && game.matchId === draft.matchId
						)}>Take game live</button
				>
			{/snippet}
		</ManagementForm>
		<ManagementForm action="?/clear" initial={{ expectedRevision: live.revision }}>
			<button class="btn preset-tonal-error" disabled={!live.selection}>Clear live selection</button
			>
		</ManagementForm>
	</section>
	<section aria-label="Presentation controls" class="admin-editor">
		<h2 class="h2">Presentation and current side</h2>
		<ManagementForm action="?/controls" initial={presentationInitial}>
			{#snippet children(draft)}
				<p>Presentation draft: {draft.swapped ? 'B-left / A-right' : 'A-left / B-right'}</p>
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
				<div class="flex flex-wrap gap-3">
					<button
						class="btn preset-tonal-primary"
						disabled={!live.selection}
						onclick={() => {
							draft.swapped = !draft.swapped;
						}}>Swap Left/Right</button
					>
					<button class="btn preset-filled-primary-500" disabled={!live.selection}
						>Save presentation</button
					>
				</div>
			{/snippet}
		</ManagementForm>
	</section>
	<ManagementWorkspace {tabs}>
		{#each graphicIds as id (id)}
			<Tabs.Content value={id} class="admin-editor space-y-4">
				<h2 class="h2">{graphicLabels[id]}</h2>
				<a
					class="text-primary-600-400 underline"
					href={`/gfx/live/${id}`}
					target="_blank"
					rel="noreferrer">Open {graphicLabels[id]} output</a
				>
				<p class="text-sm">OBS browser source · /gfx/live/{id} · 1920×1080</p>
				<div class="flex flex-wrap gap-4">
					{#each editorLinks(id) as link (link.href)}<a class="underline" href={link.href}
							>{link.label}</a
						>{/each}
				</div>
				{#if !live.selection}<p>Select a live game to open its saved editors.</p>{/if}
				<ManagementForm
					action="?/controls"
					initial={{
						expectedRevision: live.revision,
						visibility: { [id]: live.controls.visibility[id] },
						...(id === 'player-stats' ? { playerStats: live.controls.playerStats } : {}),
						...(id === 'mvp' ? { mvpScope: live.controls.mvpScope } : {})
					}}
				>
					{#snippet children(draft)}
						<label class="flex items-center gap-2"
							><input type="checkbox" class="checkbox" bind:checked={draft.visibility[id]} />Show {graphicLabels[
								id
							]}</label
						>
						{#if id === 'player-stats' && draft.playerStats}
							<label class="label"
								><span>Stats mode</span><select
									class="select"
									bind:value={draft.playerStats.mode}
									onchange={() => {
										if (draft.playerStats?.mode === 'single')
											draft.playerStats.opponentPlayerId = null;
									}}
									><option value="single">Single / Player to Watch</option><option
										value="head-to-head">Head-to-Head</option
									></select
								></label
							>
							<label class="label"
								><span>Stats scope</span><select
									class="select"
									bind:value={draft.playerStats.scope}
									onchange={() => {
										if (draft.playerStats) {
											draft.playerStats.playerId = null;
											draft.playerStats.opponentPlayerId = null;
										}
									}}
									>{#each broadcastScopes as scope (scope)}<option value={scope}>{scope}</option
										>{/each}</select
								></label
							>
							<label class="label"
								><span>Stats player</span><select
									class="select"
									bind:value={draft.playerStats.playerId}
									><option value={null}>Unknown / no selection</option
									>{#each live.scopes[draft.playerStats.scope].candidates as player (player.playerId)}<option
											value={player.playerId}>{player.displayName}</option
										>{/each}</select
								></label
							>
							{#if draft.playerStats.mode === 'head-to-head'}<label class="label"
									><span>Opponent player</span><select
										class="select"
										bind:value={draft.playerStats.opponentPlayerId}
										><option value={null}>Unknown / no selection</option
										>{#each live.scopes[draft.playerStats.scope].candidates as player (player.playerId)}<option
												value={player.playerId}
												disabled={player.playerId === draft.playerStats.playerId}
												>{player.displayName}</option
											>{/each}</select
									></label
								>{/if}
							{#if !live.scopes[draft.playerStats.scope].candidates.length}<p>
									No saved lineup players in this scope.
								</p>{/if}
						{/if}
						{#if id === 'mvp'}<label class="label"
								><span>MVP scope</span><select class="select" bind:value={draft.mvpScope}
									>{#each broadcastScopes as scope (scope)}<option value={scope}>{scope}</option
										>{/each}</select
								></label
							>{/if}
						<p class="text-sm">Control draft · based on revision {draft.expectedRevision}</p>
						<button class="btn preset-filled-primary-500">Save {graphicLabels[id]}</button>
					{/snippet}
				</ManagementForm>
			</Tabs.Content>
		{/each}
	</ManagementWorkspace>
</div>
