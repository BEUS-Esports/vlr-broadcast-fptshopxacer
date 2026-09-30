<script lang="ts">
	import ManagementForm from './ManagementForm.svelte';

	let {
		revision,
		entries,
		scoreboard,
		players,
		agents,
		provenance,
		resultType,
		disabled = false
	}: {
		revision: number;
		entries: Array<{ id: string; name: string }>;
		scoreboard: Array<{
			entryId: string;
			playerId: string | null;
			slot: number;
			agentId: string | null;
			kills?: number | null;
			deaths?: number | null;
			assists?: number | null;
			performanceScore?: number | null;
			trades?: number | null;
			firstBloods?: number | null;
			plants?: number | null;
			defuses?: number | null;
		}>;
		players: Array<{ id: string; displayName: string }>;
		agents: Array<{ id: string; displayName: string; isActive: boolean }>;
		provenance: {
			importSource: string | null;
			externalMatchId: string | null;
			importedAt: Date | null;
			lastManualEditAt: Date | null;
			manuallyChangedPlayerIds: string[];
		};
		resultType: string | null;
		disabled?: boolean;
	} = $props();

	const fields = [
		['kills', 'Kills'],
		['deaths', 'Deaths'],
		['assists', 'Assists'],
		['performanceScore', 'Performance Score'],
		['trades', 'Trades'],
		['firstBloods', 'First Bloods'],
		['plants', 'Plants'],
		['defuses', 'Defuses']
	] as const;
</script>

<p class="mt-2 text-sm text-surface-600-400">
	{resultType === 'normal'
		? 'Normal final result: saved statistics contribute to match and tournament totals.'
		: 'Draft or exceptional result: you can prepare statistics here; they do not contribute to broader totals yet.'}
</p>
<p class="mt-1 text-sm text-surface-600-400">
	{#if provenance.importedAt}
		Imported from {provenance.importSource ?? 'external source'} ({provenance.externalMatchId ??
			'no external ID'}) on {provenance.importedAt.toLocaleString()}. {provenance
			.manuallyChangedPlayerIds.length}
		player row(s) changed manually since import.
	{:else}
		Manual statistics only.
	{/if}
	{#if provenance.lastManualEditAt}
		Last manual change: {provenance.lastManualEditAt.toLocaleString()}.
	{/if}
</p>

{#if !scoreboard.length}
	<p>Save lineup players before entering post-game statistics.</p>
{:else}
	<ManagementForm
		action="?/statistics"
		initial={{
			expectedGameRevision: revision,
			players: scoreboard.map((row) => ({
				playerId: row.playerId!,
				entryId: row.entryId,
				agentId: row.agentId ?? '',
				kills: row.kills == null ? '' : String(row.kills),
				deaths: row.deaths == null ? '' : String(row.deaths),
				assists: row.assists == null ? '' : String(row.assists),
				performanceScore: row.performanceScore == null ? '' : String(row.performanceScore),
				trades: row.trades == null ? '' : String(row.trades),
				firstBloods: row.firstBloods == null ? '' : String(row.firstBloods),
				plants: row.plants == null ? '' : String(row.plants),
				defuses: row.defuses == null ? '' : String(row.defuses)
			}))
		}}
	>
		{#snippet children(draft, pending)}
			<fieldset disabled={disabled || pending} class="space-y-5">
				<legend class="sr-only">Post-game player statistics</legend>
				<p class="text-sm text-surface-600-400">
					Blank means unknown; enter 0 for a measured zero. Statistics stay with the saved player
					and Team A or Team B when sides change.
				</p>
				{#each entries as entry, teamIndex (entry.id)}
					<section class="space-y-3" aria-label={`Team ${teamIndex === 0 ? 'A' : 'B'} statistics`}>
						<h3 class="h4">Team {teamIndex === 0 ? 'A' : 'B'} · {entry.name}</h3>
						<div class="overflow-x-auto">
							<table class="table w-full min-w-max text-left text-sm">
								<thead
									><tr>
										<th scope="col">Player</th><th scope="col">Agent</th>
										{#each fields as [field, label] (field)}<th scope="col">{label}</th>{/each}
									</tr></thead
								>
								<tbody>
									{#each draft.players.filter((row) => row.entryId === entry.id) as row (row.playerId)}
										{@const name =
											players.find((player) => player.id === row.playerId)?.displayName ??
											row.playerId}
										<tr>
											<th scope="row" class="whitespace-nowrap">{name}</th>
											<td
												><select
													class="select min-w-32"
													aria-label={`${name} Agent`}
													bind:value={row.agentId}
												>
													<option value="">Unknown</option>
													{#each agents.filter((agent) => agent.isActive || agent.id === row.agentId) as agent (agent.id)}
														<option value={agent.id}
															>{agent.displayName}{agent.isActive ? '' : ' · Historical'}</option
														>
													{/each}
												</select></td
											>
											{#each fields as [field, label] (field)}
												<td
													><input
														class="input w-20"
														aria-label={`${name} ${label}`}
														inputmode="numeric"
														pattern="[0-9]*"
														bind:value={row[field]}
													/></td
												>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</section>
				{/each}
				<button type="submit" class="btn preset-filled-primary-500"
					>Save post-game statistics</button
				>
			</fieldset>
		{/snippet}
	</ManagementForm>
{/if}
