<script lang="ts">
	const areas = [
		{ title: 'Teams and players', detail: 'Reusable profiles and tournament rosters.' },
		{ title: 'Tournaments', detail: 'Participants, map pools, and match preparation.' },
		{ title: 'Matches and games', detail: 'Series vetoes, lineups, scores, and results.' },
		{ title: 'Graphics controls', detail: 'One shared live selection for OBS outputs.' }
	];
	const setupSteps = [
		'Create teams and players',
		'Prepare a tournament',
		'Add matches and games',
		'Operate graphics'
	];
</script>

<svelte:head>
	<title>Dashboard | FPT Shop × Acer</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-8 pb-16">
	<header>
		<p class="text-sm font-semibold text-primary-600-400">Production control</p>
		<h1 class="h1">Dashboard</h1>
		<p class="mt-2 max-w-3xl text-surface-600-400">
			Prepare the event, manage each game, and control the broadcast from one workspace.
		</p>
	</header>

	<section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Management areas">
		{#each areas as area (area.title)}
			<article class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5">
				<h2 class="h3">{area.title}</h2>
				<p class="mt-3 text-sm text-surface-600-400">{area.detail}</p>
			</article>
		{/each}
	</section>

	<section class="card preset-outlined-surface-200-800 bg-surface-50-950 p-6">
		<h2 class="h3">Production flow</h2>
		<ol class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{#each setupSteps as step, index (step)}
				<li class="flex items-center gap-3 rounded-container bg-surface-100-900 p-4">
					<span
						class="flex size-7 shrink-0 items-center justify-center rounded-full preset-filled-primary-500 text-sm font-bold"
					>
						{index + 1}
					</span>
					<span class="font-medium">{step}</span>
				</li>
			{/each}
		</ol>
	</section>
</div>
