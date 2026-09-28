<script lang="ts" generics="T extends { id: string }">
	import { invalidateAll } from '$app/navigation';
	import { ChevronLeft, ChevronRight, RefreshCw, Search } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		rows,
		label,
		searchText,
		columns,
		row,
		actions,
		editor
	}: {
		rows: T[];
		label: string;
		searchText: (row: T) => string;
		columns: string[];
		row: Snippet<[T]>;
		actions: Snippet;
		editor?: Snippet;
	} = $props();
	let search = $state('');
	let pageSize = $state('10');
	let requestedPage = $state(1);
	let refreshing = $state(false);
	let refreshError = $state('');
	const query = $derived(search.trim().toLowerCase());
	const filtered = $derived(rows.filter((item) => searchText(item).toLowerCase().includes(query)));
	const pageCount = $derived(
		pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / Number(pageSize)))
	);
	const currentPage = $derived(Math.min(requestedPage, pageCount));
	const firstIndex = $derived(pageSize === 'all' ? 0 : (currentPage - 1) * Number(pageSize));
	const visible = $derived(
		pageSize === 'all' ? filtered : filtered.slice(firstIndex, firstIndex + Number(pageSize))
	);

	async function refresh() {
		refreshing = true;
		refreshError = '';
		try {
			await invalidateAll();
		} catch {
			refreshError = 'Could not refresh the list. Please try again.';
		} finally {
			refreshing = false;
		}
	}
</script>

{#snippet pagination(position: string)}
	<nav aria-label="{label} pagination {position}" class="flex flex-wrap items-center gap-2">
		<button
			class="btn preset-tonal-surface btn-sm"
			type="button"
			disabled={currentPage <= 1}
			onclick={() => (requestedPage = currentPage - 1)}
		>
			<ChevronLeft size={16} aria-hidden="true" /> Previous
		</button>
		<span class="text-sm text-surface-600-400">Page {currentPage} of {pageCount}</span>
		<button
			class="btn preset-tonal-surface btn-sm"
			type="button"
			disabled={currentPage >= pageCount}
			onclick={() => (requestedPage = currentPage + 1)}
		>
			Next <ChevronRight size={16} aria-hidden="true" />
		</button>
	</nav>
{/snippet}

<div class="min-w-0 space-y-4">
	<div class="flex flex-wrap items-center gap-3">
		<label class="relative min-w-0 basis-full sm:min-w-48 sm:flex-1 sm:basis-auto">
			<span class="sr-only">Search {label.toLowerCase()}</span>
			<Search
				size={18}
				class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-surface-600-400"
				aria-hidden="true"
			/>
			<input
				class="input w-full pl-10"
				type="search"
				placeholder="Search {label.toLowerCase()}"
				bind:value={search}
				oninput={() => (requestedPage = 1)}
			/>
		</label>
		{@render actions()}
		<button
			class="btn preset-tonal-surface"
			type="button"
			onclick={refresh}
			disabled={refreshing}
			aria-label="Refresh {label.toLowerCase()}"
		>
			<RefreshCw size={16} aria-hidden="true" />
			{refreshing ? 'Refreshing…' : 'Refresh'}
		</button>
	</div>
	{#if refreshError}<p class="rounded-base preset-tonal-error p-3 text-sm" role="alert">
			{refreshError}
		</p>{/if}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
			<p class="text-sm text-surface-600-400" aria-live="polite">
				Showing {filtered.length ? firstIndex + 1 : 0}–{firstIndex + visible.length} of {filtered.length}
				{label.toLowerCase()}
			</p>
			<label class="flex items-center gap-2 text-sm">
				<span>Rows per page</span>
				<select class="select w-20" bind:value={pageSize} onchange={() => (requestedPage = 1)}>
					<option value="10">10</option><option value="20">20</option><option value="50">50</option
					><option value="all">All</option>
				</select>
			</label>
		</div>
		{@render pagination('top')}
	</div>
	{@render editor?.()}
	<!-- Keyboard users need to scroll wide tables. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="table-wrap rounded-container border border-surface-200-800 bg-surface-50-950"
		role="region"
		aria-label="{label} table"
		tabindex="0"
	>
		<table class="table table-auto table-zebra [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3">
			<caption class="sr-only">{label}</caption>
			<thead class="bg-surface-100-900"
				><tr
					>{#each columns as column (column)}<th scope="col" class="whitespace-nowrap">{column}</th
						>{/each}</tr
				></thead
			>
			<tbody>
				{#each visible as item (item.id)}
					<tr class="hover:preset-tonal-primary">{@render row(item)}</tr>
				{:else}
					<tr
						><td colspan={columns.length} class="h-40 text-center text-surface-600-400">
							{#if rows.length === 0}No {label.toLowerCase()} yet. Add one to get started.
							{:else}No {label.toLowerCase()} match your search.
								<button
									class="ml-2 btn preset-tonal-surface btn-sm"
									type="button"
									onclick={() => {
										search = '';
										requestedPage = 1;
									}}>Clear search</button
								>
							{/if}
						</td></tr
					>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="flex justify-end">{@render pagination('bottom')}</div>
</div>
