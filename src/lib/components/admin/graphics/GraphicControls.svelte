<script lang="ts">
	import { resolve } from '$app/paths';
	import ManagementForm from '../management/ManagementForm.svelte';
	import MapWinnerControl from './MapWinnerControl.svelte';
	import {
		broadcastScopes,
		graphicLabels,
		type GraphicId,
		type BroadcastScope
	} from '#lib/broadcast/controls.ts';
	import { statisticFields, type StatisticField } from '#lib/statistics/fields.ts';
	import { playerInScope, statisticMetric } from '#lib/broadcast/selectors.ts';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
	let { graphic, live }: { graphic: GraphicId; live: BroadcastSnapshot } = $props();
	const shown = $derived(live.controls.visibility[graphic]);
	const published = $derived(live.publications[graphic]);
	const onComposite = $derived(live.composite.visibility[graphic]);
	const compositePublished = $derived(live.composite.publications[graphic]);
	const newerThan = (capture: NonNullable<typeof published>) =>
		live.dataRevision > capture.dataRevision ||
		(graphic === 'player-stats' &&
			JSON.stringify(live.controls.playerStats) !== JSON.stringify(capture.controls.playerStats)) ||
		(graphic === 'mvp' &&
			(live.controls.mvpScope !== capture.controls.mvpScope ||
				JSON.stringify(live.controls.mvpFields) !== JSON.stringify(capture.controls.mvpFields)));
	const fieldLabels: Record<StatisticField, string> = {
		kills: 'Kills',
		deaths: 'Deaths',
		assists: 'Assists',
		performanceScore: 'Performance Score',
		trades: 'Trades',
		firstBloods: 'First Bloods',
		plants: 'Plants',
		defuses: 'Defuses'
	};
	function coverage(scope: BroadcastScope, playerId: string | null, field: StatisticField) {
		const player = playerInScope(live, scope, playerId);
		const name = player.player?.displayName ?? 'Player not selected';
		const metric = statisticMetric(player.statistics, field, scope);
		return `${name}: ${metric.coverage === 'none' ? 'unavailable' : metric.coverage}`;
	}
</script>

<section class="admin-editor space-y-4" aria-label="Program controls">
	<h2 class="h3">Program · {shown ? 'Shown' : 'Hidden'}</h2>
	{#if published && shown}
		<p>
			Published data revision {published.dataRevision} · publication {published.controlRevision}
		</p>
		{#if newerThan(published)}
			<p role="status" class="text-warning-600-400">
				Preview contains newer saved data or controls. Update to publish.
			</p>
		{/if}
	{/if}
	{#if shown && !published}<p role="alert">
			Published content is unavailable. Use Update to capture saved data.
		</p>{/if}
	{#if graphic === 'player-lineup'}
		<div role="group" aria-label="Lineup display" class="flex flex-wrap gap-2">
			{#each [{ value: 'team-a', label: 'Team A lineup' }, { value: 'team-b', label: 'Team B lineup' }, { value: 'both', label: 'Both lineups' }] as choice (choice.value)}
				<ManagementForm
					action="/admin/graphics?/controls"
					recordDraft={false}
					initial={{ expectedRevision: live.controlRevision, lineupTeams: choice.value }}
				>
					<button
						class="btn {live.liveControls.lineupTeams === choice.value
							? 'preset-filled-primary-500'
							: 'preset-tonal-primary'}"
						aria-pressed={live.liveControls.lineupTeams === choice.value}
						disabled={!live.selection}>{choice.label}</button
					>
				</ManagementForm>
			{/each}
		</div>
	{/if}
	<div class="flex flex-wrap gap-2">
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
		{#if shown}
			<ManagementForm
				action="/admin/graphics?/controls"
				recordDraft={false}
				initial={{ expectedRevision: live.controlRevision, republish: { standalone: [graphic] } }}
			>
				<button class="btn preset-tonal-primary" disabled={!live.selection}>
					Update {graphicLabels[graphic]}
				</button>
			</ManagementForm>
		{/if}
	</div>
	{#if graphic === 'player-lineup'}<MapWinnerControl {live} />{/if}
	{#if graphic === 'player-stats' || graphic === 'mvp'}
		<ManagementForm
			action="?/controls"
			initial={{
				expectedRevision: live.controlRevision,
				playerStats: graphic === 'player-stats' ? live.controls.playerStats : undefined,
				mvpScope: graphic === 'mvp' ? live.controls.mvpScope : undefined,
				mvpFields: graphic === 'mvp' ? live.controls.mvpFields : undefined
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
				{@const selectedFields = stats ? stats.fields : draft.mvpFields}
				{#if selectedFields}
					<fieldset class="space-y-2">
						<legend>Statistics fields</legend>
						{#each statisticFields as field (field)}
							<label class="flex items-start gap-2">
								<input
									type="checkbox"
									checked={selectedFields.includes(field)}
									onchange={(event) => {
										const next = event.currentTarget.checked
											? [...selectedFields, field]
											: selectedFields.filter((item) => item !== field);
										if (stats) stats.fields = next;
										else draft.mvpFields = next;
									}}
								/>
								<span
									>{fieldLabels[field]} · {#if stats}{coverage(
											stats.scope,
											stats.playerId,
											field
										)}{#if stats.mode === 'head-to-head'}; {coverage(
												stats.scope,
												stats.opponentPlayerId,
												field
											)}{/if}{:else if draft.mvpScope}{coverage(
											draft.mvpScope,
											live.scopes[draft.mvpScope].mvpPlayerId,
											field
										)}{/if}</span
								>
							</label>
						{/each}
					</fieldset>
				{/if}
				<p class="text-sm">
					Saving content controls updates Preview. On-air content remains published until Update or
					Update Live.
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

<section class="admin-editor space-y-4" aria-label="Composite controls">
	<h2 class="h3">Composite · {onComposite ? 'Live' : 'Off'}</h2>
	<div class="flex flex-wrap gap-2">
		{#if onComposite}
			<!-- Taking an on-air graphic again is a no-op, so on-air graphics offer Update instead. -->
			<ManagementForm
				action="/admin/graphics?/controls"
				recordDraft={false}
				initial={{ expectedRevision: live.controlRevision, republish: { composite: [graphic] } }}
			>
				<button class="btn preset-tonal-primary" disabled={!live.selection}>
					Update {graphicLabels[graphic]} Live
				</button>
			</ManagementForm>
			<ManagementForm
				action="/admin/graphics?/controls"
				recordDraft={false}
				initial={{ expectedRevision: live.controlRevision, composite: { [graphic]: false } }}
			>
				<button class="btn preset-tonal-error" disabled={!live.selection}>
					Take {graphicLabels[graphic]} Off
				</button>
			</ManagementForm>
		{:else}
			<ManagementForm
				action="/admin/graphics?/controls"
				recordDraft={false}
				initial={{ expectedRevision: live.controlRevision, composite: { [graphic]: true } }}
			>
				<button class="btn preset-filled-error-500" disabled={!live.selection}>
					Take {graphicLabels[graphic]} Live
				</button>
			</ManagementForm>
		{/if}
	</div>
	{#if onComposite && compositePublished && newerThan(compositePublished)}
		<p role="status" class="text-warning-600-400">
			Preview contains newer saved data or controls. Update Live to publish.
		</p>
	{/if}
	{#if onComposite && !compositePublished}<p role="alert">
			Published content is unavailable. Use Update Live to capture saved data.
		</p>{/if}
</section>
