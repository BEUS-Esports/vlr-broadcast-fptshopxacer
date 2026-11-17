<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { ArrowDown, ArrowUp, Trash2 } from '@lucide/svelte';
	import { ceremonyLabels } from '#lib/broadcast/in-game-controls.ts';
	import {
		SPONSOR_INTERVAL_MAX_MS,
		SPONSOR_INTERVAL_MIN_MS,
		sponsorBannerSlots,
		type SponsorBannerSlot
	} from '#lib/broadcast/sponsor.ts';
	import { toaster } from '#lib/toaster.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const accept = 'image/png,image/jpeg,image/webp';
	const titleCase = (text: string) => text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
	const slotLabels = Object.fromEntries(
		sponsorBannerSlots.map((slot) => [
			slot,
			slot === 'default'
				? 'Tournament Banner'
				: slot === 'tactical'
					? 'Tactical Timeout'
					: slot === 'technical'
						? 'Technical Pause'
						: titleCase(ceremonyLabels[slot])
		])
	) as Record<SponsorBannerSlot, string>;

	// A failed save keeps the page as it is; the error is shown below the heading.
	const saveSponsors: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') toaster.success({ title: 'Sponsors saved' });
		};
	};
</script>

<svelte:head><title>Sponsors | Broadcast controller</title></svelte:head>

<div class="admin-page">
	<header class="space-y-2">
		<h1 class="h1">Manage Sponsors</h1>
		<p>
			Sponsor art for the in-game match banners and a rotating logo loop in the scorebar. Changes
			reach live outputs immediately. Only templates built for sponsors display them.
		</p>
	</header>

	{#if form?.error}<p role="alert" class="card preset-filled-error-500 p-4">{form.error}</p>{/if}

	<section class="space-y-3" aria-label="Banners">
		<h2 class="h3">Banners</h2>
		<p class="text-sm text-surface-600-400">
			Banners without their own art use the Tournament Banner. PNG, JPEG, or WebP, up to 10 MB.
			Leave a file empty to keep its current image.
		</p>
		{#each sponsorBannerSlots as slot (slot)}
			{@const art = data.sponsor.banners[slot]}
			<form
				method="POST"
				action="?/banner"
				enctype="multipart/form-data"
				use:enhance={saveSponsors}
				class="admin-editor"
				aria-label={slotLabels[slot]}
			>
				<input type="hidden" name="revision" value={data.sponsor.revision} />
				<input type="hidden" name="slot" value={slot} />
				<h3 class="h4">{slotLabels[slot]}</h3>
				<div class="grid gap-4 md:grid-cols-2">
					{#each [{ name: 'background', label: 'Background', path: art.backgroundPath, clear: 'clearBackground' }, { name: 'logo', label: 'Logo', path: art.logoPath, clear: 'clearLogo' }] as item (item.name)}
						<div class="space-y-2">
							<label class="block text-sm font-medium">
								{item.label}
								<input class="mt-1 input block w-full" type="file" name={item.name} {accept} />
							</label>
							{#if item.path}
								<img
									class="h-24 w-full rounded-base bg-surface-950 object-contain p-2"
									src={item.path}
									alt={`${slotLabels[slot]} ${item.label.toLowerCase()}`}
								/>
								<label class="flex items-center gap-2 text-sm">
									<input class="checkbox" type="checkbox" name={item.clear} value="1" />
									Clear {item.label.toLowerCase()}
								</label>
							{:else if slot !== 'default'}
								<p class="text-sm text-surface-600-400">Uses Tournament Banner</p>
							{/if}
						</div>
					{/each}
				</div>
				<button class="btn preset-filled-primary-500" type="submit">Save banner</button>
			</form>
		{/each}
	</section>

	<section class="space-y-3" aria-label="Logo loop">
		<h2 class="h3">Scorebar logo loop</h2>
		{#if data.sponsor.loopLogos.length}
			<ol class="space-y-2">
				{#each data.sponsor.loopLogos as logo, index (`${index}:${logo}`)}
					<li>
						<form
							method="POST"
							use:enhance={saveSponsors}
							class="flex flex-wrap items-center gap-3 card border border-surface-200-800 p-3"
						>
							<input type="hidden" name="revision" value={data.sponsor.revision} />
							<input type="hidden" name="index" value={index} />
							<span class="w-6 text-sm text-surface-600-400">{index + 1}</span>
							<img
								class="h-14 w-28 rounded-base bg-surface-950 object-contain p-1"
								src={logo}
								alt={`Loop logo ${index + 1}`}
							/>
							<div class="ml-auto flex gap-2">
								<button
									class="btn-icon preset-tonal"
									type="submit"
									formaction="?/loopMove"
									name="direction"
									value="up"
									disabled={index === 0}
									aria-label={`Move logo ${index + 1} up`}
									><ArrowUp size={16} aria-hidden="true" /></button
								>
								<button
									class="btn-icon preset-tonal"
									type="submit"
									formaction="?/loopMove"
									name="direction"
									value="down"
									disabled={index === data.sponsor.loopLogos.length - 1}
									aria-label={`Move logo ${index + 1} down`}
									><ArrowDown size={16} aria-hidden="true" /></button
								>
								<button
									class="btn-icon preset-tonal-error"
									type="submit"
									formaction="?/loopRemove"
									aria-label={`Remove logo ${index + 1}`}
									><Trash2 size={16} aria-hidden="true" /></button
								>
							</div>
						</form>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="text-sm text-surface-600-400">No loop logos yet.</p>
		{/if}

		<form
			method="POST"
			action="?/loopAdd"
			enctype="multipart/form-data"
			use:enhance={saveSponsors}
			class="admin-editor"
			aria-label="Add loop logos"
		>
			<input type="hidden" name="revision" value={data.sponsor.revision} />
			<label class="block text-sm font-medium">
				Logo files
				<input class="mt-1 input block w-full" type="file" name="logos" {accept} multiple />
			</label>
			<button class="btn preset-filled-primary-500" type="submit">Add logos</button>
		</form>

		<form
			method="POST"
			action="?/interval"
			use:enhance={saveSponsors}
			class="admin-editor"
			aria-label="Loop interval"
		>
			<input type="hidden" name="revision" value={data.sponsor.revision} />
			<label class="block text-sm font-medium">
				Seconds per logo
				<input
					class="mt-1 input block w-full"
					type="number"
					name="seconds"
					min={SPONSOR_INTERVAL_MIN_MS / 1000}
					max={SPONSOR_INTERVAL_MAX_MS / 1000}
					step="0.5"
					required
					value={data.sponsor.loopIntervalMs / 1000}
				/>
			</label>
			<button class="btn preset-tonal-primary" type="submit">Save interval</button>
		</form>
	</section>
</div>
