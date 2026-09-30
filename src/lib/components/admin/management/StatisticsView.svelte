<script lang="ts">
	import type { StatisticsView } from '#lib/server/services/statistics-aggregation.ts';

	let {
		statistics,
		entries
	}: {
		statistics: StatisticsView;
		entries: Array<{ id: string; name: string }>;
	} = $props();

	const fields = [
		{ key: 'kills', label: 'Kills' },
		{ key: 'deaths', label: 'Deaths' },
		{ key: 'assists', label: 'Assists' },
		{ key: 'trades', label: 'Trades' },
		{ key: 'firstBloods', label: 'First bloods' },
		{ key: 'plants', label: 'Plants' },
		{ key: 'defuses', label: 'Defuses' }
	] as const;
</script>

<section aria-label="Accumulated player statistics">
	<h2 class="h3">Player statistics</h2>
	<p class="mt-2 text-sm text-surface-600-400">
		Accumulated from {statistics.gamesContributing} of {statistics.gamesTotal} saved games. Only games
		with a normal result contribute. Incomplete entries remain visible with their field coverage.
	</p>
	<p class="mt-1 text-sm text-surface-600-400">
		Unavailable means the field was never recorded; zero means it was recorded as zero. Broader
		Performance Score is unavailable for match and tournament totals.
	</p>
	{#if statistics.players.length}
		<div class="mt-4 overflow-x-auto">
			<table class="table w-full text-left text-sm">
				<thead>
					<tr>
						<th scope="col">Player</th>
						<th scope="col">Team</th>
						<th scope="col">Stats / games</th>
						{#each fields as field (field.key)}<th scope="col">{field.label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each statistics.players as player (player.playerId)}
						<tr>
							<th scope="row">{player.displayName}</th>
							<td
								>{player.entryIds
									.map((id) => entries.find((entry) => entry.id === id)?.name ?? 'Unknown')
									.join(', ')}</td
							>
							<td>{player.gamesWithStatistics} / {player.gamesPlayed}</td>
							{#each fields as field (field.key)}
								{@const metric = player[field.key]}
								<td>
									{metric.value ?? 'Unavailable'}
									<span class="block text-xs text-surface-600-400">{metric.coverage} coverage</span>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="mt-4 text-sm text-surface-600-400">No player statistics are available yet.</p>
	{/if}
</section>
