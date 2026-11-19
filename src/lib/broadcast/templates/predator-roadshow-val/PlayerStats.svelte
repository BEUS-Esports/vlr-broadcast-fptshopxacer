<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { playerInScope, teamByEntryId } from '../../selectors';
	import Header from './Header.svelte';
	import PlayerFeature from './PlayerFeature.svelte';
	import PlayerCard from './PlayerCard.svelte';
	import StatPanel from './StatPanel.svelte';
	import TeamChip from './TeamChip.svelte';
	import Asset from '../../primitives/Asset.svelte';
	import { fitGroup } from './fit';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const control = $derived(snapshot.controls.playerStats);
	const sides = $derived(
		[control.playerId, control.opponentPlayerId].map((playerId) => {
			const selected = playerInScope(snapshot, control.scope, playerId);
			return {
				playerId,
				selected,
				team: teamByEntryId(
					snapshot,
					selected.player?.entryIds[0] ?? selected.statistics?.entryIds[0] ?? null
				),
				agent:
					control.scope === 'game'
						? (snapshot.lineups.find((row) => row.player?.playerId === playerId)?.agent ?? null)
						: null
			};
		})
	);
</script>

{#snippet agentRow()}
	<div class="agents">
		{#each sides as side, index (index)}
			<span class="agent">
				<Asset
					path={side.agent?.displayIconPath ?? null}
					label={side.agent?.displayName ?? 'Agent'}
					blankMissing
				/>
			</span>
			{#if index === 0}
				<span class="agent-label"><strong>AGENT</strong><small>Đặc vụ</small></span>
			{/if}
		{/each}
	</div>
{/snippet}

{#if control.mode === 'single'}
	<Header title="PLAYER TO WATCH" logos={false} />
	<PlayerFeature
		{snapshot}
		scope={control.scope}
		playerId={control.playerId}
		fields={control.fields}
	/>
{:else}
	<Header title="HEAD TO HEAD" logos={false} />
	<div class="versus" {@attach fitGroup('players')}>
		{#each sides as side, index (index)}
			<div
				class={['card', index ? 'right' : 'left']}
				data-rs-motion={index ? 'from-right' : 'from-left'}
			>
				<PlayerCard
					name={side.selected.player?.displayName ?? side.selected.statistics?.displayName ?? null}
					tag={null}
					portraitPath={side.selected.player?.portraitPath ?? null}
					size="feature"
				/>
				<TeamChip team={side.team} align={index ? 'right' : 'left'} />
			</div>
		{/each}
		<div class="table" data-rs-motion="from-bottom">
			<StatPanel
				statistics={sides[0].selected.statistics}
				compare={sides[1].selected.statistics}
				fields={control.fields}
				scope={control.scope}
				children={control.scope === 'game' ? agentRow : undefined}
			/>
		</div>
	</div>
{/if}

<style>
	.versus {
		position: absolute;
		inset: 0;
	}
	.card {
		position: absolute;
		top: 240px;
		width: 486px;
	}
	.left {
		left: 30px;
	}
	.right {
		right: 30px;
	}
	.table {
		position: absolute;
		left: 534px;
		right: 534px;
		top: 240px;
		height: 816px;
	}
	.agent {
		justify-self: center;
		--asset-width: 64px;
		--asset-height: 64px;
	}
	.agent-label {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.agent-label strong {
		color: var(--rs-label);
		font: 900 44px/1 var(--rs-font);
	}
	.agent-label small {
		color: #d6f7fa;
		font: 400 16px/1.2 var(--rs-font);
	}
</style>
