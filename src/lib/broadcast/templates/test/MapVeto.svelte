<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { competitionTeams, vetoActor, teamByEntryId } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';
	import ResourceCard from '../../primitives/ResourceCard.svelte';
	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(competitionTeams(snapshot));
	const sequence = $derived([...snapshot.veto].sort((a, b) => a.sequence - b.sequence));
</script>

<div class="competition">
	{#each [teams.teamA, teams.teamB] as team, index (index)}
		<div>
			<p>Match Team {index === 0 ? 'A' : 'B'}</p>
			<Identity
				name={team?.name ?? null}
				assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
				unavailable="Team unavailable"
			/>
		</div>
	{/each}
</div>
<ol>
	{#each sequence as step (step.sequence)}
		{@const actor = vetoActor(snapshot, step)}
		{@const chooser = teamByEntryId(snapshot, step.sideChooserEntryId)}
		<li data-sequence={step.sequence} data-actor-entry-id={step.actingEntryId}>
			<h2>{step.sequence} · {step.action}</h2>
			<p>{actor?.name ?? 'Actor unavailable'}</p>
			<ResourceCard resource={{ kind: 'map', value: step.map }} />
			{#if step.gameNumber !== null}<p>Game {step.gameNumber}</p>{/if}
			{#if step.sideChooserEntryId !== null || step.sideChoice !== null}
				<p>
					Side choice: {chooser?.name ?? 'Team unavailable'} · {step.sideChoice === 'attack'
						? 'Attacker'
						: step.sideChoice === 'defense'
							? 'Defender'
							: 'Side unavailable'}
				</p>
			{/if}
		</li>
	{:else}
		<li>Veto unavailable</li>
	{/each}
</ol>

<style>
	.competition {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 32px;
		--asset-width: 64px;
		--asset-height: 64px;
		padding: 12px 20px;
		background: #101d30f2;
	}
	ol {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 16px;
		padding: 0;
		margin: 24px 0 0;
		list-style: none;
		max-height: 680px;
		/* ponytail: vetoes beyond two rows scroll; condense or paginate if an event needs more steps. */
		overflow: auto;
	}
	li {
		min-width: 0;
		padding: 20px;
		background: #101d30f2;
		border-top: 3px solid #54c5c0;
		--asset-width: 140px;
		--asset-height: 116px;
	}
	h2 {
		font:
			600 28px Bahnschrift,
			sans-serif;
		text-transform: uppercase;
		margin: 0 0 12px;
	}
	p {
		font-size: 20px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin: 8px 0;
	}
	li[data-sequence] :global(.identity) {
		padding: 8px 0;
		border: 0;
	}
</style>
