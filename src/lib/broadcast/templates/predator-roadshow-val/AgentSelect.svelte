<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, lineupForTeam, gameplaySide } from '../../selectors';
	import Asset from '../../primitives/Asset.svelte';
	import { sideLabels } from './labels';
	import { fitGroup } from './fit';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
	const sides = $derived([
		{ position: 'left', entryId: snapshot.presentation.leftEntryId, team: teams.left },
		{ position: 'right', entryId: snapshot.presentation.rightEntryId, team: teams.right }
	]);
</script>

<div class="band" {@attach fitGroup('players')} {@attach fitGroup('teams')}>
	{#each sides as { position, entryId, team } (position)}
		{@const lineup = lineupForTeam(snapshot, entryId)}
		{@const side = gameplaySide(snapshot, entryId, 'prepared')}
		<section class={['team', position]} data-position={position} data-entry-id={entryId}>
			<span class="logo">
				<Asset
					path={team?.logoPath ?? team?.logoWhitePath ?? null}
					label={team?.name ?? 'Team'}
					blankMissing
				/>
			</span>
			<ol>
				{#each [1, 2, 3, 4, 5] as slot (slot)}
					{@const saved = lineup.find((row) => row.slot === slot)}
					<li data-slot={slot}>
						<span class="agent">
							<Asset
								path={saved?.agent?.displayIconPath ?? null}
								label={saved?.agent?.displayName ?? 'Agent'}
								blankMissing
							/>
						</span>
						<span class="name" data-fit="players">{saved?.player?.displayName ?? '—'}</span>
					</li>
				{/each}
			</ol>
			<strong class="team-name" data-fit="teams">{team?.name ?? 'Team unavailable'}</strong>
			<span class={['side', side ?? 'unknown']}>{side ? sideLabels[side] : '—'}</span>
		</section>
	{/each}
	<div class="map">
		<small>BẢN ĐỒ</small>
		<strong>{snapshot.game?.map?.displayName ?? 'TBD'}</strong>
	</div>
</div>

<style>
	.band {
		position: absolute;
		inset: auto 0 0;
		height: 236px;
		animation: rs-up 0.4s ease-out both;
	}
	.band::before {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 46px;
		background: linear-gradient(180deg, #000000b3, #000000e6);
		border-top: 1px solid #1cfffa55;
	}
	.team {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 940px;
	}
	.left {
		left: 0;
	}
	.right {
		right: 0;
	}
	.logo {
		position: absolute;
		top: 42px;
		width: 128px;
		height: 128px;
		display: grid;
		place-items: center;
		background: #04161cdd;
		border: 2px solid var(--rs-line);
		--asset-width: 96px;
		--asset-height: 96px;
	}
	.left .logo {
		left: 12px;
	}
	.right .logo {
		right: 12px;
	}
	ol {
		position: absolute;
		top: 0;
		margin: 0;
		padding: 10px;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(5, 132px);
		gap: 10px;
		background: #04161ccc;
		border: 2px solid var(--rs-line);
		clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%, 0 14px);
	}
	.left ol {
		left: 156px;
	}
	.right ol {
		right: 156px;
	}
	li {
		display: grid;
		grid-template-rows: 132px auto;
		gap: 6px;
		min-width: 0;
	}
	.agent {
		display: block;
		background: linear-gradient(180deg, #0b4048, #021316);
		border: 1px solid #1cfffa88;
		--asset-width: 100%;
		--asset-height: 100%;
	}
	.name {
		display: block;
		padding: 0 4px;
		overflow: hidden;
		white-space: nowrap;
		text-align: center;
		font: 700 calc(19px * var(--fit-players, 1)) / 1.2 var(--rs-font);
	}
	.team-name {
		position: absolute;
		bottom: 6px;
		width: 640px;
		overflow: hidden;
		white-space: nowrap;
		font: 900 calc(30px * var(--fit-teams, 1)) / 1.15 var(--rs-font);
		text-transform: uppercase;
	}
	.left .team-name {
		left: 156px;
	}
	.right .team-name {
		right: 156px;
		text-align: right;
	}
	.side {
		position: absolute;
		bottom: 0;
		width: 140px;
		height: 46px;
		display: grid;
		place-items: center;
		color: var(--rs-ink-dark);
		font: 900 26px/1 var(--rs-font);
	}
	.left .side {
		left: 0;
	}
	.right .side {
		right: 0;
	}
	.attack {
		background: linear-gradient(90deg, #ff4655, #ff8a7a);
	}
	.defense {
		background: linear-gradient(90deg, var(--rs-plate-from), var(--rs-plate-to));
	}
	.unknown {
		background: #4a5a60;
	}
	.map {
		position: absolute;
		left: 50%;
		bottom: 2px;
		translate: -50% 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.map small {
		font: 700 16px/1 var(--rs-font);
	}
	.map strong {
		color: var(--rs-plate-to);
		font: 900 30px/1.15 var(--rs-font);
		text-transform: uppercase;
	}
	@keyframes rs-up {
		from {
			opacity: 0;
			translate: 0 60px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.band {
			animation: none;
		}
	}
</style>
