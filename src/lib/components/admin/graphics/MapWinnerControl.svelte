<script lang="ts">
	import ManagementForm from '../management/ManagementForm.svelte';
	import { displayGameScore, gameWinnerTeam } from '#lib/broadcast/selectors.ts';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';

	let { live }: { live: BroadcastSnapshot } = $props();
	const winner = $derived(gameWinnerTeam(live));
	const active = $derived(live.liveControls.lineupTeams === 'winner');
	// Program pairs live controls with the published capture, so switching modes while Lineup is
	// on air would show the old (possibly empty) result. Require Hide → Show first.
	const unpublished = $derived(
		live.controls.visibility['player-lineup'] &&
			(live.publications['player-lineup']?.game?.winnerEntryId ?? null) !==
				(live.game?.winnerEntryId ?? null)
	);
	const game = $derived(
		live.game ? `Game ${live.game.number} · ${live.game.map?.displayName ?? 'Map TBD'}` : ''
	);
	const score = $derived.by(() => {
		if (!winner) return '';
		const loserId =
			winner.entryId === live.competition.teamAEntryId
				? live.competition.teamBEntryId
				: live.competition.teamAEntryId;
		return `${displayGameScore(live, winner.entryId)}–${displayGameScore(live, loserId)}`;
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
				disabled={!live.selection || !winner || unpublished}>Map winner</button
			>
		</ManagementForm>
		<p>
			{#if winner && unpublished}Hide → Show Player Lineup to publish the result first{:else if winner}{game}
				— {winner.name} won {score}{:else}No result saved for this game yet{/if}
		</p>
	</div>
</section>
