<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, gameplaySide, teamScore } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
	const winSlots = $derived(
		snapshot.match
			? Array.from({ length: Math.floor(snapshot.match.bestOf / 2) + 1 }, (_, index) => index)
			: []
	);
</script>

<section aria-label="In-Game" data-side-source={snapshot.sides.source}>
	{#if snapshot.selection}
		<div class="top-wrap">
			{#each ['left', 'right'] as position (position)}
				{@const team = position === 'left' ? teams.left : teams.right}
				{@const entryId =
					position === 'left'
						? snapshot.presentation.leftEntryId
						: snapshot.presentation.rightEntryId}
				{@const side = gameplaySide(snapshot, entryId)}
				{@const wins = teamScore(snapshot, entryId, 'match') ?? 0}

				<div
					class="team-rail"
					data-position={position}
					data-entry-id={entryId ?? ''}
					data-side={side ?? 'neutral'}
				>
					{#if position === 'right'}
						<div class="win-dots" data-win-dots aria-label={`${wins} series wins`}>
							{#each winSlots as index (index)}
								<span class:won={index < wins}></span>
							{/each}
						</div>
					{/if}

					<Identity
						name={team?.name ?? null}
						assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
						unavailable="Team unavailable"
					/>

					{#if position === 'left'}
						<div class="win-dots" data-win-dots aria-label={`${wins} series wins`}>
							{#each winSlots as index (index)}
								<span class:won={index < wins}></span>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			<div class="center-mark" aria-hidden="true"></div>
			<div class="sponsor-slot" data-sponsor-safe-area aria-label="Reserved sponsor logo loop">
				<span>SPONSOR LOOP</span>
			</div>
		</div>

		<div class="match-bug">
			<strong>{snapshot.match?.label ?? 'MATCH'}</strong>
			<span>{snapshot.game?.name ?? `GAME ${snapshot.game?.number ?? '—'}`}</span>
			<p>{snapshot.game?.map?.displayName ?? 'MAP TBD'}</p>
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
		--gfx-bg: #090c11;
		--gfx-panel: #10151df2;
		--gfx-line: #303947;
		--gfx-muted: #97a2b0;
		--gfx-ink: #f7f4eb;
		--gfx-accent: #63e6d7;
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
		border-top: 2px solid #465160;
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
		background: #0a0e14;
		border: 1px solid #788392;
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
		background: linear-gradient(135deg, #10151dd9, #171e28bf);
		border: 1px solid #465160;
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
			linear-gradient(135deg, #63e6d719, transparent 44%),
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
