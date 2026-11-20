<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Trash2 } from '@lucide/svelte';
	import { STINGER_DURATION_MAX_MS } from '#lib/broadcast/stinger.ts';
	import { toaster } from '#lib/toaster.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const accept = 'video/webm,image/webp,image/avif,.webm,.webp,.avif';
	const maxBytes = 1024 ** 3;

	let fileInput = $state<HTMLInputElement>();
	let name = $state('');
	let file = $state<File | null>(null);
	let durationMs = $state('');
	let cutPointMs = $state('');
	let cutPointEdited = false;
	let progress = $state<number | null>(null);
	let uploadError = $state<string | null>(null);

	const uploading = $derived(progress !== null);

	// WebM files report their own length; WebP and AVIF need it typed in.
	function readDuration(selected: File) {
		const url = URL.createObjectURL(selected);
		const video = document.createElement('video');
		const done = () => {
			video.removeAttribute('src');
			video.load();
			URL.revokeObjectURL(url);
		};
		video.preload = 'metadata';
		video.onloadedmetadata = () => {
			if (file === selected && Number.isFinite(video.duration) && video.duration > 0) {
				const ms = Math.min(Math.round(video.duration * 1000), STINGER_DURATION_MAX_MS);
				durationMs = String(ms);
				if (!cutPointEdited) cutPointMs = String(Math.round(ms / 2));
			}
			done();
		};
		video.onerror = done;
		video.src = url;
	}

	function chooseFile(event: Event & { currentTarget: HTMLInputElement }) {
		file = event.currentTarget.files?.[0] ?? null;
		uploadError = null;
		if (!file) return;
		if (!name.trim()) name = file.name.replace(/\.[^.]+$/, '');
		if (file.type === 'video/webm' || file.name.toLowerCase().endsWith('.webm')) readDuration(file);
	}

	function resetUpload() {
		name = '';
		file = null;
		durationMs = '';
		cutPointMs = '';
		cutPointEdited = false;
		if (fileInput) fileInput.value = '';
	}

	function upload(event: SubmitEvent) {
		event.preventDefault();
		if (!file || uploading) return;
		if (file.size > maxBytes) {
			uploadError = 'Stingers must be 1 GB or smaller.';
			return;
		}
		uploadError = null;
		progress = 0;
		const query = new URLSearchParams({ name, durationMs, cutPointMs });
		const request = new XMLHttpRequest();
		request.open('POST', `${resolve('/admin/stingers/upload')}?${query}`);
		request.setRequestHeader('content-type', 'application/octet-stream');
		request.upload.onprogress = (progressEvent) => {
			if (progressEvent.lengthComputable)
				progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
		};
		request.onload = async () => {
			progress = null;
			if (request.status === 201) {
				resetUpload();
				toaster.success({ title: 'Stinger uploaded' });
				await invalidateAll();
				return;
			}
			try {
				uploadError = JSON.parse(request.responseText).error;
			} catch {
				uploadError = null;
			}
			uploadError ??= 'The upload failed. Try again.';
		};
		request.onerror = () => {
			progress = null;
			uploadError = 'The upload failed. Check the connection and that the file is 1 GB or smaller.';
		};
		request.send(file);
	}

	const save: SubmitFunction = ({ action, cancel }) => {
		const removing = action.searchParams.has('/remove');
		if (removing && !confirm('Delete this stinger? The file stays on disk for 14 days.')) {
			cancel();
			return;
		}
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success')
				toaster.success({ title: removing ? 'Stinger deleted' : 'Stinger saved' });
		};
	};

	// Keep the chosen radio: a reset would snap it back to the previous default.
	const activate: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') toaster.success({ title: 'Active stinger saved' });
		};
	};
</script>

<svelte:head><title>Stingers | Broadcast controller</title></svelte:head>

