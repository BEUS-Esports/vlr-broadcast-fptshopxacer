<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, lineupForTeam, gameplaySide } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';
	import ResourceCard from '../../primitives/ResourceCard.svelte';
	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
</script>

<div class="map">
	<ResourceCard resource={{ kind: 'map', value: snapshot.game?.map ?? null }} />
</div>
<div class="teams">
	{#each ['left', 'right'] as position (position)}
		{@const team = position === 'left' ? teams.left : teams.right}
		{@const entryId =
			position === 'left' ? snapshot.presentation.leftEntryId : snapshot.presentation.rightEntryId}
		{@const lineup = lineupForTeam(snapshot, entryId)}
		{@const side = gameplaySide(snapshot, entryId, 'prepared')}
		<div class="team" data-position={position} data-entry-id={entryId}>
			<Identity
				name={team?.name ?? null}
				assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
				detail={team?.tag}
				unavailable="Team unavailable"
				{side}
			/>
			{#if !side}<p>Starting side unavailable</p>{/if}
			<ol>
				{#each [1, 2, 3, 4, 5] as slot (slot)}
					{@const saved = lineup.find((saved) => saved.slot === slot)}
					<li data-slot={slot}>
						<div class="player">
							<small>Player · Slot {slot}</small><ResourceCard
								resource={{ kind: 'player', value: saved?.player ?? null }}
							/>
						</div>
						<div class="agent">
							<small>Agent</small><ResourceCard
								resource={{ kind: 'agent', value: saved?.agent ?? null }}
							/>
						</div>
					</li>
				{/each}
			</ol>
		</div>
	{/each}
</div>

<style>
	.map {
		margin-bottom: 16px;
		padding: 8px 16px;
		background: #101d30f2;
		--asset-width: 140px;
		--asset-height: 64px;
	}
	.teams {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 32px;
	}
	.team {
		min-width: 0;
		--asset-width: 60px;
		--asset-height: 60px;
	}
	ol {
		display: grid;
		gap: 10px;
		list-style: none;
		padding: 0;
		margin: 12px 0 0;
	}
	li {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		padding: 8px;
		background: #101d30f2;
		border-bottom: 1px solid #38526d;
	}
	small {
		display: block;
		padding: 4px 8px 0;
		font-size: 13px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #9fb2c8;
	}
	.agent {
		background: #162b43;
		--asset-width: 56px;
		--asset-height: 56px;
	}
	.player {
		--asset-width: 56px;
		--asset-height: 56px;
		min-width: 0;
	}
	p {
		margin: 0;
		font-size: 18px;
	}
</style>
