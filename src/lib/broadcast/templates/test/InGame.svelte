<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, gameplaySide } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';
	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
</script>

<section aria-label="In-Game" data-side-source={snapshot.sides.source}>
	{#if snapshot.selection}
		{#each ['left', 'right'] as position (position)}
			{@const team = position === 'left' ? teams.left : teams.right}
			{@const entryId =
				position === 'left'
					? snapshot.presentation.leftEntryId
					: snapshot.presentation.rightEntryId}
			{@const side = gameplaySide(snapshot, entryId)}
			<div class="team" data-position={position} data-entry-id={entryId ?? ''}>
				<Identity
					name={team?.name ?? null}
					detail={team?.tag}
					assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
					unavailable="Team unavailable"
					{side}
				/>
				{#if !side}<small>Side unavailable</small>{/if}
			</div>
		{/each}
		<div class="context">
			<strong>{snapshot.tournament?.name ?? 'Tournament unavailable'}</strong>
			<p>{snapshot.game?.map?.displayName ?? 'Map unavailable'}</p>
			<p>
				{snapshot.game?.name ?? 'Game unavailable'}{#if snapshot.match}
					· BO{snapshot.match.bestOf}{/if}
			</p>
			<small
				>{snapshot.sides.source === 'prepared'
					? 'Prepared sides'
					: snapshot.sides.source === 'manual'
						? 'Manual sides'
						: 'Sides unavailable'}</small
			>
		</div>
	{:else}
		<p class="empty">No game selected</p>
	{/if}
</section>

<style>
	/* Provisional 1920x1080 rehearsal geometry: protect minimap x0–460/y0–420,
	   timer x460–1460/y0–200, killfeed x1460–1920/y0–420 and all y680–1080.
	   OBS/Valorant rehearsal must confirm or revise these bounds. */
	section {
		position: absolute;
		left: 480px;
		top: 224px;
		width: 960px;
		height: 112px;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 300px 360px 300px;
		align-items: center;
		overflow: hidden;
		color: white;
		background: #101d30e8;
		font:
			16px/1.25 'Segoe UI',
			sans-serif;
		border-block: 1px solid #38526d;
		--asset-width: 40px;
		--asset-height: 40px;
	}
	.team,
	.context {
		min-width: 0;
		overflow: hidden;
	}
	.team[data-position='left'] {
		grid-column: 1;
		grid-row: 1;
	}
	.team[data-position='right'] {
		grid-column: 3;
		grid-row: 1;
	}
	.context {
		grid-column: 2;
		grid-row: 1;
		padding: 8px;
		text-align: center;
	}
	.empty {
		grid-column: 1 / -1;
		text-align: center;
	}
	p {
		margin: 0;
	}
	section :global(.identity),
	section :global(.identity > div) {
		min-width: 0;
		overflow: hidden;
	}
	section :global(strong),
	section :global(small),
	p {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
