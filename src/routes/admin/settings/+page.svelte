<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let provider = $state('spectra');
	let region = $state(untrack(() => data.config.spectraRegion));
	let accessKey = $state('');
</script>

<svelte:head><title>Settings | Broadcast controller</title></svelte:head>
<div class="admin-page">
	<header class="space-y-2">
		<h1 class="h1">Settings</h1>
		<p>
			Configure the live data source on this server. All controllers and outputs share one
			connection.
		</p>
	</header>
	<form
		method="POST"
		action="?/connect"
		class="admin-editor space-y-4"
		use:enhance={() =>
			async ({ update }) => {
				accessKey = '';
				await update();
			}}
	>
		<input type="hidden" name="revision" value={data.config.revision} />
		<label class="label"
			><span>Provider</span><select class="select" name="provider" bind:value={provider}
				><option value="spectra">ValoSpectra</option><option value="gstack">GStack</option></select
			></label
		>
		<fieldset class="space-y-3" hidden={provider !== 'spectra'}>
			<legend class="h3">ValoSpectra</legend>
			<label class="label"
				><span>Region</span><select class="select" name="spectraRegion" bind:value={region}
					><option value="eu">Europe · eu.valospectra.com</option><option value="na"
						>North America · na.valospectra.com</option
					><option value="custom">Custom / self-hosted</option></select
				></label
			>
			<label class="label" hidden={region !== 'custom'}
				><span>Custom host</span><input
					class="input"
					name="spectraHost"
					type="url"
					value={data.config.spectraHost}
					placeholder="http://localhost"
				/></label
			>
			<label class="label"
				><span>Access key</span><input
					class="input"
					name="accessKey"
					type="password"
					autocomplete="off"
					bind:value={accessKey}
					placeholder={data.config.hasAccessKey
						? 'Key saved · leave blank to keep'
						: 'Leave blank for a custom server'}
				/></label
			>
			<label class="flex items-center gap-2"
				><input class="checkbox" type="checkbox" name="clearKey" />Clear the saved access key</label
			>
			<label class="label"
				><span>Group code</span><input
					class="input"
					name="groupCode"
					value={data.config.groupCode}
					maxlength="128"
					required={provider === 'spectra'}
					autocomplete="off"
				/></label
			>
			<p class="text-sm">
				Match data uses port 5200; supporter lookup uses port 5101. The access key is saved only on
				the server and is never added to output URLs.
			</p>
		</fieldset>
		<fieldset class="space-y-3" hidden={provider !== 'gstack'}>
			<legend class="h3">GStack</legend>
			<label class="label"
				><span>Server address</span><input
					class="input"
					name="gstackUrl"
					type="url"
					value={data.config.gstackUrl}
					required={provider === 'gstack'}
				/></label
			>
			<p class="text-sm">
				The server reads /livenow and the VHUD command stream. Keep the Expansion Client running for
				ability and enhanced health/shield data.
			</p>
		</fieldset>
		{#if form?.error}<p role="alert">{form.error}</p>{/if}
		{#if form?.saved}<p role="status">
				Settings saved. Connection is being checked. Review the live status in In-Game control.
			</p>{/if}
		<button class="btn preset-filled-primary-500">Save and connect</button>
	</form>
	<p>
		<a class="underline" href="/admin/graphics/in-game">Open In-Game control</a> · Current source: {data
			.status.provider ?? 'None'} · {data.status.health} · {data.status.mode === 'native'
			? 'Native HUD'
			: 'External HUD'}
	</p>
</div>
