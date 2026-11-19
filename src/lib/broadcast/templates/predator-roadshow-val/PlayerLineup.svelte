<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, lineupForTeam, lineupTeamVisible } from '../../selectors';
	import Asset from '../../primitives/Asset.svelte';
	import Header from './Header.svelte';
	import PlayerCard from './PlayerCard.svelte';
	import { fitGroup } from './fit';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const winnerMode = $derived(snapshot.liveControls.lineupTeams === 'winner');
	const shown = $derived.by(() => {
		const teams = presentationTeams(snapshot);
		return [
			{ position: 'left', entryId: snapshot.presentation.leftEntryId, team: teams.left },
			{ position: 'right', entryId: snapshot.presentation.rightEntryId, team: teams.right }
		].filter((side) => lineupTeamVisible(snapshot, side.entryId));
	});
</script>

<!-- Winner mode without a saved winner shows nothing rather than an empty WINNER page. -->
{#if !winnerMode || shown.length}<Header title={winnerMode ? 'WINNER' : undefined} />{/if}
<div
	class={['lineup', { both: shown.length > 1 }]}
	{@attach fitGroup('players')}
	{@attach fitGroup('teams')}
>
	{#each shown as side (side.position)}
		{@const lineup = lineupForTeam(snapshot, side.entryId)}
		<section class="team" data-position={side.position} data-entry-id={side.entryId}>
			<div class="identity" data-rs-motion="identity">
				<span class="logo">
					<Asset
						path={side.team?.logoPath ?? side.team?.logoWhitePath ?? null}
						label={side.team?.name ?? 'Team'}
						blankMissing
					/>
				</span>
				<strong data-fit="teams">{side.team?.name ?? 'Team unavailable'}</strong>
			</div>
			<ol class="cards">
				{#each [1, 2, 3, 4, 5] as slot (slot)}
					{@const saved = lineup.find((row) => row.slot === slot)}
					<li data-slot={slot} data-rs-motion="card">
						<PlayerCard
							name={saved?.player?.displayName ?? null}
							tag={side.team?.tag ?? null}
							portraitPath={saved?.player?.portraitPath ?? null}
							iconPath={saved?.agent?.roleIconPath ?? null}
							size={shown.length > 1 ? 'compact' : 'lineup'}
						/>
					</li>
				{/each}
			</ol>
		</section>
	{/each}
</div>

<style>
	.lineup {
		position: absolute;
		inset: 0;
	}
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* One team: five tall cards, big team lockup bottom-left (reference 0_roadshow). */
	.team {
		position: absolute;
		inset: 0;
	}
	.cards {
		position: absolute;
		left: 62px;
		right: 62px;
		top: 228px;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 26px;
	}
	.identity {
		position: absolute;
		left: 86px;
		right: 860px;
		top: 880px;
		height: 150px;
		display: flex;
		align-items: center;
		gap: 40px;
	}
	.logo {
		flex: none;
		--asset-width: 140px;
		--asset-height: 140px;
	}
	.identity strong {
		display: block;
		min-width: 0;
		flex: 1;
		overflow: hidden;
		white-space: nowrap;
		font: 900 calc(118px * var(--fit-teams, 1)) / 1.1 var(--rs-font);
		text-transform: uppercase;
		background: linear-gradient(180deg, #4ff6ff 0%, #13c9ff 55%, #0a8dff 100%);
		background-clip: text;
		color: transparent;
	}
	/* Both teams: two rows, team identity on the left of each row. */
	.both .team:first-child {
		inset: 214px 0 auto;
		height: 410px;
	}
	.both .team:last-child {
		inset: 640px 0 auto;
		height: 410px;
	}
	.both .cards {
		left: 690px;
		right: 62px;
		top: 0;
		gap: 16px;
	}
	.both .identity {
		left: 70px;
		right: auto;
		width: 580px;
		top: 0;
		height: 100%;
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		gap: 18px;
	}
	.both .identity strong {
		width: 100%;
		flex: none;
		font-size: calc(76px * var(--fit-teams, 1));
	}
	.both .logo {
		--asset-width: 120px;
		--asset-height: 120px;
	}
</style>