<div class="admin-page">
	<header class="space-y-2">
		<h1 class="h1">Manage Stingers</h1>
		<p>
			A stinger plays over the Composite output (<code>/gfx/live/composite</code>) when the
			full-screen layer swaps graphics. The graphic changes at the cut point, while the stinger
			covers the screen. WebM (VP9 with alpha), WebP or AVIF, up to 1 GB. Standalone outputs never
			play stingers.
		</p>
	</header>

	{#if uploadError ?? form?.error}
		<p role="alert" class="card preset-filled-error-500 p-4">{uploadError ?? form?.error}</p>
	{/if}

	<section class="space-y-3" aria-label="Upload">
		<h2 class="h3">Upload</h2>
		<form onsubmit={upload} class="admin-editor" aria-label="Upload stinger">
			<div class="grid gap-4 md:grid-cols-2">
				<label class="block text-sm font-medium">
					Name
					<input
						class="mt-1 input block w-full"
						type="text"
						bind:value={name}
						maxlength="80"
						required
					/>
				</label>
				<label class="block text-sm font-medium">
					Stinger file
					<input
						class="mt-1 input block w-full"
						type="file"
						name="file"
						{accept}
						required
						bind:this={fileInput}
						onchange={chooseFile}
					/>
				</label>
				<label class="block text-sm font-medium">
					Duration (ms)
					<input
						class="mt-1 input block w-full"
						type="number"
						min="1"
						max={STINGER_DURATION_MAX_MS}
						step="1"
						required
						bind:value={durationMs}
					/>
				</label>
				<label class="block text-sm font-medium">
					Cut point (ms)
					<input
						class="mt-1 input block w-full"
						type="number"
						min="0"
						max={durationMs || STINGER_DURATION_MAX_MS}
						step="1"
						required
						bind:value={cutPointMs}
						oninput={() => (cutPointEdited = true)}
					/>
				</label>
			</div>
			<p class="text-sm text-surface-600-400">
				WebM durations are read from the file. Enter the length of a WebP or AVIF animation
				yourself.
			</p>
			{#if uploading}
				<div class="flex items-center gap-3">
					<progress class="w-full" max="100" value={progress} aria-label="Upload progress"
					></progress>
					<span class="w-12 text-right text-sm tabular-nums">{progress}%</span>
				</div>
			{/if}
			<button class="btn preset-filled-primary-500" type="submit" disabled={uploading || !file}>
				Upload
			</button>
		</form>
	</section>

	<section class="space-y-3" aria-label="Library">
		<h2 class="h3">Stingers</h2>
		{#if data.stingers.length}
			<form
				method="POST"
				action="?/activate"
				use:enhance={activate}
				class="admin-editor"
				aria-label="Active stinger"
			>
				<input type="hidden" name="revision" value={data.settings.revision} />
				<fieldset class="space-y-2">
					<legend class="h4">Active stinger</legend>
					<label class="flex items-center gap-2 text-sm">
						<input
							class="radio"
							type="radio"
							name="id"
							value=""
							checked={data.settings.activeStingerId === null}
							onchange={(event) => event.currentTarget.form?.requestSubmit()}
						/>
						None
					</label>
					{#each data.stingers as stinger (stinger.id)}
						<label class="flex items-center gap-2 text-sm">
							<input
								class="radio"
								type="radio"
								name="id"
								value={stinger.id}
								checked={data.settings.activeStingerId === stinger.id}
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							/>
							{stinger.name}
						</label>
					{/each}
				</fieldset>
			</form>

			{#each data.stingers as stinger (stinger.id)}
				<form
					method="POST"
					action="?/update"
					use:enhance={save}
					class="admin-editor"
					aria-label={`Stinger ${stinger.name}`}
				>
					<input type="hidden" name="id" value={stinger.id} />
					<input type="hidden" name="revision" value={stinger.revision} />
					<div class="flex flex-wrap items-baseline gap-3">
						<h3 class="h4">{stinger.name}</h3>
						<span class="text-sm text-surface-600-400">
							{stinger.kind === 'video' ? 'Video' : 'Animated image'} ·
							<a
								class="anchor"
								href={resolve('/assets/[name]', { name: stinger.path.slice('/assets/'.length) })}
								target="_blank"
								rel="noreferrer">File</a
							>
						</span>
					</div>
					<div class="grid gap-4 md:grid-cols-3">
						<label class="block text-sm font-medium">
							Name
							<input
								class="mt-1 input block w-full"
								type="text"
								name="name"
								maxlength="80"
								required
								value={stinger.name}
							/>
						</label>
						<label class="block text-sm font-medium">
							Duration (ms)
							<input
								class="mt-1 input block w-full"
								type="number"
								name="durationMs"
								min="1"
								max={STINGER_DURATION_MAX_MS}
								step="1"
								required
								value={stinger.durationMs}
							/>
						</label>
						<label class="block text-sm font-medium">
							Cut point (ms)
							<input
								class="mt-1 input block w-full"
								type="number"
								name="cutPointMs"
								min="0"
								step="1"
								required
								value={stinger.cutPointMs}
							/>
						</label>
					</div>
					<div class="flex gap-2">
						<button class="btn preset-filled-primary-500" type="submit">Save</button>
						<button
							class="btn preset-tonal-error"
							type="submit"
							formaction="?/remove"
							formnovalidate
						>
							<Trash2 size={16} aria-hidden="true" /> Delete
						</button>
					</div>
				</form>
			{/each}
		{:else}
			<p class="text-sm text-surface-600-400">No stingers yet.</p>
		{/if}
	</section>
</div>
