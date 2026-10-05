<script lang="ts">
	import './layout.css';
	import beusLogo from '#lib/assets/logos/0_bg.png';
	import { page } from '$app/state';
	import { AppBar, Navigation, Toast } from '@skeletonlabs/skeleton-svelte';
	import {
		LayoutDashboard,
		Users,
		UserRound,
		Map,
		Trophy,
		Monitor,
		Settings2
	} from '@lucide/svelte';
	import { graphicIds, graphicLabels } from '#lib/broadcast/controls.ts';
	import { toaster } from '#lib/toaster.ts';
	import { onMount, setContext } from 'svelte';
	import { createBroadcastClient } from '#lib/broadcast/client.ts';

	let { children } = $props();
	const dashboardActive = $derived(page.url.pathname === '/admin');
	const teamsActive = $derived(page.url.pathname === '/admin/teams');
	const playersActive = $derived(page.url.pathname === '/admin/players');
	const resourcesActive = $derived(page.url.pathname === '/admin/resources');
	const tournamentsActive = $derived(page.url.pathname.startsWith('/admin/tournaments/'));
	const tournamentsListActive = $derived(page.url.pathname === '/admin/tournaments');

	const broadcastClient = setContext('broadcast-client', createBroadcastClient());

	let serverTime = $state<number | null>(null);

	onMount(() => {
		broadcastClient.connect();
		const update = () => {
			serverTime = broadcastClient.getState().clock?.now() ?? null;
		};
		update();
		const timer = setInterval(update, 500);
		return () => {
			clearInterval(timer);
			broadcastClient.disconnect();
		};
	});
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
			<AppBar.Lead class="flex items-center gap-4">
				<img src={beusLogo} alt="FPT Shop x Acer" class="h-8 w-8" />
				<a href="/admin" class="flex flex-col">
					<span class="font-bold tracking-wide no-underline">FPT Shop x Acer</span>
					<span class="text-sm">Broadcast Controller - Valorant</span>
				</a>
			</AppBar.Lead>
			<AppBar.Trail>
				{#if serverTime !== null}
					<div class="text-sm font-medium">
						<span>Server Time:</span>
						<time aria-label="Server Time" datetime={new Date(serverTime).toISOString()}>
							{new Date(serverTime).toLocaleString('vi-VN', {
								timeZone: 'Asia/Ho_Chi_Minh',
								weekday: 'long',
								day: 'numeric',
								month: 'long',
								year: 'numeric',
								hour: '2-digit',
								minute: '2-digit',
								second: '2-digit',
								timeZoneName: 'short'
							})}
						</time>
					</div>
				{/if}
			</AppBar.Trail>
		</AppBar.Toolbar>
	</AppBar>

	<div class="flex min-h-0 flex-1 flex-col md:flex-row">
		<Navigation
			layout="sidebar"
			role="navigation"
			aria-label="Management"
			class="h-auto w-full shrink-0 border-b border-surface-200-800 preset-filled-surface-50-950 p-0 md:h-full md:w-56 md:overflow-y-auto md:border-r md:border-b-0"
		>
			<Navigation.Content
				class="flex w-full flex-row flex-wrap gap-1 px-3 py-2 md:flex-col md:gap-4 md:py-4"
			>
				<Navigation.Group class="contents md:flex md:w-full md:flex-col">
					<Navigation.Label
						class="mb-1 hidden px-2 text-xs font-semibold tracking-wider text-surface-600-400 uppercase md:block"
					>
						Main
					</Navigation.Label>
					<Navigation.TriggerAnchor
						href="/admin"
						aria-current={dashboardActive ? 'page' : undefined}
						class="flex w-auto items-center gap-2 rounded-base px-3 py-2 text-sm font-medium transition-colors md:w-full {dashboardActive
							? 'preset-filled-primary-500'
							: 'text-surface-700-300 hover:preset-tonal-primary'}"
					>
						<LayoutDashboard size={18} aria-hidden="true" /> Dashboard
					</Navigation.TriggerAnchor>
					<Navigation.TriggerAnchor
						href="/admin/settings"
						aria-current={page.url.pathname === '/admin/settings' ? 'page' : undefined}
						class="flex items-center gap-2 rounded-base px-3 py-2 text-sm font-medium {page.url
							.pathname === '/admin/settings'
							? 'preset-filled-primary-500'
							: 'hover:preset-tonal-primary'}"
						><Settings2 size={18} aria-hidden="true" /> Settings</Navigation.TriggerAnchor
					>
				</Navigation.Group>
				{#each [{ label: 'Preparation', items: [{ href: '/admin/teams', label: 'Teams', active: teamsActive, icon: Users }, { href: '/admin/players', label: 'Players', active: playersActive, icon: UserRound }, { href: '/admin/resources', label: 'Game Resources', active: resourcesActive, icon: Map }, { href: '/admin/tournaments', label: 'Tournaments', active: tournamentsActive || tournamentsListActive, icon: Trophy }] }, { label: 'GFX Control', items: [{ href: '/admin/graphics', label: 'Global Settings', active: page.url.pathname === '/admin/graphics', icon: Settings2 }, ...graphicIds.map( (id) => ({ href: `/admin/graphics/${id}`, label: graphicLabels[id], active: page.url.pathname === `/admin/graphics/${id}`, icon: Monitor }) )] }] as group (group.label)}
					<Navigation.Group class="contents md:flex md:w-full md:flex-col md:gap-1">
						<Navigation.Label
							class="mb-1 hidden px-2 text-xs font-semibold tracking-wider text-surface-600-400 uppercase md:block"
							>{group.label}</Navigation.Label
						>
						{#each group.items as item (item.href)}
							<Navigation.TriggerAnchor
								href={item.href}
								aria-current={item.active ? 'page' : undefined}
								class="flex w-auto items-center gap-2 rounded-base px-3 py-2 text-sm font-medium transition-colors md:w-full {item.active
									? 'preset-filled-primary-500'
									: 'text-surface-700-300 hover:preset-tonal-primary'}"
								><item.icon size={18} aria-hidden="true" />{item.label}</Navigation.TriggerAnchor
							>
						{/each}
					</Navigation.Group>
				{/each}
			</Navigation.Content>
		</Navigation>
		<main id="main-content" class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
			{@render children()}
		</main>
	</div>
	<Toast.Group {toaster}>
		{#snippet children(toast)}
			<Toast {toast}>
				<Toast.Message>
					<Toast.Title>{toast.title}</Toast.Title>
					<Toast.Description>{toast.description}</Toast.Description>
				</Toast.Message>
				<Toast.CloseTrigger />
			</Toast>
		{/snippet}
	</Toast.Group>
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
