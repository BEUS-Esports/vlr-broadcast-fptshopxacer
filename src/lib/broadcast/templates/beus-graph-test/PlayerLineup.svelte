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
		<section class="team" data-position={position} data-entry-id={entryId}>
			<header>
				<span class="team-index">{position === 'left' ? '01' : '02'}</span>
				<Identity
					name={team?.name ?? null}
					assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
					detail={team?.tag}
					unavailable="Team unavailable"
				/>
			</header>
			<ol>
				{#each [1, 2, 3, 4, 5] as slot (slot)}
					{@const saved = lineup.find((row) => row.slot === slot)}
					<li data-slot={slot} class:empty={!saved?.player}>
						<span class="slot">0{slot}</span>
						<ResourceCard
							resource={{
								kind: 'player',
								value: saved?.player ?? null
							}}
						/>
					</li>
				{/each}
			</ol>
		</section>
	{/each}
</div>

<style>
	.teams {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 22px;
	}
	.team {
		min-width: 0;
		height: 652px;
		box-sizing: border-box;
		padding: 0 18px 18px;
		background:
			linear-gradient(180deg, var(--gfx-accent-soft), transparent 110px), var(--gfx-panel);
		border-top: 3px solid var(--gfx-accent);
		border-bottom: 1px solid var(--gfx-line);
		clip-path: polygon(
			0 0,
			calc(100% - 18px) 0,
			100% 18px,
			100% 100%,
			18px 100%,
			0 calc(100% - 18px)
		);
	}
	header {
		height: 112px;
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.team-index {
		flex: 0 0 auto;
		color: var(--gfx-accent);
		font:
			800 18px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.12em;
	}
	header :global(.identity) {
		flex: 1;
		border: 0;
		padding: 10px 0;
		gap: 18px;
		--asset-width: 70px;
		--asset-height: 70px;
	}
	header :global(.identity strong) {
		font:
			800 31px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}
	header :global(.identity small) {
		margin-top: 5px;
		color: var(--gfx-muted);
		font:
			700 12px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	ol {
		height: 504px;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 7px;
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		position: relative;
		min-width: 0;
		overflow: hidden;
		background: linear-gradient(180deg, #1b2430, #170c3a);
		border-bottom: 3px solid var(--gfx-line);
	}
	li::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(180deg, transparent 62%, #0b0620e8 100%);
	}
	li.empty {
		opacity: 0.66;
	}
	.slot {
		position: absolute;
		z-index: 3;
		left: 12px;
		top: 12px;
		color: var(--gfx-accent);
		font:
			800 13px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.1em;
	}
	li :global(.identity) {
		position: relative;
		z-index: 2;
		height: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: end;
		gap: 0;
		padding: 34px 10px 16px;
		border: 0;
		text-align: center;
		--asset-width: 100%;
		--asset-height: 360px;
	}
	li :global(.asset) {
		position: absolute;
		inset: 32px 0 auto;
		width: 100%;
	}
	li :global(.asset img) {
		object-position: center bottom;
	}
	li :global(.identity > div) {
		position: relative;
		z-index: 2;
		margin-top: auto;
		padding-top: 8px;
	}
	li :global(.identity strong) {
		font:
			800 18px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	li :global(.identity small) {
		margin-top: 5px;
		color: var(--gfx-muted);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
</style>
