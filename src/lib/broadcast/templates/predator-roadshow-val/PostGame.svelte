<script lang="ts">
	import type { BroadcastSnapshot } from '../../types';
	import {
		displayGameScore,
		lineupForTeam,
		playerInScope,
		presentationTeams
	} from '../../selectors';
	import Asset from '../../primitives/Asset.svelte';
	import header from './assets/post-header.webp';
	import { fitGroup } from './fit';

	let { snapshot }: { snapshot: BroadcastSnapshot } = $props();
	const teams = $derived(presentationTeams(snapshot));
	const sides = $derived(
		(['left', 'right'] as const).map((position) => {
			const entryId =
				position === 'left'
					? snapshot.presentation.leftEntryId
					: snapshot.presentation.rightEntryId;
			const lineup = lineupForTeam(snapshot, entryId);
			const rows = [1, 2, 3, 4, 5].map((slot) => {
				const saved = lineup.find((row) => row.slot === slot) ?? null;
				const statistics = playerInScope(
					snapshot,
					'game',
					saved?.player?.playerId ?? null
				).statistics;
				return {
					slot,
					saved,
					kills: statistics?.kills.value ?? null,
					deaths: statistics?.deaths.value ?? null,
					firstBloods: statistics?.firstBloods.value ?? null
				};
			});
			// Team MVP: most kills among filled slots; ties go to the lower slot.
			const mvp =
				rows.reduce<(typeof rows)[number] | null>(
					(best, row) =>
						!row.saved?.player
							? best
							: !best || (row.kills ?? -1) > (best.kills ?? -1)
								? row
								: best,
					null
				) ?? rows[0];
			return {
				position,
				entryId,
				team: position === 'left' ? teams.left : teams.right,
				score: displayGameScore(snapshot, entryId),
				mvp,
				others: rows.filter((row) => row !== mvp)
			};
		})
	);
	const kd = (kills: number | null, deaths: number | null) =>
		kills === null || deaths === null ? '—' : (kills / Math.max(deaths, 1)).toFixed(1);
</script>

