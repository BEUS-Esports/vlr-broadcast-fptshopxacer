<script lang="ts">
	import type { BroadcastSnapshot } from '../types';
	import type { LivePlayerState } from '#lib/live/types.ts';
	import { resourceByName, type LiveResources } from '#lib/live/selectors.ts';
	import Asset from '../primitives/Asset.svelte';
	let {
		saved,
		live,
		resources
	}: {
		saved: BroadcastSnapshot['lineups'][number] | undefined;
		live: LivePlayerState | null;
		resources: LiveResources | null;
	} = $props();
	const catalogAgent = $derived(
		resourceByName(resources?.agents ?? [], live?.agent ?? saved?.agent?.displayName ?? null)
	);
	const agent = $derived(catalogAgent ?? saved?.agent ?? null);
	const weapon = $derived(resourceByName(resources?.weapons ?? [], live?.weapon ?? null));
	const abilities = $derived(
		(['grenade', 'ability1', 'ability2'] as const).map((slot) => ({
			slot,
			current: live?.abilities[slot].current ?? null,
			capacity: live?.abilities[slot].capacity ?? null,
			artwork: catalogAgent?.abilities?.find((ability) => ability.slot === slot) ?? null
		}))
	);
	const ultimateArtwork = $derived(
		catalogAgent?.abilities?.find((ability) => ability.slot === 'ultimate') ?? null
	);
</script>

<article
	class:dead={live?.alive === false}
	class:observed={live?.observed === true}
	data-player-id={saved?.player?.playerId ?? ''}
	data-health-available={live?.health !== null && live?.health !== undefined}
