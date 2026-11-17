<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import type { BroadcastSnapshot } from '../types';
	import type { BroadcastClock } from '../client';
	import { gameplaySide, teamByEntryId } from '../selectors';
	import { CEREMONY_VISIBLE_MS, ceremonyLabels } from '../in-game-controls';
	import Asset from '../primitives/Asset.svelte';
	import type { SponsorBannerKind } from '../sponsor';

	let { snapshot, clock = null }: { snapshot: BroadcastSnapshot; clock?: BroadcastClock | null } =
		$props();
	let expiredSequence = $state<number | null>(null);
	let departingSequence = $state<number | null>(null);
	const ceremony = $derived(snapshot.liveControls.ceremony);
	const freshCeremony = $derived(
		ceremony &&
			ceremony.sequence !== expiredSequence &&
			clock &&
			clock.now() < ceremony.triggeredAt + CEREMONY_VISIBLE_MS
			? ceremony
			: null
	);
	const pause = $derived(snapshot.liveControls.pause);
	const banner = $derived(freshCeremony ?? (pause.type === 'none' ? null : pause));
	const entryId = $derived(banner && 'entryId' in banner ? banner.entryId : null);
	const team = $derived(teamByEntryId(snapshot, entryId));
	const side = $derived(gameplaySide(snapshot, entryId));
	const label = $derived(
		freshCeremony
			? ceremonyLabels[freshCeremony.type]
			: pause.type === 'tactical'
				? 'TACTICAL TIMEOUT'
				: 'TECHNICAL PAUSE'
	);
	const kind = $derived<SponsorBannerKind>(
		freshCeremony ? freshCeremony.type : pause.type === 'tactical' ? 'tactical' : 'technical'
	);
	const art = $derived(snapshot.sponsor.banners[kind]);
	const bannerKey = $derived(
		freshCeremony ? `ceremony-${freshCeremony.sequence}` : `${pause.type}-${entryId ?? ''}`
	);

	// A reconnect uses the original deadline, never a new six-second window.
	function scheduleExpiry() {
		if (!ceremony || !clock) return;
		const event = ceremony;
		const remaining = event.triggeredAt + CEREMONY_VISIBLE_MS - clock.now();
		if (remaining <= 0) return;
		const timer = setTimeout(() => {
			expiredSequence = event.sequence;
		}, remaining);
		const exitTimer = setTimeout(
			() => {
				departingSequence = event.sequence;
			},
			Math.max(0, remaining - 140)
		);
		return () => {
			clearTimeout(timer);
			clearTimeout(exitTimer);
		};
	}
	$effect(scheduleExpiry);
</script>

