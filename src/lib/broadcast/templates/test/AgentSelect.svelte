<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, lineupForTeam, gameplaySide } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';
	import ResourceCard from '../../primitives/ResourceCard.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
</script>

<div class="map-strip">
	<span>MAP</span>
	<ResourceCard resource={{ kind: 'map', value: snapshot.game?.map ?? null }} />
</div>

<div class="teams">
	{#each ['left', 'right'] as position (position)}
		{@const team = position === 'left' ? teams.left : teams.right}
		{@const entryId =
			position === 'left' ? snapshot.presentation.leftEntryId : snapshot.presentation.rightEntryId}
		{@const lineup = lineupForTeam(snapshot, entryId)}
		{@const side = gameplaySide(snapshot, entryId, 'prepared')}
		<section class="team" data-position={position} data-entry-id={entryId}>
			<header>
				<Identity
					name={team?.name ?? null}
					assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
					detail={team?.tag}
					unavailable="Team unavailable"
					{side}
				/>
				<span class="side" data-side={side ?? 'neutral'}>
					{side === 'attack' ? 'ATTACK' : side === 'defense' ? 'DEFENSE' : 'SIDE TBD'}
				</span>
			</header>
			<ol>
				{#each [1, 2, 3, 4, 5] as slot (slot)}
					{@const saved = lineup.find((row) => row.slot === slot)}
					<li data-slot={slot}>
						<span class="slot">0{slot}</span>
						<div class="player">
							<ResourceCard resource={{ kind: 'player', value: saved?.player ?? null }} />
						</div>
						<div class="agent">
							<ResourceCard resource={{ kind: 'agent', value: saved?.agent ?? null }} />
						</div>
					</li>
				{/each}
			</ol>
		</section>
	{/each}
</div>

<style>
	.map-strip {
		height: 76px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 18px;
		padding: 8px 22px;
		background: linear-gradient(90deg, transparent, #10151df4 22%, #10151df4 78%, transparent);
		border-block: 1px solid var(--gfx-line);
	}
	.map-strip > span {
		color: var(--gfx-accent);
		font:
			800 12px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.18em;
	}
	.map-strip :global(.identity) {
		border: 0;
		padding: 0;
		gap: 12px;
		--asset-width: 76px;
		--asset-height: 52px;
	}
	.map-strip :global(.identity strong) {
		font:
			800 22px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.teams {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 22px;
		margin-top: 14px;
	}
	.team {
		min-width: 0;
		height: 632px;
		box-sizing: border-box;
		padding: 0 14px 14px;
		background: var(--gfx-panel);
		border-top: 3px solid var(--gfx-accent);
		overflow: hidden;
	}
	header {
		height: 88px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	header :global(.identity) {
		flex: 1;
		border: 0;
		padding: 6px 0;
		gap: 14px;
		--asset-width: 56px;
		--asset-height: 56px;
	}
	header :global(.identity strong) {
		font:
			800 26px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	header :global(.identity small) {
		margin-top: 4px;
		color: var(--gfx-muted);
		font:
			700 11px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.side {
		flex: 0 0 auto;
		padding: 8px 11px 7px;
		font:
			800 11px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.12em;
		background: #2a303a;
		border-left: 3px solid var(--gfx-line);
	}
	.side[data-side='attack'] {
		border-color: var(--gfx-attack);
		color: #76b7ff;
	}
	.side[data-side='defense'] {
		border-color: var(--gfx-defense);
		color: #ff7e88;
	}
	ol {
		display: grid;
		gap: 7px;
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		height: 98px;
		min-width: 0;
		display: grid;
		grid-template-columns: 36px minmax(0, 0.84fr) minmax(0, 1.16fr);
		align-items: stretch;
		overflow: hidden;
		background: linear-gradient(90deg, #111720, #171e28);
		border-bottom: 1px solid var(--gfx-line);
	}
	.slot {
		display: grid;
		place-items: center;
		color: var(--gfx-muted);
		font:
			800 11px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
		background: #0b0f15;
	}
	.player,
	.agent {
		min-width: 0;
		overflow: hidden;
	}
	.player {
		border-right: 1px solid var(--gfx-line);
	}
	.agent {
		background: linear-gradient(90deg, #171e28, #1b2530);
	}
	.player :global(.identity),
	.agent :global(.identity) {
		height: 100%;
		box-sizing: border-box;
		border: 0;
		padding: 8px 10px;
		gap: 10px;
		--asset-width: 70px;
		--asset-height: 80px;
	}
	.agent :global(.identity) {
		--asset-width: 84px;
		--asset-height: 88px;
	}
	.player :global(.identity strong),
	.agent :global(.identity strong) {
		font:
			800 17px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.player :global(.identity small),
	.agent :global(.identity small) {
		margin-top: 4px;
		color: var(--gfx-muted);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
</style>
