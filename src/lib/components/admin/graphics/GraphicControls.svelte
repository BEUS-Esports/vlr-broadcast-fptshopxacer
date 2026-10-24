<script lang="ts">
	import { resolve } from '$app/paths';
	import ManagementForm from '../management/ManagementForm.svelte';
	import { broadcastScopes, graphicLabels, type GraphicId } from '#lib/broadcast/controls.ts';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
	let { graphic, live }: { graphic: GraphicId; live: BroadcastSnapshot } = $props();
	const shown = $derived(live.controls.visibility[graphic]);
	const published = $derived(live.publications[graphic]);
</script>

<section class="admin-editor space-y-4" aria-label="Program controls">
	<h2 class="h3">Program · {shown ? 'Shown' : 'Hidden'}</h2>
	{#if published && shown}
		<p>
			Published data revision {published.dataRevision} · publication {published.controlRevision}
		</p>
		{#if live.dataRevision > published.dataRevision || (graphic === 'player-stats' && JSON.stringify(live.controls.playerStats) !== JSON.stringify(published.controls.playerStats)) || (graphic === 'mvp' && live.controls.mvpScope !== published.controls.mvpScope)}
			<p role="status" class="text-warning-600-400">
				Preview contains newer saved data or controls. Hide → Show to publish.
			</p>
		{/if}
	{/if}
	{#if shown && !published}<p role="alert">
			Published content is unavailable. Hide this graphic, then Show again to capture saved data.
		</p>{/if}
	<ManagementForm
		action="?/controls"
		recordDraft={false}
		initial={{ expectedRevision: live.controlRevision, visibility: { [graphic]: !shown } }}
	>
		<button
			class="btn {shown ? 'preset-tonal-error' : 'preset-filled-success-500'}"
			disabled={!live.selection}
		>
			{shown ? 'Hide' : 'Show'}
			{graphicLabels[graphic]}
		</button>
	</ManagementForm>
	{#if graphic === 'player-stats' || graphic === 'mvp'}
		<ManagementForm
			action="?/controls"
			recordDraft={false}
			initial={{
				expectedRevision: live.controlRevision,
				playerStats: graphic === 'player-stats' ? live.controls.playerStats : undefined,
				mvpScope: graphic === 'mvp' ? live.controls.mvpScope : undefined
			}}
		>
			{#snippet children(draft)}
				{@const stats = draft.playerStats}
				{#if stats}
					<label class="label"
						><span>Stats mode</span><select
							class="select"
							bind:value={stats.mode}
							onchange={() => {
								if (stats.mode === 'single') stats.opponentPlayerId = null;
							}}
						>
							<option value="single">Single / Player to Watch</option><option value="head-to-head"
								>Head-to-Head</option
							>
						</select></label
					>
					<label class="label"
						><span>Stats scope</span><select
							class="select"
							bind:value={stats.scope}
							onchange={() => {
								stats.playerId = null;
								stats.opponentPlayerId = null;
							}}
						>
							{#each broadcastScopes as scope (scope)}<option value={scope}>{scope}</option>{/each}
						</select></label
					>
					<label class="label"
						><span>Stats player</span><select class="select" bind:value={stats.playerId}>
							<option value={null}>Unknown / no selection</option>
							{#each live.scopes[stats.scope].candidates as player (player.playerId)}<option
									value={player.playerId}>{player.displayName}</option
								>{/each}
						</select></label
					>
					{#if stats.mode === 'head-to-head'}
						<label class="label"
							><span>Opponent player</span><select
								class="select"
								bind:value={stats.opponentPlayerId}
							>
								<option value={null}>Unknown / no selection</option>
								{#each live.scopes[stats.scope].candidates as player (player.playerId)}<option
										value={player.playerId}
										disabled={player.playerId === stats.playerId}>{player.displayName}</option
									>{/each}
							</select></label
						>
					{/if}
				{:else}
					<label class="label"
						><span>MVP scope</span><select class="select" bind:value={draft.mvpScope}>
							{#each broadcastScopes as scope (scope)}<option value={scope}>{scope}</option>{/each}
						</select></label
					>
				{/if}
				<p class="text-sm">
					Saving content controls updates Preview. Shown program content remains published until
					Hide → Show.
				</p>
				<button class="btn preset-filled-primary-500" disabled={!live.selection}
					>Save {graphicLabels[graphic]} controls</button
				>
			{/snippet}
		</ManagementForm>
	{/if}
	<a
		href={resolve('/gfx/live/[graphic]', { graphic })}
		target="_blank"
		rel="noreferrer"
		class="text-sm underline">Open {graphicLabels[graphic]} output</a
	>
</section>