{#if banner && (entryId === null || (snapshot.selection && team))}
	{#key bannerKey}
		<section
			class="match-banner"
			class:ceremony={!!freshCeremony}
			class:departing={freshCeremony?.sequence === departingSequence}
			data-match-banner={banner.type}
			data-entry-id={entryId ?? ''}
			data-side={side ?? 'neutral'}
			data-reduced-motion={prefersReducedMotion.current}
			aria-label="Match banner"
		>
			{#if art.backgroundPath}
				<div
					class="sponsor-background"
					data-banner-sponsor-background
					style:background-image={`url("${art.backgroundPath}")`}
				></div>
			{/if}
			<div class="banner-content">
				{#if team}
					{#if team.logoWhitePath || team.logoPath || team.logoBlackPath}
						<Asset
							path={team.logoWhitePath ?? team.logoPath ?? team.logoBlackPath}
							label={team.name}
							blankMissing
						/>
					{/if}
				{/if}
				<div class="copy">
					<h2>{label}</h2>
					{#if team}
						<div class="team">
							<strong>{team.tag || team.name}</strong><span>{team.name}</span>{#if side}<small
									>{side === 'attack' ? 'ATK' : 'DEF'}</small
								>{/if}
						</div>
					{/if}
				</div>
			</div>
			{#if art.logoPath}
				<div class="sponsor-logo" data-banner-sponsor-logo>
					<Asset path={art.logoPath} label="Sponsor" blankMissing />
				</div>
			{/if}
		</section>
	{/key}
{/if}

<style>
	.match-banner {
		--accent: #c0c8d3;
		--sponsor-logo-width: 110px;
		--sponsor-logo-height: 56px;
		/* Logo straddles the top edge: these bound the notch the clip-path opens for it. */
		--sponsor-notch-left: calc(50% - var(--sponsor-logo-width) / 2);
		--sponsor-notch-right: calc(50% + var(--sponsor-logo-width) / 2);
		--sponsor-notch-top: calc(var(--sponsor-logo-height) / -2);
		position: absolute;
		z-index: 20;
		left: 50%;
		top: 200px;
		transform: translateX(-50%);
		width: min(788px, calc(100% - 80px));
		height: 178px;
		box-sizing: border-box;
		pointer-events: none;
		color: var(--hud-ink, #f7f4eb);
		background: linear-gradient(125deg, #141b26f7, #090d14f4);
		border-top: 2px solid var(--hud-line, #465160);
		border-bottom: 5px solid var(--accent);
		clip-path: polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%);
		font-family: var(--hud-font-display, Bahnschrift), 'Arial Narrow', sans-serif;
	}
	.match-banner[data-side='attack'] {
		--accent: var(--hud-attack, #248bff);
	}
	.match-banner[data-side='defense'] {
		--accent: var(--hud-defense, #ff4655);
	}
	.match-banner.ceremony {
		animation: reveal 160ms ease-out both;
	}
	.match-banner.ceremony.departing {
		animation: conceal 140ms ease-in forwards;
	}
	.sponsor-background {
		position: absolute;
		inset: 0;
		z-index: 0;
		background: center / cover no-repeat;
	}
	.banner-content {
		position: relative;
		z-index: 1;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 26px;
		padding: 0 38px;
		--asset-width: 82px;
		--asset-height: 82px;
	}
	/* With a logo, open a notch above the top edge so its upper half is not clipped. */
	.match-banner:has(.sponsor-logo) {
		clip-path: polygon(
			20px 0,
			var(--sponsor-notch-left) 0,
			var(--sponsor-notch-left) var(--sponsor-notch-top),
			var(--sponsor-notch-right) var(--sponsor-notch-top),
			var(--sponsor-notch-right) 0,
			100% 0,
			calc(100% - 20px) 100%,
			0 100%
		);
	}
	/* Text keeps clear of the logo's lower half. */
	.match-banner:has(.sponsor-logo) .banner-content {
		padding-top: calc(var(--sponsor-logo-height) / 2 + 6px);
	}
	.sponsor-logo {
		position: absolute;
		z-index: 0;
		left: 50%;
		top: 0;
		transform: translate(-50%, -50%);
		--asset-width: var(--sponsor-logo-width);
		--asset-height: var(--sponsor-logo-height);
	}
	.copy {
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 46px;
		line-height: 1.1;
		font-weight: 900;
		letter-spacing: 0.07em;
	}
	.team {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 14px;
		min-width: 0;
	}
	strong {
		color: var(--accent);
		font-size: 26px;
		max-width: 180px;
	}
	.team span {
		font-size: 19px;
		max-width: 360px;
	}
	strong,
	.team span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		border: 1px solid var(--accent);
		color: var(--accent);
		padding: 3px 8px;
		font-size: 16px;
		letter-spacing: 0.08em;
	}
	@keyframes reveal {
		from {
			opacity: 0;
			transform: translate(-50%, -8px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
	@keyframes conceal {
		to {
			opacity: 0;
			transform: translate(-50%, -5px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.match-banner,
		.match-banner.ceremony,
		.match-banner.ceremony.departing {
			animation: none;
		}
	}
</style>
