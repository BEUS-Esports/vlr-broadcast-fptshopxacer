<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, gameplaySide, teamScore } from '../../selectors';
	import Asset from '../../primitives/Asset.svelte';
	import SponsorLoop from '../../in-game/SponsorLoop.svelte';

	let { snapshot, showSponsor = true }: { snapshot: BroadcastSnapshot; showSponsor?: boolean } =
		$props();
	const teams = $derived(presentationTeams(snapshot));
	const winSlots = $derived(
		snapshot.match
			? Array.from({ length: Math.floor(snapshot.match.bestOf / 2) + 1 }, (_, index) => index)
			: []
	);
	const mapCount = $derived(
		snapshot.game
			? `MAP ${snapshot.game.number}${snapshot.match ? `/${snapshot.match.bestOf}` : ''}`
			: 'MAP —'
	);
</script>

<!-- Fallback HUD: the game keeps its full spectator top bar (agents + timer, x 400-1520, y 28-90);
     this frames it without covering it. -->
<section aria-label="In-Game" data-side-source={snapshot.sides.source}>
	{#if snapshot.selection}
		<div class="top-wrap">
			{#each ['left', 'right'] as const as position (position)}
				{@const team = position === 'left' ? teams.left : teams.right}
				{@const entryId =
					position === 'left'
						? snapshot.presentation.leftEntryId
						: snapshot.presentation.rightEntryId}
				{@const side = gameplaySide(snapshot, entryId)}
				{@const wins = teamScore(snapshot, entryId, 'match')}
				{@const logo = team?.logoWhitePath ?? team?.logoPath ?? team?.logoBlackPath ?? null}

				<div
					class="team-rail"
					data-position={position}
					data-entry-id={entryId ?? ''}
					data-side={side ?? 'neutral'}
				>
					<strong>{team?.name ?? 'Team unavailable'}</strong>
					{#if winSlots.length}<div
							class="win-dots"
							data-win-dots
							aria-label={`${wins ?? 0} series wins`}
						>
							{#each winSlots as index (index)}<span class={{ won: index < (wins ?? 0) }}
								></span>{/each}
						</div>{/if}
				</div>
				<div class="team-logo" data-position={position} data-side={side ?? 'neutral'}>
					{#if logo}<Asset path={logo} label={team?.name ?? ''} blankMissing />{/if}
				</div>
			{/each}

			{#if snapshot.match}<div class="best-of">BEST OF {snapshot.match.bestOf}</div>{/if}
			{#if showSponsor}<div
					class="sponsor-slot"
					data-sponsor-safe-area
					aria-label="Reserved sponsor logo loop"
				>
					{#if snapshot.sponsor.loop.logos.length}
						<SponsorLoop
							logos={snapshot.sponsor.loop.logos}
							intervalMs={snapshot.sponsor.loop.intervalMs}
						/>
					{:else}<span>SPONSOR LOOP</span>{/if}
				</div>{/if}
		</div>

		<div class="match-bug">
			<strong>{snapshot.match?.label ?? 'MATCH'} - {mapCount}</strong>
			<div class="match-body">
				<span class="event-logo" aria-hidden="true"></span>
				<p>{snapshot.game?.map?.displayName ?? 'MAP TBD'}</p>
			</div>
		</div>
	{:else}
		<p class="empty">No game selected</p>
	{/if}
</section>

<style>
	section {
		position: absolute;
		inset: 0;
		width: 1920px;
		height: 1080px;
		box-sizing: border-box;
		overflow: hidden;
		pointer-events: none;
		color: var(--hud-ink, #f7f4eb);
		font:
			15px/1.2 var(--hud-font, 'Segoe UI'),
			sans-serif;
		--gfx-panel: var(--hud-panel, #10151df2);
		--gfx-line: var(--hud-line, #303947);
		--gfx-muted: var(--hud-muted, #97a2b0);
		--gfx-ink: var(--hud-ink, #f7f4eb);
		--gfx-accent: var(--hud-accent, #63e6d7);
		--gfx-attack: var(--hud-attack, #248bff);
		--gfx-defense: var(--hud-defense, #ff4655);
	}

	/* Band above the game's strip (y 0-28) plus logo plates at both ends (x 320-400, 1520-1604). */
	.top-wrap::before {
		content: '';
		position: absolute;
		left: 320px;
		top: 0;
		width: 1284px;
		height: 28px;
		background: var(--gfx-panel);
		border-bottom: 1px solid var(--gfx-line);
	}

	.team-logo {
		position: absolute;
		top: 0;
		width: 80px;
		height: 72px;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		background: var(--gfx-panel);
		border-bottom: 3px solid var(--gfx-line);
		--asset-width: 56px;
		--asset-height: 56px;
	}

	.team-logo[data-position='left'] {
		left: 320px;
		clip-path: polygon(0 0, 100% 0, 100% 100%, 18px 100%, 0 calc(100% - 18px));
	}

	.team-logo[data-position='right'] {
		left: 1524px;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%);
	}

	.team-rail {
		position: absolute;
		top: 0;
		width: 470px;
		height: 28px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 0 14px;
		overflow: hidden;
		border-bottom: 3px solid var(--gfx-line);
	}

	.team-rail[data-position='left'] {
		left: 402px;
	}

	.team-rail[data-position='right'] {
		left: 1048px;
	}

	.team-rail[data-side='attack'],
	.team-logo[data-side='attack'] {
		border-bottom-color: var(--gfx-attack);
	}

	.team-rail[data-side='defense'],
	.team-logo[data-side='defense'] {
		border-bottom-color: var(--gfx-defense);
	}

	.team-rail strong {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		font:
			800 20px/1 var(--hud-font-display, Bahnschrift),
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.win-dots {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.win-dots span {
		width: 9px;
		height: 9px;
		box-sizing: border-box;
		display: block;
		transform: rotate(45deg);
		border: 1px solid var(--gfx-muted);
	}

	.win-dots span.won {
		background: var(--gfx-accent);
		border-color: var(--gfx-accent);
	}

	.best-of {
		position: absolute;
		left: 876px;
		top: 0;
		width: 168px;
		height: 28px;
		display: grid;
		place-items: center;
		color: var(--gfx-accent);
		font:
			800 16px/1 var(--hud-font-display, Bahnschrift),
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
	}

	.sponsor-slot {
		position: absolute;
		top: 10px;
		right: 30px;
		width: 218px;
		height: 66px;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		overflow: hidden;
		color: var(--gfx-muted);
		background: var(--gfx-panel);
		border: 1px solid var(--gfx-line);
	}

	.sponsor-slot span {
		font:
			800 10px/1 var(--hud-font-display, Bahnschrift),
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.16em;
	}

	/* Bottom-left map box, below the game's spectated-player portrait (y 795-875). */
	.match-bug {
		position: absolute;
		left: 28px;
		top: 880px;
		width: 492px;
		height: 192px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.match-bug strong {
		align-self: flex-end;
		max-width: 100%;
		box-sizing: border-box;
		padding: 8px 18px;
		overflow: hidden;
		white-space: nowrap;
		background: var(--gfx-panel);
		font:
			800 20px/1 var(--hud-font-display, Bahnschrift),
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.match-body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 140px minmax(0, 1fr);
		align-items: center;
		background: var(--gfx-panel);
		border-bottom: 3px solid var(--gfx-accent);
	}

	.event-logo {
		height: 100px;
		margin: 0 14px;
		border-right: 2px solid var(--gfx-line);
		background: var(--hud-event-logo, none) center / contain no-repeat;
	}

	.match-body p {
		margin: 0;
		padding: 0 18px;
		overflow: hidden;
		white-space: nowrap;
		text-align: center;
		color: var(--gfx-ink);
		font:
			900 44px/1 var(--hud-font-display, Bahnschrift),
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.empty {
		position: absolute;
		left: 50%;
		top: 48px;
		margin: 0;
		transform: translateX(-50%);
		color: var(--gfx-muted);
		font:
			700 12px/1 var(--hud-font-display, Bahnschrift),
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
</style>
