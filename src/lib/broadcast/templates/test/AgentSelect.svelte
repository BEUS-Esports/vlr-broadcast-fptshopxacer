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
						<ResourceCard resource={{ kind: 'player', value: saved?.player ?? null }} />
						<ResourceCard resource={{ kind: 'agent', value: saved?.agent ?? null }} />
					</li>
				{/each}
			</ol>
		</div>
	{/each}
</div>

<style>
	.map {
		position: absolute;
		top: 0;
		right: 0;
		width: 560px;
		--asset-width: 140px;
		--asset-height: 64px;
	}
	.teams {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 40px;
	}
	.team {
		min-width: 0;
		--asset-width: 80px;
		--asset-height: 80px;
	}
	ol {
		display: grid;
		gap: 16px;
		list-style: none;
		padding: 0;
		margin: 24px 0 0;
	}
	li {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		padding: 8px;
		background: #111e;
	}
	p {
		margin: 0;
		font-size: 18px;
	}
</style>
