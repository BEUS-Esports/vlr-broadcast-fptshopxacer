<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import type { BroadcastScope } from '../../controls';
	import { playerInScope, teamByEntryId } from '../../selectors';
	import ResourceCard from '../../primitives/ResourceCard.svelte';
	import Identity from '../../primitives/Identity.svelte';
	import StatsFields from './StatsFields.svelte';

	let {
		snapshot,
		scope,
		playerId
	}: { snapshot: BroadcastSnapshot; scope: BroadcastScope; playerId: string | null } = $props();
	const selected = $derived(playerInScope(snapshot, scope, playerId));
	const entries = $derived(selected.player?.entryIds ?? selected.statistics?.entryIds ?? []);
	const agent = $derived(
		scope === 'game'
			? (snapshot.lineups.find((row) => row.player?.playerId === playerId)?.agent ?? null)
			: null
	);
</script>

<article data-player-panel={playerId}>
	<div class="portrait">
		<ResourceCard resource={{ kind: 'player', value: selected.player }} />
	</div>
	<div class="details">
		<div class="identity-row">
			<div class="teams">
				{#each entries as entryId (entryId)}
					{@const team = teamByEntryId(snapshot, entryId)}
					<Identity
						name={team?.name ?? null}
						assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
						unavailable="Team unavailable"
					/>
				{:else}
					<span class="team-unavailable">TEAM TBD</span>
				{/each}
			</div>
			{#if scope === 'game'}
				<span class="agent">{agent?.displayName ?? 'AGENT TBD'}</span>
			{/if}
		</div>

		{#if playerId === null}
			<p class="status">PLAYER TBD</p>
		{:else if !selected.player}
			<p class="status">PLAYER UNAVAILABLE</p>
		{/if}

		<StatsFields statistics={selected.statistics} {scope} />
	</div>
</article>

<style>
	article {
		height: 452px;
		min-width: 0;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: minmax(180px, 31%) minmax(0, 1fr);
		overflow: hidden;
		background: linear-gradient(135deg, var(--gfx-accent-soft), transparent 38%), var(--gfx-panel);
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
	.portrait {
		position: relative;
		min-width: 0;
		overflow: hidden;
		background: linear-gradient(180deg, #2a1870, #10082b);
	}
	.portrait::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(180deg, transparent 58%, #0b0620e0);
	}
	.portrait :global(.identity) {
		height: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: end;
		align-items: stretch;
		gap: 0;
		padding: 18px;
		border: 0;
		text-align: center;
		--asset-width: 100%;
		--asset-height: 325px;
	}
	.portrait :global(.asset) {
		position: absolute;
		inset: 14px 0 auto;
		width: 100%;
	}
	.portrait :global(.asset img) {
		object-position: center bottom;
	}
	.portrait :global(.identity > div) {
		position: relative;
		z-index: 2;
	}
	.portrait :global(.identity strong) {
		font:
			800 27px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.details {
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 24px;
	}
	.identity-row {
		min-height: 66px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		margin-bottom: 14px;
	}
	.teams {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.teams :global(.identity) {
		border: 0;
		padding: 0;
		gap: 8px;
		--asset-width: 38px;
		--asset-height: 38px;
	}
	.teams :global(.identity strong) {
		max-width: 150px;
		font:
			800 14px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.teams :global(.identity small) {
		display: none;
	}
	.team-unavailable,
	.agent {
		color: var(--gfx-muted);
		font:
			700 10px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.agent {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 50%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 7px 9px;
		background: #0b062099;
		border-left: 2px solid var(--gfx-accent);
	}
	.status {
		margin: 0 0 12px;
		color: var(--gfx-muted);
		font:
			800 14px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.1em;
	}
	article :global(.fields) {
		margin-top: auto;
	}
</style>
