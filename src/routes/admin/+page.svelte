<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, Users, UserRound, Map } from '@lucide/svelte';
	const areas = [
		{
			title: 'Teams',
			detail: 'Team identities, tags, and broadcast logos.',
			href: resolve('/admin/teams'),
			icon: Users
		},
		{
			title: 'Players',
			detail: 'Player names, Riot IDs, and portraits.',
			href: resolve('/admin/players'),
			icon: UserRound
		},
		{
			title: 'Game resources',
			detail: 'Maps, playable agents, and game artwork.',
			href: resolve('/admin/resources'),
			icon: Map
		}
	];
	const setupSteps = [
		{
			title: 'Build your catalog',
			detail: 'Add the teams, players, and resources you need.',
			available: true
		},
		{
			title: 'Prepare a tournament',
			detail: 'Choose participants, rosters, and a map pool.',
			available: false
		},
		{
			title: 'Set up matches',
			detail: 'Prepare series, game lineups, and results.',
			available: false
		},
		{
			title: 'Operate graphics',
			detail: 'Select the live game and control OBS outputs.',
			available: false
		}
	];
</script>

<svelte:head><title>Dashboard | FPT Shop × Acer</title></svelte:head>

<div class="admin-page">
	<header>
		<p class="text-sm font-semibold text-primary-600-400">Production control</p>
		<h1 class="h1">Dashboard</h1>
		<p class="mt-2 max-w-3xl text-surface-600-400">
			Start with your event catalog. Keep teams, players, and game resources ready for the
			broadcast.
		</p>
	</header>

	<section class="space-y-4" aria-labelledby="catalog-heading">
		<h2 id="catalog-heading" class="h3">Tournament catalog</h2>
		<div class="grid gap-4 lg:grid-cols-3">
			{#each areas as area (area.href)}
				<a
					href={area.href}
					class="card border border-surface-200-800 bg-surface-50-950 p-5 no-underline transition-colors hover:border-primary-400-600 hover:bg-surface-100-900"
				>
					<span
						class="mb-5 flex size-12 items-center justify-center rounded-base preset-tonal-primary"
						><area.icon size={24} aria-hidden="true" /></span
					>
					<h3 class="h3">{area.title}</h3>
					<p class="mt-2 text-sm text-surface-600-400">{area.detail}</p>
					<span class="mt-5 flex items-center gap-2 text-sm font-semibold text-primary-600-400"
						>Manage {area.title.toLowerCase()} <ArrowRight size={16} aria-hidden="true" /></span
					>
				</a>
			{/each}
		</div>
	</section>

	<section
		class="card border border-surface-200-800 bg-surface-50-950 p-5 sm:p-6"
		aria-labelledby="flow-heading"
	>
		<h2 id="flow-heading" class="h3">Production flow</h2>
		<ol class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#each setupSteps as step, index (step.title)}
				<li class="rounded-container bg-surface-100-900 p-4">
					<div class="mb-4 flex items-center justify-between gap-2">
						<span
							class="flex size-8 items-center justify-center rounded-full text-sm font-bold {step.available
								? 'preset-filled-primary-500'
								: 'preset-tonal-surface'}">{index + 1}</span
						>
						<span class="badge {step.available ? 'preset-tonal-success' : 'preset-tonal-surface'}"
							>{step.available ? 'Available' : 'Coming soon'}</span
						>
					</div>
					<h3 class="font-semibold">{step.title}</h3>
					<p class="mt-2 text-sm text-surface-600-400">{step.detail}</p>
				</li>
			{/each}
		</ol>
	</section>
</div>
