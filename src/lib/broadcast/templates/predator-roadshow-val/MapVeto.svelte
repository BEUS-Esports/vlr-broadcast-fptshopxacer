<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { competitionTeams, teamByEntryId, vetoActor } from '../../selectors';
	import Asset from '../../primitives/Asset.svelte';
	import Header from './Header.svelte';
	import { sideLabels, vetoLabels } from './labels';
	import { fitGroup } from './fit';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(competitionTeams(snapshot));
	const steps = $derived([...snapshot.veto].sort((a, b) => a.sequence - b.sequence));
</script>

<Header />
<div
	class="veto"
	{@attach fitGroup('teams')}
	{@attach fitGroup('maps')}
	style:--count={Math.max(steps.length, 1)}
>
	<div class="matchup">
		{#each [teams.teamA, teams.teamB] as team, index (index)}
			<div class={['team', index ? 'right' : 'left']}>
				<Asset
					path={team?.logoPath ?? team?.logoWhitePath ?? null}
					label={team?.name ?? 'Team'}
					blankMissing
				/>
				<strong data-fit="teams">{team?.name ?? 'Team unavailable'}</strong>
			</div>
		{/each}
		<h2>CẤM CHỌN BẢN ĐỒ</h2>
	</div>
	<ol>
		{#each steps as step (step.sequence)}
			{@const actor = vetoActor(snapshot, step)}
			{@const chooser = teamByEntryId(snapshot, step.sideChooserEntryId)}
			<li class={step.action} data-sequence={step.sequence}>
				<div class="tile">
					<span class="art">
						<Asset
							path={step.map?.splashPath ?? step.map?.listViewIconPath ?? null}
							label={step.map?.displayName ?? 'Map'}
							blankMissing
						/>
					</span>
					{#if step.action === 'ban'}<span class="ban-mark" aria-hidden="true"></span>{/if}
					{#if step.sideChoice}
						<span class="side">
							{chooser?.tag ?? chooser?.name ?? ''} CHỌN {sideLabels[step.sideChoice]}
						</span>
					{/if}
					{#if step.gameNumber !== null}<span class="game">GAME {step.gameNumber}</span>{/if}
					<strong class="map-name" data-fit="maps">{step.map?.displayName ?? 'TBD'}</strong>
				</div>
				<div class="plate">
					{#if step.action !== 'decider'}<strong data-actor
							>{actor?.tag ?? actor?.name ?? '—'}</strong
						>{/if}
					<small>{vetoLabels[step.action]}</small>
				</div>
			</li>
		{/each}
	</ol>
</div>

<style>
	.veto {
		position: absolute;
		inset: 0;
	}
	.matchup {
		position: absolute;
		left: 60px;
		right: 60px;
		top: 196px;
		height: 96px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 40px;
	}
	h2 {
		grid-column: 2;
		grid-row: 1;
		margin: 0;
		padding: 14px 44px;
		color: var(--rs-ink-dark);
		background: linear-gradient(180deg, var(--rs-plate-from), var(--rs-plate-to));
		font: 900 34px/1 var(--rs-font);
		clip-path: polygon(
			16px 0,
			calc(100% - 16px) 0,
			100% 50%,
			calc(100% - 16px) 100%,
			16px 100%,
			0 50%
		);
	}
	.team {
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: 22px;
		min-width: 0;
		--asset-width: 84px;
		--asset-height: 84px;
	}
	.team.left {
		grid-column: 1;
	}
	.team.right {
		grid-column: 3;
		flex-direction: row-reverse;
		text-align: right;
	}
	.team strong {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		white-space: nowrap;
		font: 900 calc(52px * var(--fit-teams, 1)) / 1.1 var(--rs-font);
		text-transform: uppercase;
	}
	ol {
		position: absolute;
		left: 60px;
		right: 60px;
		top: 330px;
		bottom: 70px;
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(var(--count), minmax(0, 1fr));
		gap: 14px;
	}
	li {
		display: grid;
		grid-template-rows: 1fr 116px;
		gap: 10px;
		min-width: 0;
		animation: rs-rise 0.35s ease-out both;
	}
	li:nth-child(2) {
		animation-delay: 0.05s;
	}
	li:nth-child(3) {
		animation-delay: 0.1s;
	}
	li:nth-child(4) {
		animation-delay: 0.15s;
	}
	li:nth-child(5) {
		animation-delay: 0.2s;
	}
	li:nth-child(6) {
		animation-delay: 0.25s;
	}
	li:nth-child(7) {
		animation-delay: 0.3s;
	}
	.tile {
		position: relative;
		overflow: hidden;
		background: #000;
		border: 2px solid var(--rs-line);
		clip-path: polygon(
			14px 0,
			100% 0,
			100% calc(100% - 14px),
			calc(100% - 14px) 100%,
			0 100%,
			0 14px
		);
	}
	.art {
		position: absolute;
		inset: 0;
		--asset-width: 100%;
		--asset-height: 100%;
	}
	.art :global(img) {
		object-fit: cover;
	}
	.ban .art {
		filter: grayscale(1) brightness(0.38);
	}
	.ban-mark {
		position: absolute;
		left: 50%;
		top: 44%;
		width: 46%;
		aspect-ratio: 1;
		translate: -50% -50%;
		border: 12px solid var(--rs-plate-to);
		border-radius: 50%;
		box-sizing: border-box;
	}
	.ban-mark::after {
		content: '';
		position: absolute;
		left: 50%;
		top: -6%;
		width: 12px;
		height: 112%;
		translate: -50% 0;
		rotate: -45deg;
		background: var(--rs-plate-to);
	}
	.tile::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 42%;
		background: linear-gradient(180deg, transparent, #000000d9);
	}
	.map-name {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 22px;
		z-index: 1;
		padding: 0 10px;
		overflow: hidden;
		white-space: nowrap;
		text-align: center;
		font: 900 calc(40px * var(--fit-maps, 1)) / 1 var(--rs-font);
		text-transform: uppercase;
	}
	.pick .map-name,
	.decider .map-name {
		color: var(--rs-plate-to);
	}
	.side {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		z-index: 1;
		padding: 10px 0;
		text-align: center;
		background: #000000c0;
		font: 700 17px/1 var(--rs-font);
		white-space: nowrap;
	}
	.game {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 70px;
		z-index: 1;
		text-align: center;
		color: var(--rs-label);
		font: 700 18px/1 var(--rs-font);
		letter-spacing: 0.12em;
	}
	.plate {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--rs-ink);
		background:
			linear-gradient(90deg, #1cfffa1f 1px, transparent 1px) 0 0 / 28px 28px,
			linear-gradient(180deg, #1cfffa1f 1px, transparent 1px) 0 0 / 28px 28px,
			linear-gradient(180deg, #003a7cd9, #007a8ad9);
		border: 2px solid var(--rs-line);
	}
	.plate strong {
		font: 900 40px/1 var(--rs-font);
	}
	.plate small {
		font: 700 17px/1.1 var(--rs-font);
		text-align: center;
	}
	@keyframes rs-rise {
		from {
			opacity: 0;
			translate: 0 30px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		li {
			animation: none;
		}
	}
</style>
