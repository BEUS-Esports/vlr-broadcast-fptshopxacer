<script lang="ts" module>
	export type PostGameControls = {
		gameId: string;
		anchors: Array<{ id: string; displayName: string; riotId: string }>;
		availability: Record<'henrikdev' | 'spectra', { available: boolean; message: string | null }>;
		groupCode: string;
	};
</script>

<script lang="ts">
	import { deserialize } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import type { PostGameCandidate } from '#lib/post-game/types.ts';
	import type {
		PostGameReview,
		PostGameMappings,
		PostGameResolutions
	} from '#lib/post-game/review.ts';
	let {
		controls,
		revision,
		entries,
		disabled = false
	}: {
		controls: PostGameControls;
		revision: number;
		entries: Array<{ id: string; name: string }>;
		disabled?: boolean;
	} = $props();
	let anchor = $state('');
	let groupCode = $derived(controls.groupCode);
	let candidates = $state<PostGameCandidate[]>([]);
	let review = $state<PostGameReview | null>(null);
	let mappings = $state<PostGameMappings>({});
	let resolutions = $state<PostGameResolutions>({});
	let replacement = $state(false);
	let mappingDirty = $state(false);
	let invalid = $state(false);
	const stale = $derived(
		invalid || (!!review && (review.gameRevision !== revision || review.gameId !== controls.gameId))
	);
	let pending = $state('');
	const writing = $derived(pending === 'import' || pending === 'discard');
	let message = $state('');
	let failed = $state(false);
	let generation = 0;
	let controller: AbortController | undefined;
	const metrics = [
		['kills', 'Kills'],
		['deaths', 'Deaths'],
		['assists', 'Assists'],
		['performanceScore', 'Performance Score'],
		['trades', 'Trades'],
		['firstBloods', 'First Bloods'],
		['plants', 'Plants'],
		['defuses', 'Defuses']
	] as const;
	const canImport = $derived(
		!!review &&
			!stale &&
			!mappingDirty &&
			!review.validation.length &&
			review.players.every(
				(row) =>
					row.playerId &&
					(!row.conflicts.statistics || resolutions[row.playerId]?.statistics) &&
					(!row.conflicts.agent || resolutions[row.playerId]?.agent)
			) &&
			(!review.replacement || replacement)
	);
	const teamName = (id: string | null) =>
		entries.find((entry) => entry.id === id)?.name ?? 'Unresolved';
	$effect(() => {
		if (revision >= 0 && controls.gameId) return abortRequest;
	});
	function abortRequest() {
		controller?.abort();
	}
	onDestroy(stop);
	function stop() {
		if (writing) return;
		generation++;
		controller?.abort();
		pending = '';
	}
	function invalidate() {
		if (writing) return;
		stop();
		invalid = true;
		resolutions = {};
		replacement = false;
	}
	async function command(operation: string, input: Record<string, unknown> = {}) {
		if (writing) return;
		stop();
		const mutation = operation === 'import' || operation === 'discard';
		const current = generation;
		const requestRevision = revision;
		const requestGame = controls.gameId;
		controller = mutation ? undefined : new AbortController();
		pending = operation;
		message = '';
		failed = false;
		if (['discover', 'henrik', 'spectra', 'revise'].includes(operation)) {
			invalid = true;
			resolutions = {};
			replacement = false;
		}
		try {
			const form = new FormData();
			form.set('payload', JSON.stringify({ operation, expectedGameRevision: revision, ...input }));
			const response = await fetch(
				`/admin/games/${encodeURIComponent(controls.gameId)}?/postGame`,
				{
					method: 'POST',
					body: form,
					signal: controller?.signal,
					headers: { 'x-sveltekit-action': 'true' }
				}
			);
			const result = deserialize(await response.text());
			if (
				!mutation &&
				(current !== generation || requestRevision !== revision || requestGame !== controls.gameId)
			)
				return;
			if (result.type !== 'success') {
				failed = true;
				message =
					result.type === 'failure' && typeof result.data?.error === 'string'
						? result.data.error
						: 'Could not fetch or save this report. Manual entry remains available.';
				if (result.type === 'failure' && result.data?.code === 'stale') invalid = true;
				return;
			}
			const data = result.data as {
				candidates?: PostGameCandidate[];
				review?: PostGameReview;
				imported?: unknown;
				discarded?: unknown;
			};
			if (data.candidates) {
				candidates = data.candidates;
				message = candidates.length
					? 'Choose the intended match to review.'
					: 'No recent matches found.';
			}
			if (data.review) {
				review = data.review;
				mappings = { ...review.mappings };
				mappingDirty = false;
				invalid = false;
			}
			if (data.imported || data.discarded) {
				review = null;
				await refreshAll();
				if (current === generation)
					message = data.imported
						? 'Report imported into saved statistics.'
						: 'Player statistics discarded. Correct the lineup before fetching again.';
			}
		} catch {
			if (
				mutation ||
				(current === generation && requestRevision === revision && requestGame === controls.gameId)
			) {
				failed = true;
				message = 'Could not reach the server. Manual entry remains available.';
			}
		} finally {
			if (current === generation) pending = '';
		}
	}
