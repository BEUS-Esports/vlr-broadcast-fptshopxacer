<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, gameplaySide, teamScore } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';

	let {
		snapshot,
		teamPresentation = null,
		blankMissing = false,
		showSponsor = true,
		mapName = null
	}: {
		snapshot: BroadcastSnapshot;
		blankMissing?: boolean;
		showSponsor?: boolean;
		mapName?: string | null;
		teamPresentation?: Record<
			'left' | 'right',
			{ name: string; side: 'attack' | 'defense' | null }
		> | null;
	} = $props();
	const teams = $derived(presentationTeams(snapshot));
	const winSlots = $derived(
		snapshot.match
			? Array.from({ length: Math.floor(snapshot.match.bestOf / 2) + 1 }, (_, index) => index)
			: []
	);
</script>

<section
	aria-label="In-Game"
	data-side-source={teamPresentation ? 'provider' : snapshot.sides.source}
>
	{#if snapshot.selection || teamPresentation || blankMissing}
		<div class="top-wrap">
			{#each ['left', 'right'] as const as position (position)}
				{@const team = position === 'left' ? teams.left : teams.right}
				{@const presented = teamPresentation?.[position]}
				{@const entryId = presented
					? null
					: position === 'left'
						? snapshot.presentation.leftEntryId
						: snapshot.presentation.rightEntryId}
				{@const side = presented ? presented.side : gameplaySide(snapshot, entryId)}
				{@const wins = teamScore(snapshot, entryId, 'match')}

				<div
					class="team-rail"
					data-position={position}
					data-entry-id={entryId ?? ''}
					data-side={side ?? 'neutral'}
				>
					{#if position === 'right' && !presented && (!blankMissing || wins !== null)}
						<div class="win-dots" data-win-dots aria-label={`${wins ?? 0} series wins`}>
							{#each winSlots as index (index)}
								<span class={{ won: index < (wins ?? 0) }}></span>
							{/each}
						</div>
					{/if}

					<Identity
						name={presented?.name ?? team?.name ?? null}
						assetPath={presented
							? null
							: (team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null)}
						unavailable={blankMissing ? '' : 'Team unavailable'}
						{blankMissing}
					/>

					{#if position === 'left' && !presented && (!blankMissing || wins !== null)}
						<div class="win-dots" data-win-dots aria-label={`${wins ?? 0} series wins`}>
							{#each winSlots as index (index)}
								<span class={{ won: index < (wins ?? 0) }}></span>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			<div class="center-mark" aria-hidden="true"></div>
			{#if showSponsor}<div
					class="sponsor-slot"
					data-sponsor-safe-area
					aria-label="Reserved sponsor logo loop"
				>
					{#if !blankMissing}<span>SPONSOR LOOP</span>{/if}
				</div>{/if}
		</div>

		<div class="match-bug">
			<strong>{snapshot.match?.label ?? (blankMissing ? '' : 'MATCH')}</strong>
			<span
				>{snapshot.game?.name ??
					(blankMissing && !snapshot.game ? '' : `GAME ${snapshot.game?.number ?? '—'}`)}</span
			>
			<p>{mapName ?? snapshot.game?.map?.displayName ?? (blankMissing ? '' : 'MAP TBD')}</p>
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
		color: #f7f4eb;
		font:
			15px/1.2 'Segoe UI',
			sans-serif;
		--gfx-bg: #0b0620;
		--gfx-panel: #170c3af2;
		--gfx-line: #5b3ae0;
		--gfx-muted: #c9bcff;
		--gfx-ink: #f7f4eb;
		--gfx-accent: #ffc94a;
		--gfx-attack: #248bff;
		--gfx-defense: #ff4655;
	}

	.top-wrap {
		position: absolute;
		inset: 0 0 auto;
		height: 96px;
	}

	.team-rail {
		position: absolute;
		top: 10px;
		width: 505px;
		height: 48px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 0 22px;
		background: linear-gradient(180deg, #141b26f7, #090d14f4);
		border-top: 2px solid #7152f0;
		border-bottom: 3px solid var(--gfx-line);
	}

	.team-rail[data-position='left'] {
		left: 342px;
		justify-content: flex-end;
		clip-path: polygon(24px 0, 100% 0, calc(100% - 18px) 100%, 0 100%, 14px 50%);
	}

	.team-rail[data-position='right'] {
		right: 342px;
		justify-content: flex-start;
		clip-path: polygon(0 0, calc(100% - 24px) 0, calc(100% - 14px) 50%, 100% 100%, 18px 100%);
	}

	.team-rail[data-side='attack'] {
		border-bottom-color: var(--gfx-attack);
	}

	.team-rail[data-side='defense'] {
		border-bottom-color: var(--gfx-defense);
	}

	.team-rail :global(.identity) {
		min-width: 0;
		max-width: 330px;
		flex: 0 1 auto;
		border: 0;
		padding: 0;
		gap: 10px;
		--asset-width: 30px;
		--asset-height: 30px;
	}

	.team-rail[data-position='left'] :global(.identity) {
		flex-direction: row-reverse;
		text-align: right;
	}

	.team-rail :global(.identity strong) {
		display: block;
		max-width: 270px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font:
			800 17px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.045em;
		text-transform: uppercase;
	}

	.team-rail :global(.identity small) {
		display: none;
	}

	.win-dots {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.win-dots span {
		width: 10px;
		height: 10px;
		box-sizing: border-box;
		display: block;
		transform: rotate(45deg);
		background: #10082b;
		border: 1px solid #a596ee;
	}

	.win-dots span.won {
		background: var(--gfx-ink);
		border-color: var(--gfx-ink);
		box-shadow: 0 0 0 2px #f7f4eb18;
	}

	.center-mark {
		position: absolute;
		left: 50%;
		top: 51px;
		width: 74px;
		height: 22px;
		transform: translateX(-50%);
		background: linear-gradient(180deg, #171f2b, #0b1017);
		clip-path: polygon(0 0, 24px 0, 37px 12px, 50px 0, 74px 0, 51px 22px, 23px 22px);
		border-top: 1px solid var(--gfx-line);
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
		background: linear-gradient(135deg, #170c3ad9, #24135cbf);
		border: 1px solid #7152f0;
		clip-path: polygon(
			12px 0,
			100% 0,
			100% calc(100% - 12px),
			calc(100% - 12px) 100%,
			0 100%,
			0 12px
		);
	}

	.sponsor-slot span {
		font:
			800 10px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.16em;
	}

	.match-bug {
		position: absolute;
		left: 30px;
		bottom: 34px;
		width: 360px;
		min-height: 124px;
		box-sizing: border-box;
		padding: 18px 24px 17px;
		overflow: hidden;
		background:
			linear-gradient(135deg, #ffc94a19, transparent 44%),
			linear-gradient(180deg, #141b26f2, #090d14f2);
		border-left: 4px solid var(--gfx-accent);
		border-bottom: 1px solid var(--gfx-line);
		clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%);
	}

	.match-bug strong,
	.match-bug span,
	.match-bug p {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.match-bug strong {
		font:
			800 18px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.045em;
		text-transform: uppercase;
	}

	.match-bug span {
		margin-top: 7px;
		color: var(--gfx-muted);
		font:
			700 11px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.match-bug p {
		margin: 13px 0 0;
		color: var(--gfx-accent);
		font:
			900 29px/0.95 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.055em;
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
			700 12px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
</style>
