<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { BroadcastSnapshot } from '#lib/broadcast/types.ts';
	import type { LiveGameEnvelope } from '#lib/live/types.ts';
	import type { getLiveDiagnostics } from '#lib/server/live/runtime.ts';
	let { snapshot, telemetry }: { snapshot: BroadcastSnapshot; telemetry: LiveGameEnvelope | null } =
		$props();
	type Diagnostics = Awaited<ReturnType<typeof getLiveDiagnostics>>;
	let diagnostics = $state.raw<Diagnostics | null>(null);
	let source = $state('none');
	let groupCode = $state('');
	let error = $state('');
	let pending = $state(false);
	let dialog = $state<HTMLDialogElement>();
	let section = $state('normalized');
	let teamPicks = $state<Record<string, string>>({});
	let playerPicks = $state<Record<string, string>>({});
	let editedGeneration = $state(-1);
	let mappingEdited = $state(false);
	const status = $derived(telemetry?.status ?? diagnostics?.connection);
	const gameState = $derived(telemetry?.state ?? diagnostics?.normalized);
	const json = $derived(
		JSON.stringify(
			section === 'raw'
				? diagnostics?.raw
				: section === 'connection'
					? {
							status: diagnostics?.connection,
							mapping: diagnostics?.mapping,
							config: diagnostics?.config
						}
					: { state: diagnostics?.normalized, mapping: diagnostics?.mapping },
			null,
			2
		)
	);
	async function refresh(signal?: AbortSignal) {
		const response = await fetch('/admin/live', { signal, cache: 'no-store' });
		if (!response.ok) throw new Error('Could not read provider state. Reload the controller.');
		diagnostics = await response.json();
		if (diagnostics && editedGeneration !== diagnostics.connection.generation) {
			editedGeneration = diagnostics.connection.generation;
			groupCode = diagnostics.config.groupCode;
			source = diagnostics.connection.provider ?? 'none';
			mappingEdited = !!diagnostics.mapping;
			teamPicks = Object.fromEntries(
				(diagnostics.mapping?.teams ?? diagnostics.suggestions?.teams ?? []).map((team) => [
					team.providerSide,
					team.entryId
				])
			);
			playerPicks = Object.fromEntries(
				(diagnostics.mapping?.players ?? diagnostics.suggestions?.players ?? []).map((player) => [
					player.providerKey,
					player.playerId
				])
			);
		}
		// Suggestions can arrive after connection; retain every deliberate operator edit.
		if (diagnostics?.suggestions && !mappingEdited) {
			teamPicks = Object.fromEntries(
				diagnostics.suggestions.teams.map((team) => [team.providerSide, team.entryId])
			);
			playerPicks = Object.fromEntries(
				diagnostics.suggestions.players.map((player) => [player.providerKey, player.playerId])
			);
		}
	}
	async function act(action: string, extra: Record<string, unknown> = {}) {
		pending = true;
		error = '';
		try {
			const response = await fetch('/admin/live', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action, generation: status?.generation ?? 0, ...extra })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? 'Could not change provider state.');
			await refresh();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not change provider state.';
		} finally {
			pending = false;
		}
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(json ?? 'null');
		} catch {
			error = 'Copy failed. Select the visible JSON and copy it manually.';
		}
	}
	onMount(() => {
		const abort = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		const tick = async () => {
			try {
				await refresh(abort.signal);
			} catch {
				if (!abort.signal.aborted) error = 'Could not read provider state. Reload the controller.';
			}
			if (!abort.signal.aborted) timer = setTimeout(tick, 1000);
		};
		void tick();
		return () => {
			abort.abort();
			clearTimeout(timer);
		};
	});
</script>

