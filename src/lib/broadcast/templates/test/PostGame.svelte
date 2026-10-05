<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, teamScore, lineupForTeam, playerInScope } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';
	import ResourceCard from '../../primitives/ResourceCard.svelte';
	import StatsFields from './StatsFields.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
</script>

<div class="scoreboard">
	{#each ['left', 'right'] as position (position)}
		{@const team = position === 'left' ? teams.left : teams.right}
		{@const entryId =
			position === 'left' ? snapshot.presentation.leftEntryId : snapshot.presentation.rightEntryId}
		<div class="score-team" data-position={position} data-entry-id={entryId ?? ''}>
			<Identity
				name={team?.name ?? null}
				detail={team?.tag}
				assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
				unavailable="Team unavailable"
			/>
			<strong class="score">{teamScore(snapshot, entryId, 'game') ?? '—'}</strong>
		</div>
	{/each}
	<div class="result">
		<strong>FINAL</strong>
		<span>{snapshot.game?.map?.displayName ?? 'MAP TBD'}</span>
	</div>
</div>

<div class="rosters">
	{#each ['left', 'right'] as position (position)}
		{@const entryId =
			position === 'left' ? snapshot.presentation.leftEntryId : snapshot.presentation.rightEntryId}
		{@const lineup = lineupForTeam(snapshot, entryId)}
		<div class="roster" data-roster-position={position} data-entry-id={entryId}>
			{#each [1, 2, 3, 4, 5] as slot (slot)}
				{@const saved = lineup.find((row) => row.slot === slot)}
				{@const statistics = playerInScope(
					snapshot,
					'game',
					saved?.player?.playerId ?? null
				).statistics}
				<article
					data-slot={slot}
					data-mvp={!!saved?.player && saved.player.playerId === snapshot.scopes.game.mvpPlayerId}
				>
					<div class="player">
						<ResourceCard resource={{ kind: 'player', value: saved?.player ?? null }} />
						<span>{saved?.agent?.displayName ?? 'AGENT TBD'}</span>
						{#if saved?.player && saved.player.playerId === snapshot.scopes.game.mvpPlayerId}
							<strong class="mvp">MVP</strong>
						{/if}
					</div>
					<StatsFields {statistics} scope="game" />
				</article>
			{/each}
		</div>
	{/each}
</div>

<style>
	.scoreboard {
		position: relative;
		height: 118px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 138px;
		align-items: center;
		padding-inline: 26px;
		background: linear-gradient(90deg, #10151df5, #171e28f5 50%, #10151df5);
		border-block: 1px solid var(--gfx-line);
		clip-path: polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px);
	}
	.score-team {
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
	}
	.score-team[data-position='right'] {
		flex-direction: row-reverse;
	}
	.score-team :global(.identity) {
		flex: 1;
		border: 0;
		padding: 4px 0;
		gap: 14px;
		--asset-width: 66px;
		--asset-height: 66px;
	}
	.score-team[data-position='right'] :global(.identity) {
		flex-direction: row-reverse;
		text-align: right;
	}
	.score-team :global(.identity strong) {
		font:
			800 27px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.score-team :global(.identity small) {
		margin-top: 4px;
		color: var(--gfx-muted);
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.score {
		flex: 0 0 auto;
		color: var(--gfx-ink);
		font:
			900 60px/0.9 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		font-variant-numeric: tabular-nums;
	}
	.result {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 116px;
		text-align: center;
		transform: translate(-50%, -50%);
	}
	.result strong {
		display: block;
		color: var(--gfx-accent);
		font:
			900 21px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}
	.result span {
		display: block;
		margin-top: 6px;
		color: var(--gfx-muted);
		font:
			700 10px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rosters {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 22px;
		margin-top: 12px;
	}
	.roster {
		min-width: 0;
		display: grid;
		gap: 6px;
	}
	article {
		position: relative;
		height: 108px;
		min-width: 0;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 202px minmax(0, 1fr);
		gap: 8px;
		padding: 7px;
		overflow: hidden;
		background: var(--gfx-panel);
		border-left: 2px solid var(--gfx-line);
	}
	article[data-mvp='true'] {
		border-left-color: var(--gfx-accent);
		background: linear-gradient(90deg, var(--gfx-accent-soft), var(--gfx-panel) 36%);
	}
	.player {
		position: relative;
		min-width: 0;
		overflow: hidden;
		border-right: 1px solid var(--gfx-line);
	}
	.player :global(.identity) {
		height: 61px;
		box-sizing: border-box;
		border: 0;
		padding: 3px 5px;
		gap: 8px;
		--asset-width: 48px;
		--asset-height: 48px;
	}
	.player :global(.identity strong) {
		font:
			800 15px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.player > span {
		display: block;
		padding-left: 61px;
		color: var(--gfx-muted);
		font:
			700 9px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mvp {
		position: absolute;
		right: 5px;
		top: 5px;
		padding: 4px 6px;
		color: var(--gfx-bg);
		background: var(--gfx-accent);
		font:
			900 8px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}
	article :global(.fields) {
		align-self: center;
		gap: 4px;
	}
	article :global(.fields [data-field]) {
		min-height: 43px;
		padding: 5px 7px;
	}
	article :global(.fields strong) {
		font-size: 17px;
	}
	article :global(.fields span) {
		margin-top: 3px;
		font-size: 7px;
	}
	article :global(.fields small) {
		display: none;
	}
</style>
