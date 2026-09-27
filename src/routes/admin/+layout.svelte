<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { AppBar, Navigation } from '@skeletonlabs/skeleton-svelte';

	let { children } = $props();
	const dashboardActive = $derived(page.url.pathname === '/admin');
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-surface-50-950 text-surface-950-50">
	<a
		class="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-base focus:preset-filled-primary-500 focus:p-3"
		href="#main-content"
	>
		Skip to content
	</a>
	<AppBar class="shrink-0 border-b border-surface-200-800 preset-filled-surface-100-900">
		<AppBar.Toolbar class="grid-cols-[1fr_auto]">
			<AppBar.Lead>
				<a href="/admin" class="font-bold tracking-wide no-underline">FPT Shop × Acer</a>
			</AppBar.Lead>
			<AppBar.Trail>
				<span class="badge preset-tonal-surface">Broadcast controller</span>
			</AppBar.Trail>
		</AppBar.Toolbar>
	</AppBar>

	<div class="flex min-h-0 flex-1 flex-col md:flex-row">
		<Navigation
			layout="sidebar"
			aria-label="Management"
			class="h-auto w-full shrink-0 border-b border-surface-200-800 preset-filled-surface-50-950 md:h-full md:w-56 md:border-r md:border-b-0"
		>
			<Navigation.Content class="px-3 py-3 md:py-4">
				<Navigation.Group>
					<Navigation.Label
						class="mb-1 px-2 text-xs font-semibold tracking-wider text-surface-400-600 uppercase"
					>
						Main
					</Navigation.Label>
					<Navigation.TriggerAnchor
						href="/admin"
						aria-current={dashboardActive ? 'page' : undefined}
						class="flex items-center rounded-base px-3 py-2 text-sm font-medium transition-colors {dashboardActive
							? 'preset-filled-primary-500'
							: 'text-surface-700-300 hover:preset-tonal-primary'}"
					>
						Dashboard
					</Navigation.TriggerAnchor>
				</Navigation.Group>
			</Navigation.Content>
		</Navigation>
		<main id="main-content" class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
			{@render children()}
		</main>
	</div>
</div>

<style>
	main {
		background-image:
			radial-gradient(
				at 0% 25%,
				color-mix(in oklab, var(--color-primary-500) 10%, transparent) 0px,
				transparent 50%
			),
			radial-gradient(
				at 15% 6%,
				color-mix(in oklab, var(--color-tertiary-500) 5%, transparent) 0px,
				transparent 50%
			);
	}
</style>
