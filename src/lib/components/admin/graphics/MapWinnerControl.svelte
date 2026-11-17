<script lang="ts">
	import ManagementForm from '../management/ManagementForm.svelte';
	import { gameWinnerTeam, teamScore } from '#lib/broadcast/selectors.ts';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';

	let { live }: { live: BroadcastSnapshot } = $props();
	const winner = $derived(gameWinnerTeam(live));
	const active = $derived(live.liveControls.lineupTeams === 'winner');
	const game = $derived(
		live.game ? `Game ${live.game.number} · ${live.game.map?.displayName ?? 'Map TBD'}` : ''
	);
	// Forfeits and walkovers carry no score; show the advancing team 13–0 instead of naming them.
	const score = $derived.by(() => {
		if (!winner) return '';
		const own = teamScore(live, winner.entryId, 'game');
		const loserId =
			winner.entryId === live.competition.teamAEntryId
				? live.competition.teamBEntryId
				: live.competition.teamAEntryId;
		const other = teamScore(live, loserId, 'game');
		return own === null || other === null ? '13–0' : `${own}–${other}`;
	});
</script>

<section class="space-y-2" aria-label="Map winner">
	<h3 class="h4">Map winner</h3>
	<div class="flex flex-wrap items-center gap-3">
		<ManagementForm
			action="/admin/graphics?/controls"
			recordDraft={false}
			initial={{ expectedRevision: live.controlRevision, lineupTeams: 'winner' }}
		>
			<button
				class="btn {active ? 'preset-filled-primary-500' : 'preset-tonal-primary'}"
				aria-pressed={active}
				disabled={!live.selection || !winner}>Map winner</button
			>
		</ManagementForm>
		<p>
			{#if winner}{game} — {winner.name} won {score}{:else}No result saved for this game yet{/if}
		</p>
	</div>
</section>
