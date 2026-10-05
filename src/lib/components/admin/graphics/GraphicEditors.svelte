<script lang="ts">
	import LineupEditor from '../management/LineupEditor.svelte';
	import VetoEditor from '../management/VetoEditor.svelte';
	import AgentSelectEditor from '../management/AgentSelectEditor.svelte';
	import PostGameEditor from '../management/PostGameEditor.svelte';
	import MvpPicker from '../management/MvpPicker.svelte';
	import { broadcastScopes, type GraphicId } from '#lib/broadcast/controls.ts';
	import type { GraphicsControlData } from './GraphicsWorkspace.svelte';
	let {
		graphic,
		management
	}: { graphic: GraphicId; management: GraphicsControlData['management'] } = $props();
	const entries = $derived(
		management
			? [
					management.entries.find((entry) => entry.id === management.match.teamAEntryId)!,
					management.entries.find((entry) => entry.id === management.match.teamBEntryId)!
				]
			: []
	);
	const archived = $derived(!!management?.tournament.archivedAt);
	const preparationBlocked = $derived(
		archived ||
			!!management?.game.resultType ||
			(!!management?.match.resultType && management.match.resultType !== 'normal')
	);
</script>

{#if !management}
	<section class="admin-editor">
		<p>Choose a saved game in Global Setup and Take game live to prepare this graphic.</p>
	</section>
{:else if graphic === 'player-lineup'}
	<section class="admin-editor" aria-label="Saved game lineup">
		<h2 class="h3">Lineup · Game {management.game.number}</h2>
		{#if preparationBlocked}<p>
				Reopen terminal games or unarchive the tournament in management before editing preparation.
			</p>{/if}
		<LineupEditor
			revision={management.game.revision}
			{entries}
			lineup={management.lineup}
			roster={management.roster}
			players={management.players}
			action={`/admin/games/${management.game.id}?/lineup`}
			disabled={preparationBlocked}
		/>
	</section>
{:else if graphic === 'map-veto'}
	<section class="admin-editor" aria-label="Saved match veto">
		<h2 class="h3">Map Veto · {management.match.label}</h2>
		<VetoEditor
			matchId={management.match.id}
			revision={management.match.revision}
			bestOf={management.match.bestOf}
			teamAEntryId={management.match.teamAEntryId}
			actions={management.vetoActions}
			{entries}
			maps={management.maps}
			action={`/admin/games/${management.game.id}?/veto`}
			disabled={archived ||
				(!!management.match.resultType && management.match.resultType !== 'normal')}
		/>
	</section>
{:else if graphic === 'agent-select'}
	<section class="admin-editor" aria-label="Saved agent assignments">
		<h2 class="h3">Agent Select · Game {management.game.number}</h2>
		<AgentSelectEditor
			revision={management.game.revision}
			{entries}
			lineup={management.lineup}
			players={management.players}
			agents={management.agents}
			action={`/admin/games/${management.game.id}?/agents`}
			disabled={archived}
		/>
	</section>
{:else if graphic === 'post-game'}
	<section class="admin-editor" aria-label="Saved post-game report">
		<h2 class="h3">Post-Game Report · Game {management.game.number}</h2>
		<PostGameEditor
			revision={management.game.revision}
			{entries}
			scoreboard={management.statistics.scoreboard}
			players={management.players}
			agents={management.agents}
			provenance={management.statistics.provenance}
			resultType={management.game.resultType}
			action={`/admin/games/${management.game.id}?/statistics`}
			disabled={archived}
		/>
	</section>
{:else if graphic === 'mvp'}
	<section class="admin-editor" aria-label="Saved MVP choices">
		<h2 class="h3">Saved MVP</h2>
		{#each broadcastScopes as scope (scope)}
			{@const record =
				scope === 'game'
					? management.game
					: scope === 'match'
						? management.match
						: management.tournament}
			{@const route = scope === 'game' ? 'games' : scope === 'match' ? 'matches' : 'tournaments'}
			<MvpPicker
				revision={record.revision}
				selected={management.scopes[scope].mvpPlayerId}
				candidates={management.scopes[scope].candidates.map((player) => ({
					id: player.playerId,
					displayName: player.displayName
				}))}
				scope={scope === 'game' ? 'Game' : scope === 'match' ? 'Match' : 'Tournament'}
				action={`/admin/${route}/${record.id}?/mvp`}
				disabled={archived}
			/>
		{/each}
	</section>
{:else}
	<section class="admin-editor">
		<h2 class="h3">Saved context</h2>
		<p>{management.match.label} · Game {management.game.number}: {management.game.name}</p>
		<p>
			{graphic === 'in-game'
				? 'Prepared match and game context. Live provider telemetry is controlled above.'
				: 'Player Stats reads the saved statistics in its selected scope.'}
		</p>
	</section>
{/if}
