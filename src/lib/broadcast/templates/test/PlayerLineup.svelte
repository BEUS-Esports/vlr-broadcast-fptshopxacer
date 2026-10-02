<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, lineupForTeam } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';
	import ResourceCard from '../../primitives/ResourceCard.svelte';
	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
</script>

<div class="teams">
	{#each ['left', 'right'] as position (position)}
		{@const team = position === 'left' ? teams.left : teams.right}
		{@const entryId =
			position === 'left' ? snapshot.presentation.leftEntryId : snapshot.presentation.rightEntryId}
		{@const lineup = lineupForTeam(snapshot, entryId)}
		<div class="team" data-position={position} data-entry-id={entryId}>
			<Identity
				name={team?.name ?? null}
				assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
				detail={team?.tag}
				unavailable="Team unavailable"
			/>
			<p class="readiness">{lineup.filter((row) => row.player).length}/5 saved players</p>
			<ol>
				{#each [1, 2, 3, 4, 5] as slot (slot)}
					<li data-slot={slot}>
						<span class="slot">{slot}</span>
						<ResourceCard
							resource={{
								kind: 'player',
								value: lineup.find((saved) => saved.slot === slot)?.player ?? null
							}}
						/>
					</li>
				{/each}
			</ol>
		</div>
	{/each}
</div>

<style>
	.teams {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 32px;
	}
	.team {
		min-width: 0;
		--asset-width: 96px;
		--asset-height: 96px;
		background: #101d30f2;
		border-top: 3px solid #54c5c0;
		padding: 20px;
	}
	ol {
		display: grid;
		gap: 10px;
		list-style: none;
		padding: 0;
		margin: 12px 0 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 16px;
		min-width: 0;
		padding: 8px 16px;
		background: #162b43;
		border-inline-start: 2px solid #38526d;
		--asset-width: 88px;
		--asset-height: 88px;
	}
	.slot {
		font-size: 18px;
		color: #54c5c0;
		font-variant-numeric: tabular-nums;
	}
	.readiness {
		margin: 8px 0 0;
		color: #9fb2c8;
		font-size: 18px;
	}
</style>