>
	<div class="agent">
		<Asset
			path={agent?.displayIconPath ?? null}
			label={agent?.displayName ?? 'Agent unavailable'}
		/><span>{agent?.displayName ?? live?.agent ?? '—'}</span>
	</div>
	<div class="details">
		<header>
			<strong>{saved?.player?.displayName ?? live?.observedName ?? 'Player unavailable'}</strong
			>{#if live?.hasSpike === true}<b class="spike" aria-label="Spike carrier">◆</b
				>{/if}{#if live?.alive === false}<b class="death">DEAD</b>{/if}
		</header>
		<div class="loadout">
			{#if weapon?.displayIconPath}<Asset
					path={weapon.displayIconPath}
					label={weapon.displayName}
				/>{:else}<span>{live?.weapon ?? '—'}</span>{/if}<span class="credits"
				>¤ {live?.credits?.toLocaleString('en-US') ?? '—'}</span
			>
		</div>
		<div class="vitals">
			{#if live?.health !== null && live?.health !== undefined}<strong class="hp" data-health
					>{live.health}<small>&nbsp;HP</small></strong
				>{/if}
			{#if live?.extraHealth !== null && live?.extraHealth !== undefined}<span class="enhanced"
					>+{live.extraHealth}</span
				>{/if}
			{#if live?.shield.kind && live.shield.kind !== 'unknown'}<span
					class="shield"
					data-shield-kind={live.shield.kind}
					>{live.shield.kind === 'regen' ? 'REGEN' : live.shield.kind.toUpperCase()}{live.shield
						.current !== null
						? ` ${live.shield.current}`
						: ''}</span
				>{/if}
			{#if live?.shield.extra !== null && live?.shield.extra !== undefined}<span class="enhanced"
					>+{live.shield.extra} SH</span
				>{/if}
			<span class="kda">{live?.kills ?? '—'}/{live?.deaths ?? '—'}/{live?.assists ?? '—'}</span>
		</div>
		{#if live?.health !== null && live?.health !== undefined}<div
				class="health-track"
				aria-label={`${live.health} health`}
			>
				<span style:width={`${Math.min(100, live.health)}%`}></span>
			</div>{/if}
		<footer>
			<div class="abilities" aria-label="Ability charges">
				{#each abilities as ability, i (ability.slot)}<span
						class="ability"
						aria-label={`${ability.artwork?.displayName ?? `Ability ${i + 1}`}: ${ability.current === null ? 'charges unavailable' : ability.capacity === null ? `${ability.current} charges, capacity unavailable` : `${ability.current} of ${ability.capacity} charges`}`}
						>{#if ability.artwork}<Asset
								path={ability.artwork.displayIconPath}
								label={ability.artwork.displayName}
							/>{:else}<small>{['I', 'II', 'III'][i]}</small>{/if}
						{#if ability.current !== null}
							<span class="charges" data-ability-charges={ability.current}>
								{#if ability.capacity !== null && ability.capacity <= 10}
									{#each Array.from({ length: ability.capacity }, (_, index) => index) as dot (dot)}
										<i data-ability-dot class:available={dot < ability.current}></i>
									{/each}
								{:else}<b
										>{ability.current}{ability.capacity === null ? '' : `/${ability.capacity}`}</b
									>{/if}
							</span>
						{/if}</span
					>{/each}
			</div>
			<span class:ready={live?.ultimate.ready === true} class="ultimate" aria-label="Ultimate"
				>{#if ultimateArtwork}<Asset
						path={ultimateArtwork.displayIconPath}
						label={ultimateArtwork.displayName}
					/>{/if}{live?.ultimate.ready === true
					? 'ULT READY'
					: live?.ultimate.current !== null &&
						  live?.ultimate.current !== undefined &&
						  live.ultimate.required !== null
						? `ULT ${live.ultimate.current}/${live.ultimate.required}`
						: 'ULT —'}</span
			>
		</footer>
	</div>
</article>

<style>
	article {
		display: flex;
		width: 312px;
		min-height: 90px;
		padding: 8px;
		box-sizing: border-box;
		gap: 9px;
		background: #10151ded;
		border: 1px solid #596370;
		border-left: 3px solid var(--live-side, #97a2b0);
		clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px);
	}
	article.dead {
		opacity: 0.62;
	}
	article.observed {
		border-color: #e9d06d;
		background: #292719ed;
	}
	.agent {
		width: 47px;
		flex: 0 0 47px;
		align-self: center;
		text-align: center;
		font-size: 10px;
	}
	.agent :global(.asset) {
		width: 44px;
		height: 44px;
	}
	.dead .agent {
		filter: grayscale(1);
	}
	.agent span {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.details {
		flex: 1;
		min-width: 0;
	}
	header {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	header strong {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font:
			800 16px/1.2 Bahnschrift,
			'Arial Narrow',
			sans-serif;
	}
	.death {
		font-size: 10px;
		color: #ff8790;
	}
	.spike {
		color: #63e6d7;
	}
	.loadout {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 22px;
		color: #c4cbd5;
		font-size: 11px;
	}
	.loadout :global(.asset) {
		width: 95px;
		height: 20px;
	}
	.credits {
		font-variant-numeric: tabular-nums;
	}
	.vitals {
		display: flex;
		align-items: center;
		gap: 5px;
		min-height: 16px;
		font-size: 10px;
	}
	.hp {
		font-size: 14px;
	}
	.hp small {
		font-size: 9px;
		color: #97a2b0;
	}
	.enhanced {
		color: #d6acee;
	}
	.shield {
		color: #b9c9e0;
		font-size: 8px;
	}
	.shield[data-shield-kind='regen'] {
		color: #73ded4;
	}
	.kda {
		margin-left: auto;
		color: #c4cbd5;
		font-variant-numeric: tabular-nums;
	}
	.health-track {
		height: 3px;
		margin-top: 3px;
		background: #303947;
	}
	.health-track span {
		display: block;
		height: 100%;
		background: var(--live-side, #97a2b0);
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 5px;
	}
	.abilities {
		display: flex;
		gap: 9px;
	}
	.ability {
		display: flex;
		align-items: center;
		gap: 3px;
		min-width: 27px;
		font-size: 9px;
		color: #b0bac6;
	}
	.ability small {
		font-size: 8px;
	}
	.charges {
		display: flex;
		gap: 3px;
	}
	.ability i {
		width: 4px;
		height: 4px;
		border: 1px solid #586270;
		border-radius: 50%;
	}
	.ability i.available {
		background: #f7f4eb;
		border-color: #f7f4eb;
	}
	.ability :global(.asset),
	.ultimate :global(.asset) {
		width: 15px;
		height: 15px;
	}
	.ultimate {
		display: flex;
		align-items: center;
		gap: 3px;
		font:
			700 9px/1 'Segoe UI',
			sans-serif;
		color: #b0bac6;
	}
	.ultimate.ready {
		color: #10151d;
		padding: 3px 5px;
		background: #e9d06d;
	}
</style>
