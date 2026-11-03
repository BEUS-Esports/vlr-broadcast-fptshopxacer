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
		background: linear-gradient(180deg, #1b2430, #0f1f2b);
		border-bottom: 3px solid var(--gfx-line);
	}
	li::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(180deg, transparent 62%, #081219e8 100%);
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

	/* ===== VCT Pacific ===== */
	.team {
		background: #10222e;
		clip-path: none;
		border: 0;
		box-shadow: none;
	}
	header {
		background: #3ad7dc;
		color: #06222a;
		clip-path: none;
		border: 0;
	}
	header :global(.identity strong) {
		color: #06222a;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 34px;
	}
	header :global(.identity small) {
		color: #0b1822;
		font-family: Barlow, 'Segoe UI', sans-serif;
	}
	.team-index {
		color: #0b1822;
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
	}
	li {
		background: #0b1822;
		border: 0;
		clip-path: none;
	}
	li::after {
		background: linear-gradient(180deg, transparent 55%, #06121acc);
	}
	.slot {
		color: #3ad7dc;
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
	}
	li :global(.identity strong) {
		color: #fff;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 26px;
		letter-spacing: 0.02em;
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
	.team {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.35s;
	}
	.team:nth-child(1) {
		animation-delay: 0.35s;
	}
	.team:nth-child(2) {
		animation-delay: 0.47s;
	}
	li {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.55s;
	}
	li:nth-child(1) {
		animation-delay: 0.55s;
	}
	li:nth-child(2) {
		animation-delay: 0.62s;
	}
	li:nth-child(3) {
		animation-delay: 0.69s;
	}
	li:nth-child(4) {
		animation-delay: 0.76s;
	}
	li:nth-child(5) {
		animation-delay: 0.83s;
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