</script>

<div class="my-5 space-y-5">
	<div class="grid gap-4 md:grid-cols-2">
		<section
			class="space-y-3 rounded-container border border-surface-300-700 p-4"
			aria-label="HenrikDev source"
		>
			<h3 class="h4">HenrikDev · Recommended</h3>
			<p>
				{controls.availability.henrikdev.available
					? 'Configured · fetched only on your request.'
					: controls.availability.henrikdev.message}
			</p>
			{#if !controls.anchors.length}<p>
					Save a Riot ID for a lineup player to fetch recent matches.
				</p>{/if}
			<label class="label"
				><span>Anchor player</span><select
					class="select"
					aria-label="Anchor player"
					bind:value={anchor}
					onchange={() => {
						invalidate();
						candidates = [];
					}}
					disabled={disabled || writing || !controls.anchors.length}
					><option value="">Choose a saved lineup player</option
					>{#each controls.anchors as player (player.id)}<option value={player.id}
							>{player.displayName} · {player.riotId}</option
						>{/each}</select
				></label
			>
			<button
				type="button"
				class="btn preset-filled-primary-500"
				disabled={disabled || !controls.availability.henrikdev.available || !anchor || !!pending}
				onclick={() => command('discover', { anchorPlayerId: anchor })}>Fetch Recent Matches</button
			>
			{#if candidates.length}<button
					type="button"
					class="btn preset-tonal-surface"
					disabled={disabled || !!pending || !anchor}
					onclick={() => command('discover', { anchorPlayerId: anchor })}
					>Refresh Recent Matches</button
				>{/if}
			{#each candidates as candidate (candidate.ref)}
				<article
					class="space-y-1 border-t border-surface-300-700 pt-3"
					aria-label={`Candidate ${candidate.ref}`}
				>
					<p>{candidate.map.name ?? 'Unknown map'} · {candidate.startedAt ?? 'Unknown time'}</p>
					<p>
						Score: {candidate.score?.teamA ?? '?'}–{candidate.score?.teamB ?? '?'} · {candidate.externalMatchId}
					</p>
					<p class="text-sm">
						{candidate.participants
							.slice(0, 4)
							.map((player) => player.riotId ?? player.externalPlayerId ?? 'Unknown participant')
							.join(', ')}
					</p>
					<button
						type="button"
						class="btn preset-tonal-primary"
						disabled={disabled || !!pending}
						onclick={() => command('henrik', { externalMatchId: candidate.externalMatchId })}
						>Select Match {candidate.externalMatchId}</button
					>
				</article>
			{/each}
		</section>
		<section
			class="space-y-3 rounded-container border border-surface-300-700 p-4"
			aria-label="ValoSpectra source"
		>
			<h3 class="h4">ValoSpectra</h3>
			<p>
				{controls.availability.spectra.available
					? 'Hosted statistics service · completed reports only.'
					: controls.availability.spectra.message}
			</p>
			<label class="label"
				><span>Spectra group code</span><input
					class="input"
					bind:value={groupCode}
					oninput={invalidate}
					maxlength="128"
					disabled={disabled || writing}
				/></label
			>
			<button
				type="button"
				class="btn preset-tonal-primary"
				disabled={disabled ||
					!controls.availability.spectra.available ||
					!groupCode.trim() ||
					!!pending}
				onclick={() => command('spectra', { groupCode })}>Fetch Report</button
			>
			{#if pending === 'spectra'}<p role="status">
					Checking Spectra report; server polling is bounded. Manual statistics remain available.
				</p>{/if}
		</section>
	</div>
	{#if pending}<p role="status">
			{pending === 'import'
				? 'Importing…'
				: pending === 'discard'
					? 'Discarding statistics…'
					: 'Loading report…'}
		</p>
		{#if !writing}<button
				type="button"
				class="btn preset-tonal-surface"
				onclick={() => {
					stop();
					message = 'Request stopped. Fetch again when ready.';
				}}>Stop / Cancel</button
			>{/if}{/if}
	{#if message}<p role={failed ? 'alert' : 'status'}>{message}</p>{/if}
	{#if review}
		<section
			class="space-y-4 rounded-container border border-surface-300-700 p-4"
			aria-label="Post-game import review"
		>
			<h3 class="h4">
				Review {review.provider === 'henrikdev' ? 'HenrikDev' : 'ValoSpectra'} · {review.externalMatchId}
			</h3>
			<p>
				Map: {review.map.current ?? 'Unknown local map'} → {review.map.proposed ??
					'Unknown provider map'} · {review.startedAt ?? 'Unknown time'}
			</p>
			<p>
				Local score: {review.score.local.teamA ?? '?'}–{review.score.local.teamB ?? '?'}. Provider
				score: {review.score.provider
					.map((team) => `${teamName(team.entryId)} ${team.score ?? '?'}`)
					.join(' · ')}.
			</p>
			<p>
				Team mapping: {review.teamMappings
					.map((team) => `${team.teamKey} → ${teamName(team.entryId)}`)
					.join(' · ')}
			</p>
			{#if stale}<p role="alert">
					This review is stale. Fetch and review the report again before confirming.
				</p>{/if}
			{#each review.validation as problem (problem)}<p role="alert">{problem}</p>{/each}
			{#each review.players as row (row.providerIndex)}
				<section
					class="space-y-2 border-t border-surface-300-700 pt-3"
					aria-label={`Player mapping ${row.providerIndex + 1}`}
				>
					<label class="label"
						><span
							>{row.providerIdentity.riotId ??
								row.providerIdentity.externalPlayerId ??
								'Unknown participant'} · {row.mappingState} mapping</span
						><select
							class="select"
							aria-label={`Map provider player ${row.providerIndex + 1}`}
							bind:value={mappings[String(row.providerIndex)]}
							disabled={disabled || stale || !!pending}
							onchange={() => {
								mappingDirty = true;
								resolutions = {};
								replacement = false;
							}}
							><option value="">Unresolved — choose a lineup player</option
							>{#each review.localPlayers as player (player.playerId)}<option
									value={player.playerId}
									>{teamName(player.entryId)} · {player.displayName} · {player.riotId ??
										'No Riot ID'}</option
								>{/each}</select
						></label
					>
					<p>
						Agent: {row.current.agentName ?? 'Unknown'} → {row.proposed.agentName ?? 'Unavailable'}
					</p>
					<div class="overflow-x-auto">
						<table class="table w-full text-sm">
							<caption class="text-left"
								>Proposed statistics diff · {row.localIdentity?.displayName ??
									'Unresolved player'}</caption
							><thead
								><tr
									><th scope="col">Metric</th><th scope="col">Saved</th><th scope="col">Provider</th
									></tr
								></thead
							><tbody
								>{#each metrics as [field, label] (field)}<tr
										><th scope="row">{label}</th><td>{row.current[field] ?? 'Unknown'}</td><td
											>{row.availability[field] ? row.proposed[field] : 'Unavailable'}</td
										></tr
									>{/each}</tbody
							>
						</table>
					</div>
					{#if row.playerId}
						{#each ['statistics', 'agent'] as scope (scope)}
							{#if row.conflicts[scope as 'statistics' | 'agent']}<p role="alert">
									Manual {scope} conflict for {row.localIdentity?.displayName}. Choose what to keep.
								</p>
								<label class="label"
									><span>{row.localIdentity?.displayName} {scope} conflict</span><select
										class="select"
										aria-label={`${row.localIdentity?.displayName} ${scope} conflict`}
										disabled={disabled || stale || mappingDirty || !!pending}
										value={resolutions[row.playerId]?.[scope as 'statistics' | 'agent'] ?? ''}
										onchange={(event) => {
											resolutions = {
												...resolutions,
												[row.playerId!]: {
													...resolutions[row.playerId!],
													[scope]: event.currentTarget.value
												}
											};
										}}
										><option value="">Choose a resolution</option><option value="keep-local"
											>Keep manual {scope}</option
										><option value="use-provider">Replace with {review.provider} {scope}</option
										></select
									></label
								>{/if}
						{/each}
						{#if row.manual.statistics}<button
								type="button"
								class="btn preset-tonal-error"
								disabled={disabled || !!pending}
								onclick={() => {
									if (
										window.confirm(
											`Discard saved statistics and import provenance for ${row.localIdentity?.displayName}? This cannot be undone.`
										)
									)
										void command('discard', { playerId: row.playerId, confirmation: true });
								}}>Discard {row.localIdentity?.displayName} statistics</button
							>{/if}
					{/if}
				</section>
			{/each}
			{#if mappingDirty}<button
					type="button"
					class="btn preset-tonal-primary"
					disabled={disabled || stale || !!pending}
					onclick={() => command('revise', { token: review!.token, mappings })}
					>Review updated mappings</button
				>
				<p>Review the revised preview before importing.</p>{/if}
			{#if review.replacement}<label class="label flex gap-2"
					><input
						type="checkbox"
						class="checkbox"
						bind:checked={replacement}
						disabled={disabled || stale || mappingDirty || !!pending}
					/><span
						>Replace existing {review.provenance.importSource} report {review.provenance
							.externalMatchId} with {review.provider} report {review.externalMatchId}.</span
					></label
				>{/if}
			<button
				type="button"
				class="btn preset-filled-primary-500"
				disabled={disabled || !!pending || !canImport}
				onclick={() => {
					if (
						window.confirm(
							`Import ${review!.provider} report ${review!.externalMatchId} into this game's saved statistics with the reviewed resolutions?`
						)
					)
						void command('import', {
							token: review!.token,
							resolutions,
							confirmReplacement: replacement
						});
				}}>Confirm Import</button
			>
		</section>
	{/if}
</div>
