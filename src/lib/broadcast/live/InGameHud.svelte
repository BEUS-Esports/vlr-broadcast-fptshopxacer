<script lang="ts">
	import type { BroadcastSnapshot } from '../types';
	import type { LiveGameState, LiveSessionStatus } from '#lib/live/types.ts';
	import type { LiveResources } from '#lib/live/selectors.ts';
	import { gameplaySide, mapStrip, teamScore } from '../selectors';
	import Asset from '../primitives/Asset.svelte';
	import SponsorLoop from '../in-game/SponsorLoop.svelte';
	import PlayerCard from './PlayerCard.svelte';
	import ProviderAttribution from './ProviderAttribution.svelte';
	// Spectra-Frontend SVGs (ELv2), see ./assets/spectra/NOTICE.md.
	import killsIcon from './assets/spectra/round-kills.svg';
	import defusedIcon from './assets/spectra/round-defused.svg';
	import detonatedIcon from './assets/spectra/round-detonated.svg';
	import timeoutIcon from './assets/spectra/round-timeout.svg';
	const reasonIcons = {
		elimination: killsIcon,
		defuse: defusedIcon,
		detonation: detonatedIcon,
		time: timeoutIcon
	} as const;
	let {
		snapshot,
		live,
		status,
		resources,
		identity = 'local'
	}: {
		snapshot: BroadcastSnapshot;
		live: LiveGameState | null;
		status: LiveSessionStatus | null;
		resources: LiveResources | null;
		identity?: 'local' | 'provider';
	} = $props();
	const rails = $derived(
		(['left', 'right'] as const).map((position) => {
			const entryId =
				identity === 'local'
					? position === 'left'
						? snapshot.presentation.leftEntryId
						: snapshot.presentation.rightEntryId
					: null;
			const team = live?.teams.find((team) =>
				identity === 'local'
					? team.entryId === entryId
					: position === 'left'
						? team.providerSide === 'left' || team.providerSide === 'team-0'
						: team.providerSide === 'right' || team.providerSide === 'team-1'
			);
			const local =
				identity === 'local' ? snapshot.teams.find((team) => team.entryId === entryId) : null;
			const name = identity === 'local' ? (local?.name ?? '') : (team?.observedName ?? '');
			const side: ReturnType<typeof gameplaySide> =
				identity === 'local'
					? gameplaySide(snapshot, entryId)
					: team?.attacking === true
						? 'attack'
						: team?.attacking === false
							? 'defense'
							: null;
			return {
				position,
				entryId,
				team,
				name,
				label: local?.tag ?? name,
				logo: local?.logoWhitePath ?? local?.logoPath ?? local?.logoBlackPath ?? null,
				wins: identity === 'local' ? teamScore(snapshot, entryId, 'match') : null,
				side
			};
		})
	);
	const strip = $derived(mapStrip(snapshot));
	const winSlots = $derived(
		identity === 'local' && snapshot.match
			? Array.from({ length: Math.floor(snapshot.match.bestOf / 2) + 1 }, (_, index) => index)
			: []
	);
	const showSponsor = $derived(
		status?.provider !== 'spectra' || status.attribution === 'supporter'
	);
	const sideColor = (side: ReturnType<typeof gameplaySide>) =>
		side === 'attack'
			? 'var(--hud-attack, #248bff)'
			: side === 'defense'
				? 'var(--hud-defense, #ff4655)'
				: 'var(--hud-neutral, #97a2b0)';
</script>

<section
	aria-label="External In-Game HUD"
	class="hud"
	data-live-hud
	data-identity={identity}
	data-provider-generation={live?.generation ?? ''}
