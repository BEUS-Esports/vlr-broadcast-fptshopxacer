<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ImportProblem, ImportResult } from '#lib/import/types.ts';

	let { result }: { result: ImportResult | null | undefined } = $props();
	const preview = $derived(result?.importPreview);
	const problems = $derived(preview?.problems ?? []);
	const errors = $derived(problems.filter((problem) => problem.level === 'error'));
	const warnings = $derived(problems.length - errors.length);
	// Set when the file input changes; cleared once a new preview has been rendered.
	let changed = $state(false);
	const canConfirm = $derived(!!preview && !errors.length && !changed);
	const open = $derived(!!(result?.importPreview || result?.imported || result?.importError));

	const isSheet = (problem: ImportProblem, table: string) =>
		problem.file.split('/').pop()!.toLowerCase().startsWith(table);
	const forRow = (table: string, row: number) =>
		problems.filter((problem) => problem.row === row && isSheet(problem, table));
	const rowId = (table: string, row: number) =>
		`import-${forRow(table, row)[0]?.file ?? table}-${row}`;
	const where = (problem: ImportProblem) =>
		`${problem.file}${problem.row === null ? '' : ` row ${problem.row}`}${problem.field ? ` (${problem.field})` : ''}`;
</script>

{#snippet issues(list: ImportProblem[], linked: boolean)}
	<ul class="list-inside list-disc text-sm">
		{#each list as problem, index (index)}
			<li class={problem.level === 'error' ? 'text-error-600-400' : 'text-warning-600-400'}>
				{#if !linked}{problem.message}{:else if problem.row !== null}<a
						class="anchor"
						href="#import-{problem.file}-{problem.row}">{where(problem)}: {problem.message}</a
					>{:else}{where(problem)}: {problem.message}{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<details class="card preset-tonal-surface p-4" {open}>
	<summary class="cursor-pointer font-semibold">Import bundle</summary>
	<div class="mt-4 space-y-4">
		<form
			class="space-y-3"
			method="POST"
			enctype="multipart/form-data"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					changed = false;
				}}
		>
			<input type="hidden" name="hash" value={preview?.hash ?? ''} />
			<label class="block text-sm font-medium">
				Bundle (.zip)
				<input
					class="mt-1 input w-full"
					type="file"
					name="bundle"
					accept=".zip"
					required
					onchange={() => (changed = true)}
				/>
			</label>
			<div class="flex flex-wrap gap-2">
				<button class="btn preset-tonal-primary" type="submit" formaction="?/importPreview"
					>Preview import</button
				>
				<button
					class="btn preset-filled-primary-500"
					type="submit"
					formaction="?/importCommit"
					disabled={!canConfirm}>Confirm import</button
				>
			</div>
		</form>
		{#if result?.importError}
			<p role="alert" class="card preset-filled-error-500 p-4">{result.importError}</p>
		{/if}
		{#if result?.imported}
			<p role="status" class="card preset-filled-success-500 p-4">
				Imported {result.imported.teams} teams and {result.imported.players} players.
			</p>
		{/if}
		{#if preview}
			<p class="font-semibold">
				{preview.teams.length} teams, {preview.players.length} players, {preview.imageCount} images,
				{errors.length} errors, {warnings} warnings
			</p>
			{#if problems.length}{@render issues(problems, true)}{/if}
			{#if preview.teams.length}
				<div class="table-wrap">
					<table class="table">
						<caption class="text-left font-semibold">Teams in bundle</caption>
						<thead
							><tr
								><th>Row</th><th>Team name</th><th>Tag</th><th>Normal logo</th><th>White logo</th
								><th>Black logo</th><th>Problems</th></tr
							></thead
						>
						<tbody>
							{#each preview.teams as team (team.row)}
								<tr id={rowId('teams', team.row)}>
									<td>{team.row}</td><td>{team.name}</td><td>{team.tag}</td>
									<td>{team.logos.normal ?? '—'}</td><td>{team.logos.white ?? '—'}</td><td
										>{team.logos.black ?? '—'}</td
									>
									<td>{@render issues(forRow('teams', team.row), false)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			{#if preview.players.length}
				<div class="table-wrap">
					<table class="table">
						<caption class="text-left font-semibold">Players in bundle</caption>
						<thead
							><tr
								><th>Row</th><th>Display name</th><th>Full name</th><th>Riot ID</th><th>Portrait</th
								><th>Problems</th></tr
							></thead
						>
						<tbody>
							{#each preview.players as player (player.row)}
								<tr id={rowId('players', player.row)}>
									<td>{player.row}</td><td>{player.displayName}</td><td>{player.fullName ?? '—'}</td
									><td>{player.riotId}</td><td>{player.portrait ?? '—'}</td>
									<td>{@render issues(forRow('players', player.row), false)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	</div>
</details>
