<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import type { BroadcastSnapshot } from '../types';
	import { gameplaySide, teamByEntryId } from '../selectors';
	import { CEREMONY_VISIBLE_MS, ceremonyLabels } from '../in-game-controls';
	import Asset from '../primitives/Asset.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	let expiredSequence = $state<number | null>(null);
	let departingSequence = $state<number | null>(null);
	const ceremony = $derived(snapshot.liveControls.ceremony);
	const freshCeremony = $derived(
		ceremony &&
			ceremony.sequence !== expiredSequence &&
			Date.now() < ceremony.triggeredAt + CEREMONY_VISIBLE_MS
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
	const bannerKey = $derived(
		freshCeremony ? `ceremony-${freshCeremony.sequence}` : `${pause.type}-${entryId ?? ''}`
	);

	// A reconnect uses the original deadline, never a new six-second window.
	function scheduleExpiry() {
		if (!ceremony) return;
		const event = ceremony;
		const remaining = event.triggeredAt + CEREMONY_VISIBLE_MS - Date.now();
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
		</section>
	{/key}
{/if}

<style>
	.match-banner {
		--accent: #c0c8d3;
		position: absolute;
		z-index: 20;
		left: 50%;
		top: 200px;
		transform: translateX(-50%);
		width: min(788px, calc(100% - 80px));
		height: 178px;
		box-sizing: border-box;
		pointer-events: none;
		color: #f7f4eb;
		background: linear-gradient(125deg, #141b26f7, #090d14f4);
		border-top: 2px solid #465160;
		border-bottom: 5px solid var(--accent);
		clip-path: polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%);
		font-family: Bahnschrift, 'Arial Narrow', sans-serif;
	}
	.match-banner[data-side='attack'] {
		--accent: #248bff;
	}
	.match-banner[data-side='defense'] {
		--accent: #ff4655;
	}
	.match-banner.ceremony {
		animation: reveal 160ms ease-out both;
	}
	.match-banner.ceremony.departing {
		animation: conceal 140ms ease-in forwards;
	}
	.banner-content {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 26px;
		padding: 0 38px;
		--asset-width: 82px;
		--asset-height: 82px;
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