>
	{#if strip.length}<ol class="map-strip" data-map-strip aria-label="Maps">
			{#each strip as item (item.gameNumber)}<li data-state={item.state}>
					{#if item.state !== 'past'}<small>{item.state === 'current' ? 'CURRENT:' : 'NEXT:'}</small
						>{/if}{item.name}
				</li>{/each}
		</ol>{/if}

	{#each rails as { position, entryId, team, label, logo, wins, side } (position)}
		<div
			class="team-rail"
			data-position={position}
			data-entry-id={entryId ?? ''}
			data-side={side ?? 'neutral'}
			style:--live-side={sideColor(side)}
		>
			{#if logo}<span class="logo"><Asset path={logo} {label} blankMissing /></span>{/if}
			<strong>{label}</strong>
		</div>
		<div class="score" data-position={position} style:--live-side={sideColor(side)}>
			{team?.score ?? ''}
		</div>
		{#if winSlots.length && wins !== null}<div
				class="win-dots"
				data-win-dots
				data-position={position}
				aria-label={`${wins} series wins`}
			>
				{#each winSlots as index (index)}<span class={{ won: index < wins }}></span>{/each}
			</div>{/if}
	{/each}

	<!-- One line inside the timer width: spike state replaces the round label while it matters. -->
	<div class="round-context">
		{#if live && live.spike.state !== 'unknown' && live.spike.state !== 'carried'}<strong
				>{live.spike.state.toUpperCase()}</strong
			>{:else if live?.roundNumber !== null && live?.roundNumber !== undefined}<span
				>ROUND {live.roundNumber}</span
			>{/if}
	</div>

	{#if showSponsor}<div
			class="sponsor-slot"
			data-sponsor-safe-area
			aria-label="Reserved sponsor logo loop"
		>
			{#if snapshot.sponsor.loop.logos.length}<SponsorLoop
					logos={snapshot.sponsor.loop.logos}
					intervalMs={snapshot.sponsor.loop.intervalMs}
				/>{/if}
		</div>{/if}

	{#each rails as { position, entryId, team, side } (position)}
		<div
			class="rail"
			data-position={position}
			data-side={side ?? 'neutral'}
			style:--live-side={sideColor(side)}
		>
			{#each [1, 2, 3, 4, 5] as slot (slot)}
				{@const saved =
					identity === 'local'
						? snapshot.lineups.find((lineup) => lineup.entryId === entryId && lineup.slot === slot)
						: undefined}
				{@const player =
					team?.players.find((player, index) =>
						identity === 'local'
							? player.playerId && player.playerId === saved?.player?.playerId
							: player.providerSlot === slot || (player.providerSlot === null && index === slot - 1)
					) ?? null}
				<PlayerCard {saved} live={player} {resources} />
			{/each}
		</div>
	{/each}
	<!-- Buy phase only; GStack reports no phase ('unknown'), so it keeps history on. -->
	{#if (live?.phase === 'buy' || live?.phase === 'unknown') && live.rounds.length}<div
			class="history"
			role="group"
			aria-label="Round history"
		>
			<div class="history-teams">
				<strong>{rails[0].label}</strong>
				<strong>{rails[1].label}</strong>
			</div>
			{#each live.rounds as round (round.round)}{@const winner = rails.find(
					(rail) => rail.team?.providerSide === round.winnerProviderSide
				)}<span class="history-round">
					<small>{round.round}</small>
					<b
						data-winner-position={winner?.position ?? 'unknown'}
						title={`Round ${round.round}: ${winner?.label ?? 'Unknown winner'} · ${round.reason}`}
						data-reason={round.reason}><img src={reasonIcons[round.reason]} alt="" /></b
					></span
				>{/each}
		</div>{/if}
	{#if status}<ProviderAttribution {status} />{/if}
</section>

<style>
	.hud {
		position: absolute;
		inset: 0;
		width: 1920px;
		height: 1080px;
		overflow: hidden;
		pointer-events: none;
		color: var(--hud-ink, #f7f4eb);
		font:
			14px/1.2 var(--hud-font, 'Segoe UI'),
			sans-serif;
	}
	/* Clean-mode game keeps its timer at x 890-1030, y 0-72; the top bar is built around it. */
	.map-strip {
		position: absolute;
		left: 16px;
		top: 0;
		max-width: 604px;
		height: 22px;
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		gap: 22px;
		overflow: hidden;
		white-space: nowrap;
		font:
			700 13px/22px var(--hud-font, 'Segoe UI'),
			sans-serif;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.map-strip li[data-state='past'] {
		color: var(--hud-muted, #97a2b0);
	}
	.map-strip small {
		margin-right: 6px;
		font-size: inherit;
		color: var(--hud-muted, #97a2b0);
	}
	.team-rail {
		position: absolute;
		top: 0;
		width: 150px;
		height: 64px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		background: var(--hud-panel, #10151df2);
		border-bottom: 3px solid var(--live-side);
		overflow: hidden;
	}
	.team-rail[data-position='left'] {
		left: 640px;
		clip-path: polygon(24px 0, 100% 0, 100% 100%, 0 100%, 0 24px);
	}
	.team-rail[data-position='right'] {
		left: 1130px;
		flex-direction: row-reverse;
		clip-path: polygon(0 0, 100% 0, 100% 24px, 100% 100%, 0 100%);
	}
	.team-rail .logo {
		flex: none;
		--asset-width: 40px;
		--asset-height: 40px;
	}
	.team-rail strong {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		font:
			800 22px/1 var(--hud-font-display, Bahnschrift),
			sans-serif;
		text-transform: uppercase;
	}
	.score {
		position: absolute;
		top: 0;
		width: 92px;
		height: 64px;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		background: var(--hud-panel, #10151df2);
		border-bottom: 3px solid var(--live-side);
		color: var(--live-side);
		font:
			800 44px/1 var(--hud-font-display, Bahnschrift),
			sans-serif;
	}
	.score[data-position='left'] {
		left: 792px;
	}
	.score[data-position='right'] {
		left: 1036px;
	}
	.win-dots {
		position: absolute;
		top: 70px;
		width: 92px;
		display: flex;
		justify-content: center;
		gap: 6px;
	}
	.win-dots[data-position='left'] {
		left: 792px;
	}
	.win-dots[data-position='right'] {
		left: 1036px;
	}
	.win-dots span {
		width: 9px;
		height: 9px;
		rotate: 45deg;
		border: 1px solid var(--hud-ink, #f7f4eb);
	}
	.win-dots span.won {
		background: var(--hud-accent, #63e6d7);
		border-color: var(--hud-accent, #63e6d7);
	}
	.round-context {
		position: absolute;
		left: 50%;
		top: 0;
		height: 22px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 10px;
		background: var(--hud-panel, #10151de0);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.1em;
		white-space: nowrap;
	}
	.round-context:empty {
		display: none;
	}
	.round-context strong {
		color: var(--hud-attack, #ff6874);
	}
	.sponsor-slot {
		position: absolute;
		left: 1690px;
		top: 0;
		width: 210px;
		height: 90px;
		display: grid;
		place-items: center;
		--asset-width: 190px;
		--asset-height: 76px;
	}
	.rail {
		position: absolute;
		top: 548px;
		width: 313px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.rail[data-position='left'] {
		left: 15px;
	}
	.rail[data-position='right'] {
		left: 1592px;
	}
	.rail[data-position='right'] :global(:is(article, article header, article footer)) {
		flex-direction: row-reverse;
	}
	.history {
		position: absolute;
		left: 50%;
		/* y 82-132: under the win dots, above the game's plant/defuse banner (y ~135). */
		top: 82px;
		/* Centred x 480-1440: clear of the minimap and kill feed. */
		max-width: 960px;
		overflow: hidden;
		box-sizing: border-box;
		transform: translateX(-50%);
		display: flex;
		gap: 4px;
		padding: 4px 7px;
		background: var(--hud-panel, #10151de0);
	}
	.history-teams,
	.history-round {
		height: 42px;
		display: grid;
		grid-template-rows: 16px 10px 16px;
		place-items: center;
		font-size: 9px;
	}
	.history-teams {
		flex: none;
		padding-right: 5px;
	}
	.history-teams strong {
		max-width: 56px;
		overflow: hidden;
		white-space: nowrap;
	}
	.history-teams strong:last-child {
		grid-row: 3;
	}
	/* Overtime squeezes rounds instead of widening the strip. */
	.history-round {
		flex: 0 1 18px;
		min-width: 10px;
	}
	.history-round small {
		grid-row: 2;
		font-size: 7px;
		color: var(--hud-muted, #b0bac6);
	}
	.history-round b {
		grid-column: 1;
		grid-row: 2;
		width: 16px;
		display: grid;
		place-items: center;
		text-align: center;
		border-bottom: 2px solid var(--hud-muted, #97a2b0);
	}
	.history-round b img {
		width: 12px;
		height: 12px;
	}
	.history-round b[data-winner-position='left'] {
		grid-row: 1;
	}
	.history-round b[data-winner-position='right'] {
		grid-row: 3;
	}
</style>
