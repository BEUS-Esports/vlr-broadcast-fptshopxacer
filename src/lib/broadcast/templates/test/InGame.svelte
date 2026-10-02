<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import { presentationTeams, gameplaySide } from '../../selectors';
	import Identity from '../../primitives/Identity.svelte';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
</script>

<section aria-label="In-Game" data-side-source={snapshot.sides.source}>
	{#if snapshot.selection}
		{#each ['left', 'right'] as position (position)}
			{@const team = position === 'left' ? teams.left : teams.right}
			{@const entryId =
				position === 'left'
					? snapshot.presentation.leftEntryId
					: snapshot.presentation.rightEntryId}
			{@const side = gameplaySide(snapshot, entryId)}
			<div class="team" data-position={position} data-entry-id={entryId ?? ''} data-side={side ?? 'neutral'}>
				<Identity
					name={team?.name ?? null}
					detail={team?.tag}
					assetPath={team?.logoPath ?? team?.logoWhitePath ?? team?.logoBlackPath ?? null}
					unavailable="Team unavailable"
					{side}
				/>
			</div>
		{/each}
		<div class="context">
			<strong>{snapshot.game?.map?.displayName ?? 'MAP TBD'}</strong>
			<p>
				GAME {snapshot.game?.number ?? '—'}{#if snapshot.match}
					<span aria-hidden="true"> // </span>BO{snapshot.match.bestOf}{/if}
			</p>
		</div>
	{:else}
		<p class="empty">No game selected</p>
	{/if}
</section>

<style>
	/* Provisional 1920x1080 rehearsal geometry: protect minimap x0–460/y0–420,
	   timer x460–1460/y0–200, killfeed x1460–1920/y0–420 and all y680–1080.
	   OBS/Valorant rehearsal must confirm or revise these bounds. */
	section {
		position: absolute;
		left: 480px;
		top: 224px;
		width: 960px;
		height: 112px;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 310px 340px 310px;
		align-items: stretch;
		overflow: hidden;
		color: #f7f4eb;
		background: linear-gradient(90deg, #0b0f15ee, #151b24f2 50%, #0b0f15ee);
		font:
			15px/1.2 'Segoe UI',
			sans-serif;
		border-block: 1px solid #303947;
		clip-path: polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px), 0 16px);
		--gfx-accent: #63e6d7;
		--gfx-muted: #97a2b0;
		--gfx-attack: #248bff;
		--gfx-defense: #ff4655;
		--asset-width: 46px;
		--asset-height: 46px;
	}
	.team,
	.context {
		min-width: 0;
		overflow: hidden;
	}
	.team {
		display: flex;
		align-items: center;
		padding: 10px 14px;
		border-bottom: 4px solid #303947;
	}
	.team[data-position='left'] {
		grid-column: 1;
		grid-row: 1;
	}
	.team[data-position='right'] {
		grid-column: 3;
		grid-row: 1;
	}
	.team[data-side='attack'] {
		border-bottom-color: var(--gfx-attack);
	}
	.team[data-side='defense'] {
		border-bottom-color: var(--gfx-defense);
	}
	.team[data-position='right'] {
		justify-content: end;
	}
	.team :global(.identity) {
		width: 100%;
		border: 0;
		padding: 0;
		gap: 10px;
	}
	.team[data-position='right'] :global(.identity) {
		flex-direction: row-reverse;
		text-align: right;
	}
	.team :global(.identity strong) {
		font:
			800 18px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
	}
	.team :global(.identity small) {
		margin-top: 4px;
		color: var(--gfx-muted);
		font:
			700 9px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.context {
		grid-column: 2;
		grid-row: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 8px 18px;
		text-align: center;
		background: #090d13c9;
		border-inline: 1px solid #303947;
	}
	.context strong {
		color: var(--gfx-accent);
		font:
			900 23px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.context p {
		margin: 7px 0 0;
		color: var(--gfx-muted);
		font:
			700 10px/1 Bahnschrift,
			'Arial Narrow',
			sans-serif;
		letter-spacing: 0.11em;
	}
	.empty {
		grid-column: 1 / -1;
		align-self: center;
		text-align: center;
	}
	section :global(.identity),
	section :global(.identity > div) {
		min-width: 0;
		overflow: hidden;
	}
	section :global(strong),
	section :global(small),
	p {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
