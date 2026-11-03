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
		background: linear-gradient(90deg, transparent, #0f1f2bf4 22%, #0f1f2bf4 78%, transparent);
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
		background: #20475a;
		border-left: 3px solid var(--gfx-line);
	}
	.side[data-side='attack'] {
		border-color: var(--gfx-attack);
		color: #8fb8ff;
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
		background: linear-gradient(90deg, #111720, #15303d);
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
		background: linear-gradient(90deg, #15303d, #1b2530);
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

	/* ===== VCT Pacific ===== */
	.map-strip {
		background: #10222e;
		border: 0;
		clip-path: none;
	}
	.map-strip > span {
		color: #3ad7dc;
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
		letter-spacing: 0.14em;
	}
	.map-strip :global(.identity strong) {
		color: #fff;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 30px;
	}
	.team {
		background: #10222e;
		clip-path: none;
		border: 0;
		box-shadow: none;
	}
	header {
		background: #3ad7dc;
		clip-path: none;
		border: 0;
	}
	header :global(.identity strong) {
		color: #06222a;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 32px;
	}
	header :global(.identity small) {
		color: #0b1822;
		font-family: Barlow, 'Segoe UI', sans-serif;
	}
	.side {
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
	}
	li {
		background: #16303f;
		border: 0;
		clip-path: none;
	}
	.slot {
		color: #3ad7dc;
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
	}
	.player :global(.identity strong),
	.agent :global(.identity strong) {
		color: #fff;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 26px;
	}
	.agent :global(.identity small) {
		color: #3ad7dc;
		font-family: Barlow, 'Segoe UI', sans-serif;
	}
	.agent {
		background: #0b1822;
	}

	/* ===== VCT Pacific: animation xuất hiện (quét trái→phải lần lượt, chớp lime) ===== */
	@keyframes vctWipe {
		from {
			clip-path: inset(0 100% 0 0);
		}
		to {
			clip-path: inset(0 0 0 0);
		}
	}
	@keyframes vctFlash {
		0% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes vctDrop {
		from {
			transform: translateY(-24px);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}
	.map-strip {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.3s;
	}
	.map-strip:nth-child(1) {
		animation-delay: 0.3s;
	}
	.team {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.4s;
	}
	.team:nth-child(1) {
		animation-delay: 0.4s;
	}
	.team:nth-child(2) {
		animation-delay: 0.52s;
	}
	li {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.6s;
	}
	li:nth-child(1) {
		animation-delay: 0.6s;
	}
	li:nth-child(2) {
		animation-delay: 0.67s;
	}
	li:nth-child(3) {
		animation-delay: 0.74s;
	}
	li:nth-child(4) {
		animation-delay: 0.81s;
	}
	li:nth-child(5) {
		animation-delay: 0.88s;
	}
	li::before {
		content: '';
		position: absolute;
		inset: 0;
		background: #b7ff3c;
		z-index: 9;
		pointer-events: none;
		animation: vctFlash 0.32s ease-out both;
		animation-delay: inherit;
	}
</style>