<div class="post" {@attach fitGroup('players')} {@attach fitGroup('teams')}>
	<div class="header">
		<img src={header} alt="" />
		<div class="center">
			<small>GAME {snapshot.game?.number ?? '—'}</small>
			<strong>{snapshot.game?.map?.displayName ?? 'TBD'}</strong>
		</div>
	</div>
	{#each sides as side (side.position)}
		<section
			class={['side', side.position]}
			data-position={side.position}
			data-entry-id={side.entryId}
		>
			<div class="team">
				<span class="logo">
					<Asset
						path={side.team?.logoPath ?? side.team?.logoWhitePath ?? null}
						label={side.team?.name ?? 'Team'}
						blankMissing
					/>
				</span>
				<strong class="name" data-fit="teams">{side.team?.name ?? 'Team unavailable'}</strong>
				<strong class="score" data-score>{side.score ?? '—'}</strong>
			</div>
			<div class="panel">
				<ol class="rows">
					{#each side.others as row (row.slot)}
						<li data-slot={row.slot}>
							<span class="agent-icon">
								<Asset
									path={row.saved?.agent?.displayIconPath ?? null}
									label={row.saved?.agent?.displayName ?? 'Agent'}
									blankMissing
								/>
							</span>
							<span class="who">
								<small>{row.saved?.agent?.displayName ?? '—'}</small>
								<strong data-fit="players">{row.saved?.player?.displayName ?? '—'}</strong>
							</span>
							<span class="stat"
								><small>K/D</small><strong>{kd(row.kills, row.deaths)}</strong></span
							>
							<span class="stat"><small>KILLS</small><strong>{row.kills ?? '—'}</strong></span>
						</li>
					{/each}
				</ol>
				<article class="mvp" data-slot={side.mvp.slot} data-team-mvp>
					<p class="badge">MVP</p>
					<span class="bust">
						<Asset
							path={side.mvp.saved?.agent?.fullPortraitPath ??
								side.mvp.saved?.agent?.displayIconPath ??
								null}
							label={side.mvp.saved?.agent?.displayName ?? 'Agent'}
							blankMissing
						/>
					</span>
					<div class="mvp-name">
						<small>{side.mvp.saved?.agent?.displayName ?? '—'}</small>
						<strong data-fit="players">{side.mvp.saved?.player?.displayName ?? '—'}</strong>
					</div>
					<dl>
						<div>
							<dt>TOTAL KILLS</dt>
							<dd>{side.mvp.kills ?? '—'}</dd>
						</div>
						<div>
							<dt>K/D</dt>
							<dd>{kd(side.mvp.kills, side.mvp.deaths)}</dd>
						</div>
						<div>
							<dt>FIRST BLOODS</dt>
							<dd>{side.mvp.firstBloods ?? '—'}</dd>
						</div>
					</dl>
				</article>
			</div>
		</section>
	{/each}
</div>

<style>
	.post {
		position: absolute;
		inset: 0;
	}
	.header {
		position: absolute;
		left: 29px;
		top: 29px;
		width: 1862px;
		height: 191px;
		animation: rs-drop 0.35s ease-out both;
	}
	.header img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.center {
		position: absolute;
		left: 762px;
		width: 338px;
		top: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.center small {
		font: 700 22px/1 var(--rs-font);
		letter-spacing: 0.14em;
	}
	.center strong {
		color: var(--rs-ink);
		text-shadow: 0 2px 14px #000c;
		font: 900 48px/1 var(--rs-font);
		text-transform: uppercase;
	}
	.side {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.team {
		position: absolute;
		top: 39px;
		height: 171px;
		width: 700px;
		display: flex;
		align-items: center;
		gap: 26px;
		--asset-width: 116px;
		--asset-height: 116px;
	}
	.left .team {
		left: 60px;
	}
	.right .team {
		right: 60px;
		flex-direction: row-reverse;
	}
	.team .name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		font: 900 calc(54px * var(--fit-teams, 1)) / 1.1 var(--rs-font);
		text-transform: uppercase;
	}
	.right .team .name {
		text-align: right;
	}
	.score {
		font: 900 96px/1 var(--rs-font);
	}
	.panel {
		position: absolute;
		top: 250px;
		bottom: 40px;
		width: 900px;
		box-sizing: border-box;
		padding: 34px;
		display: grid;
		grid-template-columns: 1fr 260px;
		gap: 24px;
		background: linear-gradient(200deg, #000 45%, #00474fcc);
		border: 2px solid var(--rs-line);
		clip-path: polygon(
			18px 0,
			calc(100% - 18px) 0,
			100% 18px,
			100% calc(100% - 18px),
			calc(100% - 18px) 100%,
			18px 100%,
			0 calc(100% - 18px),
			0 18px
		);
		animation: rs-rise 0.4s 0.1s ease-out both;
	}
	.left .panel {
		left: 40px;
	}
	.right .panel {
		right: 40px;
		grid-template-columns: 260px 1fr;
	}
	.right .mvp {
		grid-column: 1;
		grid-row: 1;
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-rows: repeat(4, 1fr);
		gap: 14px;
	}
	.rows li {
		display: grid;
		grid-template-columns: 112px minmax(0, 1fr) 96px 96px;
		align-items: center;
		gap: 16px;
		padding: 0 18px 0 0;
		background: #000000c0;
		border: 1px solid #1cfffa66;
		--asset-width: 112px;
		--asset-height: 112px;
	}
	.agent-icon {
		height: 112px;
		background: linear-gradient(180deg, #0b4048, #021316);
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.who small,
	.mvp-name small {
		color: var(--rs-label);
		font: 700 20px/1 var(--rs-font);
	}
	.who strong,
	.mvp-name strong {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		font: 900 calc(30px * var(--fit-players, 1)) / 1.15 var(--rs-font);
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.stat small {
		color: var(--rs-label);
		font: 700 15px/1 var(--rs-font);
	}
	.stat strong {
		font: 900 34px/1 var(--rs-font);
	}
	.mvp {
		position: relative;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background:
			linear-gradient(90deg, #1cfffa22 1px, transparent 1px) 0 0 / 32px 32px,
			linear-gradient(180deg, #1cfffa22 1px, transparent 1px) 0 0 / 32px 32px,
			linear-gradient(180deg, #021316, #034a52);
		border: 2px solid var(--rs-line);
	}
	.badge {
		margin: 0;
		padding: 10px 0;
		text-align: center;
		color: var(--rs-ink-dark);
		background: linear-gradient(180deg, var(--rs-plate-from), var(--rs-plate-to));
		font: 900 34px/1 var(--rs-font);
	}
	.bust {
		flex: 1;
		min-height: 0;
		--asset-width: 100%;
		--asset-height: 100%;
	}
	.bust :global(img) {
		object-fit: cover;
		object-position: 50% 8%;
	}
	.mvp-name {
		padding: 10px 14px;
		text-align: center;
		background: #000000c0;
	}
	dl {
		margin: 0;
		padding: 8px 14px 14px;
		background: #000000c0;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		padding: 6px 0;
		border-bottom: 1px solid #1cfffa44;
	}
	dt {
		color: var(--rs-label);
		font: 700 15px/1 var(--rs-font);
	}
	dd {
		margin: 0;
		font: 900 22px/1 var(--rs-font);
	}
	@keyframes rs-drop {
		from {
			opacity: 0;
			translate: 0 -20px;
		}
	}
	@keyframes rs-rise {
		from {
			opacity: 0;
			translate: 0 30px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.header,
		.panel {
			animation: none;
		}
	}
</style>
