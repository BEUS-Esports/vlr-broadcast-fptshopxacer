<script lang="ts">
	import ManagementForm from '../management/ManagementForm.svelte';
	import { competitionTeams, teamByEntryId } from '#lib/broadcast/selectors.ts';
	import {
		CEREMONY_VISIBLE_MS,
		ceremonyTypes,
		ceremonyLabels,
		type BroadcastCeremonyType
	} from '#lib/broadcast/in-game-controls.ts';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';

	let { live }: { live: BroadcastSnapshot } = $props();
	let winner = $state('');
	let ceremony = $state<BroadcastCeremonyType>('round-win');
	let expiredSequence = $state<number | null>(null);
	const teams = $derived(Object.values(competitionTeams(live)).filter((team) => team !== null));
	const winnerEntryId = $derived(
		teams.some((team) => team.entryId === winner) ? winner : (teams[0]?.entryId ?? '')
	);
	const pause = $derived(live.liveControls.pause);
	const event = $derived(live.liveControls.ceremony);
	const playing = $derived(
		event &&
			event.sequence !== expiredSequence &&
			Date.now() < event.triggeredAt + CEREMONY_VISIBLE_MS
			? event
			: null
	);
	const timeoutTeam = $derived(
		pause.type === 'tactical' ? teamByEntryId(live, pause.entryId) : null
	);
	const ceremonyTeam = $derived(playing ? teamByEntryId(live, playing.entryId) : null);
</script>

<section class="admin-editor space-y-4" aria-label="Match pause">
	<h2 class="h3">Match pause</h2>
	{#if !live.selection}
		<p>Select a live game to control match banners.</p>
	{:else if pause.type === 'tactical'}
		<p role="status"><strong>TACTICAL TIMEOUT · {timeoutTeam?.name ?? 'Selected team'}</strong></p>
		{#if pause.pendingTechnical}
			<p class="text-warning-600-400">
				<strong>Technical Pause pending</strong> · Finish Timeout will begin Technical Pause.
			</p>
		{/if}
	{:else if pause.type === 'technical'}
		<p role="status"><strong>TECHNICAL PAUSE</strong></p>
	{:else}
		<p>No match pause active.</p>
	{/if}
	{#if playing && pause.type !== 'none'}
		<p class="text-warning-600-400">
			The pause is active and will display after the current ceremony.
		</p>
	{/if}
	<div class="flex flex-wrap gap-3">
		{#each teams as team (team.entryId)}
			<ManagementForm
				action="?/controls"
				recordDraft={false}
				initial={{
					expectedRevision: live.controlRevision,
					intent: 'in-game',
					command: 'start-tactical',
					entryId: team.entryId
				}}
			>
				<button class="btn preset-tonal-primary" disabled={!live.selection || pause.type !== 'none'}
					>Tactical Timeout · {team.name || team.tag}</button
				>
			</ManagementForm>
		{/each}
		{#if pause.type === 'none'}
			<ManagementForm
				action="?/controls"
				recordDraft={false}
				initial={{
					expectedRevision: live.controlRevision,
					intent: 'in-game',
					command: 'request-technical'
				}}
			>
				<button class="btn preset-tonal-warning" disabled={!live.selection}>Technical Pause</button>
			</ManagementForm>
		{:else if pause.type === 'tactical'}
			<ManagementForm
				action="?/controls"
				recordDraft={false}
				initial={{
					expectedRevision: live.controlRevision,
					intent: 'in-game',
					command: 'finish-tactical'
				}}
			>
				<button class="btn preset-filled-primary-500" disabled={!live.selection}
					>Finish Timeout</button
				>
			</ManagementForm>
			<ManagementForm
				action="?/controls"
				recordDraft={false}
				initial={{
					expectedRevision: live.controlRevision,
					intent: 'in-game',
					command: pause.pendingTechnical ? 'cancel-pending-technical' : 'request-technical'
				}}
			>
				<button class="btn preset-tonal-warning" disabled={!live.selection}
					>{pause.pendingTechnical
						? 'Cancel Pending Technical Pause'
						: 'Technical Pause After Timeout'}</button
				>
			</ManagementForm>
		{:else}
			<ManagementForm
				action="?/controls"
				recordDraft={false}
				initial={{
					expectedRevision: live.controlRevision,
					intent: 'in-game',
					command: 'resume-technical'
				}}
			>
				<button class="btn preset-filled-success-500" disabled={!live.selection}
					>Resume Match</button
				>
			</ManagementForm>
		{/if}
	</div>
</section>

<section class="admin-editor space-y-4" aria-label="Round ceremony">
	<h2 class="h3">Round ceremony</h2>
	{#if playing}
		{#key playing.sequence}
			<p
				role="status"
				{@attach () => {
					const sequence = playing!.sequence;
					const remaining = Math.max(0, playing!.triggeredAt + CEREMONY_VISIBLE_MS - Date.now());
					const timer = setTimeout(() => (expiredSequence = sequence), remaining);
					return () => clearTimeout(timer);
				}}
			>
				<strong>{ceremonyLabels[playing.type]} · {ceremonyTeam?.name ?? 'Selected team'}</strong> · Playing;
				clears automatically.
			</p>
		{/key}
	{:else}
		<p>Choose the winning team and round result, then trigger the banner.</p>
	{/if}
	{#if pause.type !== 'none'}<p>Resume the match before triggering a new ceremony.</p>{/if}
	<div class="grid gap-3 sm:grid-cols-2">
		<label class="label"
			><span>Ceremony team</span><select
				class="select"
				value={winnerEntryId}
				onchange={(e) => (winner = e.currentTarget.value)}
				disabled={!live.selection || !teams.length}
			>
				{#each teams as team (team.entryId)}<option value={team.entryId}
						>{team.name || team.tag}</option
					>{/each}
			</select></label
		>
		<label class="label"
			><span>Ceremony</span><select class="select" bind:value={ceremony}>
				{#each ceremonyTypes as type (type)}<option value={type}>{ceremonyLabels[type]}</option
					>{/each}
			</select></label
		>
	</div>
	<div class="flex flex-wrap gap-3">
		<ManagementForm
			action="?/controls"
			recordDraft={false}
			initial={{
				expectedRevision: live.controlRevision,
				intent: 'in-game',
				command: 'trigger-ceremony',
				entryId: winnerEntryId,
				ceremony
			}}
		>
			<button
				class="btn preset-filled-primary-500"
				disabled={!live.selection || !winnerEntryId || pause.type !== 'none' || !!playing}
				>Trigger Ceremony</button
			>
		</ManagementForm>
		<ManagementForm
			action="?/controls"
			recordDraft={false}
			initial={{
				expectedRevision: live.controlRevision,
				intent: 'in-game',
				command: 'dismiss-ceremony'
			}}
		>
			<button class="btn preset-tonal-surface" disabled={!live.selection || !event}
				>Dismiss Ceremony</button
			>
		</ManagementForm>
	</div>
	<p class="text-sm">Banners update Preview and shown In-Game output immediately.</p>
</section>