<section class="admin-editor space-y-4" aria-label="Live provider">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="h3">Live provider</h2>
		<a class="text-sm underline" href={resolve('/admin/settings')}>Provider Settings</a>
	</header>
	<p role="status">
		{status?.provider ?? 'None'} · {status?.health ?? 'Loading'} · {status?.mode === 'external'
			? 'External HUD'
			: 'Native HUD'} · Mapping {status?.mappingReady ? 'confirmed' : 'needs review'}
	</p>
	{#if status?.nextRetryAt}<p>
			Retry {status.retryAttempt + 1} at {new Date(status.nextRetryAt).toLocaleTimeString()}.
		</p>{/if}
	{#if status?.lastError}<p role="alert">{status.lastError}</p>{/if}
	{#if status?.provider === 'spectra' && status.attribution === 'invalid-key'}<p role="alert">
			Spectra did not accept the access key. Attribution remains enabled; update the key in
			Settings.
		</p>{/if}
	<div class="flex flex-wrap items-end gap-3">
		<label class="label"
			><span>Source</span><select class="select" bind:value={source}
				><option value="none">None</option><option value="spectra">ValoSpectra</option><option
					value="gstack">GStack</option
				></select
			></label
		>
		<button
			type="button"
			class="btn preset-tonal-primary"
			disabled={pending}
			onclick={() => (source === 'none' ? act('disconnect') : act('connect', { provider: source }))}
			>{source === 'none' ? 'Apply None' : 'Connect'}</button
		>
		<button
			type="button"
			class="btn preset-tonal-surface"
			disabled={pending || !status?.provider}
			onclick={() => act('disconnect')}>Disconnect / None</button
		>
	</div>
	{#if source === 'spectra'}
		<div class="flex flex-wrap items-end gap-3">
			<label class="label"
				><span>Spectra group code</span><input
					class="input"
					bind:value={groupCode}
					maxlength="128"
				/></label
			><button
				type="button"
				class="btn preset-tonal-primary"
				disabled={pending || !diagnostics}
				onclick={() => act('group', { groupCode, configRevision: diagnostics?.config.revision })}
				>Set group code</button
			>
		</div>
	{/if}
	<div class="flex flex-wrap gap-3">
		<button
			type="button"
			class="btn preset-filled-warning-500"
			disabled={pending}
			onclick={() => act('native')}>Use native HUD</button
		>
		<button
			type="button"
			class="btn preset-filled-success-500"
			disabled={pending ||
				!status?.mappingReady ||
				!['live', 'ready'].includes(status?.health ?? '')}
			onclick={() => act('external')}>Enable external HUD</button
		>
		<button type="button" class="btn preset-tonal-primary" onclick={() => dialog?.showModal()}
			>View Data</button
		>
	</div>
	<p class="text-sm">
		Recovery leaves the native HUD enabled. Confirm this game and both team mappings before enabling
		the external HUD. Missing Player/Expansion Client fields remain unavailable.
	</p>
	{#if gameState}
		<form
			class="space-y-3"
			onchange={() => (mappingEdited = true)}
			onsubmit={(event) => {
				event.preventDefault();
				void act('mapping', {
					mapping: {
						teams: gameState?.teams.map((team) => ({
							providerSide: team.providerSide,
							entryId: teamPicks[team.providerSide] ?? ''
						})),
						players: Object.entries(playerPicks)
							.filter(([, id]) => id)
							.map(([providerKey, playerId]) => ({ providerKey, playerId }))
					}
				});
			}}
		>
			<h3 class="h4">Confirm provider identity · {snapshot.game?.name ?? 'Select a local game'}</h3>
			{#each gameState.teams as team (team.providerSide)}
				<fieldset class="space-y-2 rounded-base border border-surface-300-700 p-3">
					<legend
						>{team.providerSide} · {team.observedName ?? 'Provider team name unavailable'}</legend
					>
					<label class="label"
						><span>Local team for {team.providerSide}</span><select
							class="select"
							bind:value={teamPicks[team.providerSide]}
							required
							><option value="">Unmapped</option
							>{#each snapshot.teams as local (local.entryId)}<option value={local.entryId}
									>{local.name}</option
								>{/each}</select
						></label
					>
					{#each team.players as player (player.providerKey)}
						<label class="label"
							><span
								>Slot {player.providerSlot ?? '—'} · {player.observedName ??
									player.providerKey}{player.playerId ? '' : ' · unmapped'}</span
							><select class="select" bind:value={playerPicks[player.providerKey]}
								><option value="">Unmapped</option
								>{#each snapshot.lineups.filter((slot) => slot.entryId === teamPicks[team.providerSide] && slot.player) as slot (slot.slot)}<option
										value={slot.player!.playerId}>{slot.player!.displayName}</option
									>{/each}</select
							></label
						>
					{/each}
				</fieldset>
			{/each}
			<button class="btn preset-filled-primary-500" disabled={pending || !snapshot.selection}
				>Confirm mapping for selected game</button
			>
		</form>
	{/if}
	{#if error}<p role="alert">{error}</p>{/if}
</section>

<dialog
	{@attach (element) => {
		dialog = element;
	}}
	aria-label="View Data"
	class="w-[min(95vw,70rem)] max-w-none rounded-base border border-surface-500 bg-surface-950 p-5 text-surface-50"
>
	<header class="mb-4 flex items-center justify-between gap-3">
		<h2 class="h3">View Data</h2>
		<button type="button" class="btn preset-tonal-surface" onclick={() => dialog?.close()}
			>Close</button
		>
	</header>
	<div class="mb-3 flex flex-wrap gap-3" aria-label="Data sections">
		{#each [['normalized', 'Normalized Game Data'], ['raw', 'Raw Provider Data'], ['connection', 'Connection']] as tab (tab[0])}<button
				type="button"
				class="btn {section === tab[0] ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
				aria-pressed={section === tab[0]}
				onclick={() => (section = tab[0])}>{tab[1]}</button
			>{/each}<button type="button" class="btn preset-tonal-primary" onclick={copy}
			>Copy JSON</button
		>
	</div>
	<p class="mb-3 text-sm">
		Current data only · updated once per second. Unmapped identities are shown as null.
	</p>
	<pre
		class="max-h-[65dvh] overflow-auto rounded-base bg-black/30 p-4 text-xs break-all whitespace-pre-wrap">{json ??
			'Waiting for provider data'}</pre>
</dialog>
