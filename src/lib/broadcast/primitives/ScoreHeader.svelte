<script lang="ts">
	import type { BroadcastSnapshot } from '../types';
	import { presentationTeams, gameplaySide, teamScore, teamByEntryId } from '../selectors';
	import Identity from './Identity.svelte';
	let {
		snapshot,
		scope = 'game',
		sides = 'neutral'
	}: {
		snapshot: BroadcastSnapshot;
		scope?: 'game' | 'match';
		sides?: 'neutral' | 'prepared' | 'current';
	} = $props();
	const teams = $derived(presentationTeams(snapshot));
	const result = $derived(snapshot[scope]);
	const winner = $derived(teamByEntryId(snapshot, result?.winnerEntryId ?? null));
</script>

<header data-score-scope={scope}>
	<div class="teams">
		{#each ['left', 'right'] as position (position)}
			{@const team = teams[position as 'left' | 'right']}
			<div data-position={position} data-entry-id={team?.entryId ?? ''}>
				<Identity
					name={team?.name ?? null}
					detail={team?.tag}
					assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
					unavailable="Team unavailable"
					side={sides === 'neutral' ? null : gameplaySide(snapshot, team?.entryId ?? null, sides)}
				/>
				<strong class="score"
					>{teamScore(snapshot, team?.entryId ?? null, scope) ?? 'Unavailable'}</strong
				>
			</div>
		{/each}
	</div>
	<p>
		{result?.resultType
			? {
					normal: 'Normal result',
					forfeit: 'Forfeit',
					walkover: 'Walkover',
					cancelled: 'Cancelled'
				}[result.resultType]
			: 'Result unavailable'}{#if winner}
			· Winner: {winner.name}{/if}
	</p>
</header>

<style>
	.teams {
		display: flex;
		gap: 24px;
	}
	.score {
		font-variant-numeric: tabular-nums;
	}
	p {
		margin: 8px 0 0;
	}
</style>
