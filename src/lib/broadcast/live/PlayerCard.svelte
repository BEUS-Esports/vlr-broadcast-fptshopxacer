<script lang="ts">
	import type { BroadcastSnapshot } from '../types';
	import type { LivePlayerState } from '#lib/live/types.ts';
	import { resourceByName, type LiveResources } from '#lib/live/selectors.ts';
	import Asset from '../primitives/Asset.svelte';
	// Spectra-Frontend SVGs (ELv2), see ./assets/spectra/NOTICE.md.
	import spikeIcon from './assets/spectra/spike.svg';
	import creditsIcon from './assets/spectra/credits.svg';
	import pipIcon from './assets/spectra/ult-pip.svg';
	import pipFullIcon from './assets/spectra/ult-pip-full.svg';
	import heavyIcon from './assets/spectra/shield-heavy.svg';
	import lightIcon from './assets/spectra/shield-light.svg';
	import regenIcon from './assets/spectra/shield-regen.svg';
	const shieldIcons: Record<string, string> = {
		heavy: heavyIcon,
		light: lightIcon,
		regen: regenIcon,
		standard: heavyIcon
	};
	let {
		saved,
		live,
		resources,
		mirrored = false
	}: {
		saved: BroadcastSnapshot['lineups'][number] | undefined;
		live: LivePlayerState | null;
		resources: LiveResources | null;
		/** Right-rail card: every row reads from the outer (right) edge inward. */
		mirrored?: boolean;
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
	const ultimate = $derived(live?.ultimate ?? null);
	const ultimateLabel = $derived(
		ultimate?.ready === true
			? 'Ultimate ready'
			: ultimate?.current !== null && ultimate?.current !== undefined && ultimate.required !== null
				? `Ultimate ${ultimate.current}/${ultimate.required}`
				: 'Ultimate'
	);
	/** One pip per ult point; all full when ready. */
	const ultimatePips = $derived(
		ultimate?.required
			? Array.from(
					{ length: ultimate.required },
					(_, index) =>
						index < (ultimate.ready === true ? ultimate.required! : (ultimate.current ?? 0))
				)
			: []
	);
</script>

<article
	class:dead={live?.alive === false}
	class:observed={live?.observed === true}
	class:mirrored
	data-player-id={saved?.player?.playerId ?? ''}
	data-health-available={live?.health !== null && live?.health !== undefined}
>
	<div class="agent">
		<Asset
			path={agent?.displayIconPath ?? null}
			label={agent?.displayName ?? live?.agent ?? ''}
			blankMissing
		/>
		{#if ultimatePips.length || ultimateArtwork?.displayIconPath}<span
				class:ready={live?.ultimate.ready === true}
				class="ultimate"
				aria-label={ultimateLabel}
				>{#if ultimateArtwork?.displayIconPath}<Asset
						path={ultimateArtwork.displayIconPath}
						label={ultimateArtwork.displayName}
						blankMissing
					/>{/if}{#if ultimatePips.length}<span class="pips"
						>{#each ultimatePips as full, index (index)}<img
								data-ult-pip
								class:full
								src={full ? pipFullIcon : pipIcon}
								alt=""
							/>{/each}</span
					>{/if}</span
			>{/if}
	</div>
	<div class="details">
		<header>
			<strong>{saved?.player?.displayName ?? live?.observedName ?? ''}</strong
			>{#if live?.hasSpike === true}<b class="spike" aria-label="Spike carrier"
					><img src={spikeIcon} alt="" /></b
				>{/if}
			<span class="vitals">
				{#if live?.alive !== false && live?.health !== null && live?.health !== undefined}<strong
						class="hp"
						data-health>{live.health}<small>&nbsp;HP</small></strong
					>{/if}
				{#if live?.alive !== false && live?.extraHealth !== null && live?.extraHealth !== undefined}<span
						class="enhanced">+{live.extraHealth}</span
					>{/if}
				{#if live?.alive !== false && live?.shield.kind && live.shield.kind !== 'unknown' && live.shield.kind !== 'none'}<span
						class="shield"
						data-shield-kind={live.shield.kind}
						aria-label={`${live.shield.kind} shield`}
						><img src={shieldIcons[live.shield.kind]} alt="" />{live.shield.current !== null
							? live.shield.current
							: ''}</span
					>{/if}
				{#if live?.alive !== false && live?.shield.extra !== null && live?.shield.extra !== undefined}<span
						class="enhanced">+{live.shield.extra} SH</span
					>{/if}
			</span>
		</header>
		{#if live?.alive !== false && live?.health !== null && live?.health !== undefined}<div
				class="health-track"
				aria-label={`${live.health} health`}
			>
				<span style:width={`${Math.min(100, live.health)}%`}></span>
			</div>{/if}
		<footer>
			<div class="abilities" aria-label="Ability charges">
				{#each abilities as ability, i (ability.slot)}{#if ability.artwork?.displayIconPath || ability.current !== null}<span
							class="ability"
							aria-label={`${ability.artwork?.displayName ?? `Ability ${i + 1}`}: ${ability.current === null ? 'charges unavailable' : ability.capacity === null ? `${ability.current} charges, capacity unavailable` : `${ability.current} of ${ability.capacity} charges`}`}
							>{#if ability.artwork?.displayIconPath}<Asset
									path={ability.artwork.displayIconPath}
									label={ability.artwork.displayName}
									blankMissing
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
						>{/if}{/each}
			</div>
			<span class="loadout">
				{#if weapon?.displayIconPath}<Asset
						path={weapon.displayIconPath}
						label={weapon.displayName}
						blankMissing
					/>{:else}<span>{live?.weapon ?? ''}</span>{/if}
				{#if live?.credits !== null && live?.credits !== undefined}<span class="credits"
						><img src={creditsIcon} alt="" />{live.credits.toLocaleString('en-US')}</span
					>{/if}
			</span>
			{#if live?.alive === false && [live.kills, live.deaths, live.assists].some((value) => value !== null)}<span
					class="kda">{live.kills ?? ''}/{live.deaths ?? ''}/{live.assists ?? ''}</span
				>{/if}
		</footer>
	</div>
</article>

<style>
	article {
		display: flex;
		width: 100%;
		min-width: 0;
		height: 100px;
		padding: 8px 10px;
		box-sizing: border-box;
		gap: 9px;
		background: var(--hud-panel, #10151ded);
		border: 1px solid var(--hud-line, #596370);
		border-left: 3px solid var(--live-side, var(--hud-muted, #97a2b0));
		clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px);
	}
	/* Exact mirror of the left-rail card: reverse every row and move edge decoration. */
	article.mirrored {
		flex-direction: row-reverse;
		border-left: 1px solid var(--hud-line, #596370);
		border-right: 3px solid var(--live-side, var(--hud-muted, #97a2b0));
		clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
	}
	.mirrored
		:is(header, footer, .vitals, .loadout, .abilities, .ability, .charges, .ultimate, .pips) {
		flex-direction: row-reverse;
	}
	.mirrored header strong {
		text-align: right;
	}
	.mirrored .loadout {
		margin-left: 0;
		margin-right: auto;
	}
	.mirrored .kda {
		margin-left: 0;
		margin-right: 10px;
	}
	.mirrored .health-track span {
		margin-left: auto;
	}
	/* Dead: name, credits and K/D/A only; height stays so rails never jump. */
	article.dead {
		opacity: 0.55;
	}
	.dead .abilities,
	.dead .ultimate,
	.dead .loadout :global(.asset) {
		display: none;
	}
	article.observed {
		border-color: #e9d06d;
		background: #292719ed;
	}
	.agent {
		width: 56px;
		flex: 0 0 56px;
		align-self: flex-start;
		text-align: center;
		font-size: 10px;
	}
	.agent :global(.asset) {
		width: 56px;
		height: 56px;
	}
	.dead .agent {
		filter: grayscale(1);
	}
	.details {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
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
		white-space: nowrap;
		font:
			800 18px/1.2 var(--hud-font-display, Bahnschrift),
			'Arial Narrow',
			sans-serif;
	}
	.spike img {
		display: block;
		width: 20px;
		height: 18px;
	}
	.shield,
	.credits {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}
	.shield img {
		width: 16px;
		height: 16px;
	}
	.credits img {
		width: 10px;
		height: 9px;
	}
	.loadout {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		margin-left: auto;
		color: #c4cbd5;
		font-size: 12px;
		white-space: nowrap;
	}
	.loadout :global(.asset) {
		width: 52px;
		height: 18px;
	}
	.credits {
		font-variant-numeric: tabular-nums;
	}
	.vitals {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
	}
	.hp {
		font-size: 20px;
	}
	.hp small {
		font-size: 9px;
		color: var(--hud-muted, #97a2b0);
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
		margin-left: 10px;
		font-size: 16px;
		color: var(--hud-ink, #f7f4eb);
		font-variant-numeric: tabular-nums;
	}
	.health-track {
		height: 4px;
		background: var(--hud-line, #303947);
	}
	.health-track span {
		display: block;
		height: 100%;
		background: var(--live-side, var(--hud-muted, #97a2b0));
	}
	footer {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.abilities {
		display: flex;
		gap: 5px;
	}
	.ability {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 9px;
		color: var(--hud-muted, #b0bac6);
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
		background: var(--hud-ink, #f7f4eb);
		border-color: var(--hud-ink, #f7f4eb);
	}
	.ability :global(.asset) {
		width: 18px;
		height: 18px;
	}
	.ultimate :global(.asset) {
		flex: none;
		width: 18px;
		height: 18px;
	}
	.pips {
		display: flex;
		flex-wrap: wrap;
		gap: 1px;
		max-width: 34px;
	}
	.pips img {
		width: 7px;
		height: 8px;
	}
	/* League layout: ult sits under the portrait on the card's outer edge. */
	.ultimate {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2px;
		margin-top: 2px;
		white-space: nowrap;
		font:
			700 9px/1 var(--hud-font, 'Segoe UI'),
			sans-serif;
		color: var(--hud-muted, #b0bac6);
	}
	.ultimate.ready {
		color: var(--hud-panel, #10151d);
		padding: 3px 5px;
		background: #e9d06d;
	}
</style>
