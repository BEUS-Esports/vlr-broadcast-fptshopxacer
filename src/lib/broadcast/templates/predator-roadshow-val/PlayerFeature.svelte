<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import type { BroadcastScope } from '../../controls';
	import type { StatisticField } from '#lib/statistics/fields.ts';
	import { playerInScope, teamByEntryId } from '../../selectors';
	import Asset from '../../primitives/Asset.svelte';
	import StatPanel from './StatPanel.svelte';
	import PlayerCard from './PlayerCard.svelte';
	import TeamChip from './TeamChip.svelte';
	import { fitGroup } from './fit';

	let {
		snapshot,
		scope,
		playerId,
		fields
	}: {
		snapshot: BroadcastSnapshot;
		scope: BroadcastScope;
		playerId: string | null;
		fields: StatisticField[];
	} = $props();
	const selected = $derived(playerInScope(snapshot, scope, playerId));
	const team = $derived(
		teamByEntryId(
			snapshot,
			selected.player?.entryIds[0] ?? selected.statistics?.entryIds[0] ?? null
		)
	);
	const agent = $derived(
		scope === 'game'
			? (snapshot.lineups.find((row) => row.player?.playerId === playerId)?.agent ?? null)
			: null
	);
	const scopeLabels = {
		game: 'BẢN ĐỒ NÀY',
		match: 'CẢ LOẠT TRẬN',
		tournament: 'TOÀN GIẢI'
	} as const;
</script>

<div class="feature" {@attach fitGroup('players')}>
	<div class="stats" data-rs-motion="from-left">
		<StatPanel statistics={selected.statistics} {fields} {scope} />
		<p class="scope">{scopeLabels[scope]}</p>
	</div>
	<div class="agent" data-rs-motion="from-bottom">
		<strong>AGENT</strong>
		<small>Đặc vụ</small>
		<span class="portrait">
			<Asset
				path={agent?.fullPortraitPath ?? agent?.displayIconPath ?? null}
				label={agent?.displayName ?? 'Agent'}
				blankMissing
			/>
		</span>
		{#if agent}<p class="agent-name">{agent.displayName}</p>{/if}
	</div>
	<div class="card" data-rs-motion="from-right">
		<PlayerCard
			name={selected.player?.displayName ?? selected.statistics?.displayName ?? null}
			tag={null}
			portraitPath={selected.player?.portraitPath ?? null}
			size="feature"
		/>
		<TeamChip {team} />
	</div>
</div>

<style>
	.feature {
		position: absolute;
		inset: 205px 32px 32px;
	}
	.stats {
		position: absolute;
		left: 0;
		top: 0;
		width: 816px;
		height: 843px;
	}
	.scope {
		position: absolute;
		right: 70px;
		top: 18px;
		margin: 0;
		color: var(--rs-plate-to);
		font: 700 15px/1 var(--rs-font);
		letter-spacing: 0.14em;
	}
	.agent {
		position: absolute;
		left: 840px;
		top: 0;
		width: 470px;
		height: 843px;
		box-sizing: border-box;
		padding: 34px 32px 0;
		overflow: hidden;
		background: #000000e6;
		border: 2px solid var(--rs-line);
		clip-path: polygon(
			18px 0,
			calc(100% - 18px) 0,
			100% 18px,
			100% calc(100% - 18px),
			calc(100% - 18px) 100%,
			18px 100%,
			0 calc(100% - 18px),
			0 18px
		);
	}
	.agent strong {
		display: block;
		color: var(--rs-label);
		font: 900 52px/1 var(--rs-font);
	}
	.agent small {
		display: block;
		margin-top: 4px;
		color: #d6f7fa;
		font: 400 19px/1.2 var(--rs-font);
	}
	.portrait {
		position: absolute;
		inset: 140px 0 0;
		--asset-width: 100%;
		--asset-height: 100%;
		background: linear-gradient(180deg, #0b3a40, #02161a);
	}
	.portrait :global(img) {
		object-fit: cover;
		object-position: 50% 0;
	}
	.agent-name {
		position: absolute;
		left: 32px;
		bottom: 24px;
		margin: 0;
		font: 900 40px/1 var(--rs-font);
		text-transform: uppercase;
		text-shadow: 0 2px 12px #000;
	}
	.card {
		position: absolute;
		right: 0;
		top: 0;
		width: 502px;
	}
</style>
