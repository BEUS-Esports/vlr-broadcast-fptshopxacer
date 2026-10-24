<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { competitionTeams, vetoActor, teamByEntryId } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';
	import ResourceCard from '../../primitives/ResourceCard.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(competitionTeams(snapshot));
	const sequence = $derived([...snapshot.veto].sort((a, b) => a.sequence - b.sequence));
</script>

<div class="matchup">
	<div class="team">
		<Identity
			name={teams.teamA?.name ?? null}
			assetPath={teams.teamA?.logoPath ??
				teams.teamA?.logoWhitePath ??
				teams.teamA?.logoBlackPath ??
				null}
			detail={teams.teamA?.tag}
			unavailable="Team unavailable"
		/>
	</div>
	<div class="versus"><span>MAP</span><strong>VETO</strong></div>
	<div class="team right">
		<Identity
			name={teams.teamB?.name ?? null}
			assetPath={teams.teamB?.logoPath ??
				teams.teamB?.logoWhitePath ??
				teams.teamB?.logoBlackPath ??
				null}
			detail={teams.teamB?.tag}
			unavailable="Team unavailable"
		/>
	</div>
</div>

<ol class:dense={sequence.length > 8}>
	{#each sequence as step (step.sequence)}
		{@const actor = vetoActor(snapshot, step)}
		{@const chooser = teamByEntryId(snapshot, step.sideChooserEntryId)}
		<li data-sequence={step.sequence} data-actor-entry-id={step.actingEntryId}>
			<div class="step-head">
				<span class="sequence">{String(step.sequence).padStart(2, '0')}</span>
				<strong>{step.action}</strong>
				{#if step.gameNumber !== null}<span class="game">GAME {step.gameNumber}</span>{/if}
			</div>
			<div class="map">
				<ResourceCard resource={{ kind: 'map', value: step.map }} />
			</div>
			<div class="decision">
				<strong>{actor?.name ?? 'Team unavailable'}</strong>
				{#if step.sideChooserEntryId !== null || step.sideChoice !== null}
					<small>
						{chooser?.tag ?? chooser?.name ?? 'Team'} · {step.sideChoice === 'attack'
							? 'ATTACK'
							: step.sideChoice === 'defense'
								? 'DEFENSE'
								: 'SIDE TBD'}
					</small>
				{:else}
					<small
						>{step.action === 'ban'
							? 'REMOVED'
							: step.action === 'pick'
								? 'SELECTED'
								: 'DECIDER'}</small
					>
				{/if}
			</div>
		</li>
	{:else}
		<li class="empty-veto">VETO TBD</li>
	{/each}
</ol>

<style>
	.matchup {
		height: 112px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 160px minmax(0, 1fr);
		align-items: center;
		background: linear-gradient(90deg, #0f1f2bf4, #15303df4 50%, #0f1f2bf4);
		border-block: 1px solid var(--gfx-line);
		clip-path: polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px);
	}
	.team {
		min-width: 0;
		padding-inline: 26px;
	}
	.team.right {
		text-align: right;
	}
	.team :global(.identity) {
		border: 0;
		padding: 6px 0;
		--asset-width: 66px;
		--asset-height: 66px;
	}
	.team.right :global(.identity) {
		flex-direction: row-reverse;
	}
	.team :global(.identity strong) {
		font:
			800 28px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.team :global(.identity small) {
		margin-top: 5px;
		color: var(--gfx-muted);
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.versus {
		text-align: center;
		color: var(--gfx-muted);
		font:
			700 11px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.18em;
	}
	.versus strong {
		display: block;
		margin-top: 5px;
		color: var(--gfx-accent);
		font:
			800 25px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}
	ol {
		height: 622px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		grid-auto-rows: minmax(0, 1fr);
		gap: 12px;
		padding: 0;
		margin: 14px 0 0;
		list-style: none;
		overflow: hidden;
	}
	ol.dense {
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 9px;
	}
	li {
		position: relative;
		min-width: 0;
		min-height: 0;
		box-sizing: border-box;
		overflow: hidden;
		padding: 14px;
		background: linear-gradient(145deg, #151c25f5, #0d1118f5);
		border-top: 3px solid var(--gfx-accent);
		border-bottom: 1px solid var(--gfx-line);
	}
	.step-head {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: baseline;
		gap: 10px;
	}
	.sequence {
		color: var(--gfx-muted);
		font:
			700 12px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}
	.step-head strong {
		color: var(--gfx-accent);
		font:
			800 18px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.game {
		color: var(--gfx-ink);
		font:
			700 10px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.09em;
	}
	.map {
		margin-top: 8px;
		height: calc(100% - 83px);
		min-height: 90px;
		background: #08121988;
		overflow: hidden;
	}
	.map :global(.identity) {
		height: 100%;
		box-sizing: border-box;
		flex-direction: column;
		justify-content: center;
		gap: 5px;
		padding: 7px;
		border: 0;
		text-align: center;
		--asset-width: 100%;
		--asset-height: min(104px, 48%);
	}
	.map :global(.identity strong) {
		font:
			800 19px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.map :global(.identity small) {
		display: none;
	}
	.decision {
		position: absolute;
		left: 14px;
		right: 14px;
		bottom: 12px;
		min-width: 0;
	}
	.decision strong {
		display: block;
		font:
			800 14px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.decision small {
		display: block;
		margin-top: 5px;
		color: var(--gfx-muted);
		font:
			700 10px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}
	.empty-veto {
		grid-column: 1 / -1;
		display: grid;
		place-items: center;
		color: var(--gfx-muted);
		font:
			800 28px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.1em;
	}
	ol.dense .map :global(.identity strong) {
		font-size: 16px;
	}
	ol.dense li {
		padding: 11px;
	}
	ol.dense .decision {
		left: 11px;
		right: 11px;
		bottom: 9px;
	}

	/* ===== VCT Pacific ===== */
	.matchup {
		background: #10222e;
		clip-path: none;
		border: 0;
	}
	.team :global(.identity strong) {
		color: #fff;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 34px;
	}
	.versus strong {
		color: #3ad7dc;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 40px;
	}
	.versus {
		color: #3ad7dc;
		font-family: Barlow, 'Segoe UI', sans-serif;
	}
	li {
		background: #10222e;
		border: 0;
		clip-path: none;
	}
	.step-head {
		background: #3ad7dc;
		color: #06222a;
	}
	.step-head strong,
	.sequence,
	.game {
		color: #06222a;
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
	}
	.map :global(.identity strong) {
		color: #fff;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 30px;
		text-shadow: 0 2px 8px #000a;
	}
	.decision strong {
		color: #fff;
		font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
		font-weight: 800;
		font-size: 20px;
	}
	.decision small {
		color: #3ad7dc;
		font-family: Barlow, 'Segoe UI', sans-serif;
		font-weight: 700;
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
	.matchup {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.3s;
	}
	.matchup:nth-child(1) {
		animation-delay: 0.3s;
	}
	li {
		position: relative;
		animation: vctWipe 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: 0.5s;
	}
	li:nth-child(1) {
		animation-delay: 0.5s;
	}
	li:nth-child(2) {
		animation-delay: 0.58s;
	}
	li:nth-child(3) {
		animation-delay: 0.66s;
	}
	li:nth-child(4) {
		animation-delay: 0.74s;
	}
	li:nth-child(5) {
		animation-delay: 0.82s;
	}
	li:nth-child(6) {
		animation-delay: 0.9s;
	}
	li:nth-child(7) {
		animation-delay: 0.98s;
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
