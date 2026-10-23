<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let provider = $state(untrack(() => (data.status.provider === 'gstack' ? 'gstack' : 'spectra')));
	let region = $state(untrack(() => data.config.spectraRegion));
	let accessKey = $state('');
	let henrikdevApiKey = $state('');
</script>

<svelte:head><title>Settings | Broadcast controller</title></svelte:head>

<div class="admin-page">
	<header class="space-y-2">
		<h1 class="h1">Settings</h1>
		<p>
			Configure server-wide live and post-game data providers. Saved credentials are encrypted at
			rest and are never returned to the browser.
		</p>
	</header>

	<form
		method="POST"
		action="?/connect"
		class="space-y-5"
		use:enhance={() =>
			async ({ update }) => {
				accessKey = '';
				henrikdevApiKey = '';
				await update();
			}}
	>
		<input type="hidden" name="revision" value={data.config.revision} />

		<section class="admin-editor space-y-4" aria-label="Live provider selection">
			<h2 class="h3">Live provider</h2>
			<label class="label">
				<span>Connect after saving</span>
				<select class="select" name="provider" bind:value={provider}>
					<option value="spectra">ValoSpectra</option>
					<option value="gstack">GStack</option>
				</select>
			</label>
			<p class="text-sm text-surface-600-400">
				Save settings keeps the current live session unless live connection settings change. Save
				and connect restarts the session with the source selected here. Post-game-only changes do
				not reconnect the live source.
			</p>
		</section>

		<section class="admin-editor space-y-4" aria-label="ValoSpectra settings">
			<h2 class="h3">ValoSpectra</h2>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="label">
					<span>Live region</span>
					<select class="select" name="spectraRegion" aria-label="Region" bind:value={region}>
						<option value="eu">Europe · eu.valospectra.com</option>
						<option value="na">North America · na.valospectra.com</option>
						<option value="custom">Custom / self-hosted</option>
					</select>
				</label>
				<label class="label" hidden={region !== 'custom'}>
					<span>Custom live host</span>
					<input
						class="input"
						name="spectraHost"
						type="url"
						value={data.config.spectraHost}
						placeholder="http://localhost"
					/>
				</label>
				<label class="label">
					<span>Org / access key</span>
					<input
						class="input"
						name="accessKey"
						aria-label="Access key"
						type="password"
						autocomplete="new-password"
						bind:value={accessKey}
						placeholder={data.config.hasAccessKey
							? 'Encrypted key saved · leave blank to keep'
							: 'Leave blank for a custom server'}
					/>
				</label>
				<label class="label">
					<span>Group code</span>
					<input
						class="input"
						name="groupCode"
						value={data.config.spectraGroupCode}
						maxlength="128"
						autocomplete="off"
					/>
				</label>
			</div>
			<label class="flex items-center gap-2">
				<input class="checkbox" type="checkbox" name="clearKey" />
				Clear the saved Org / access key
			</label>

			<div class="space-y-3 border-t border-surface-300-700 pt-4">
				<h3 class="h4">Hosted post-game reports</h3>
				<div class="grid gap-4 md:grid-cols-3">
					<label class="label md:col-span-3">
						<span>Statistics service host</span>
						<input
							class="input"
							name="spectraPostGameBaseUrl"
							type="url"
							value={data.config.spectraPostGameBaseUrl}
							required
						/>
					</label>
					<label class="label md:col-span-3">
						<span>Default post-game group code</span>
						<input
							class="input"
							name="spectraPostGameGroupCode"
							value={data.config.spectraPostGameGroupCode}
							maxlength="128"
							placeholder="Blank uses the live group code"
							autocomplete="off"
						/>
					</label>
					<label class="label">
						<span>Poll interval (ms)</span>
						<input
							class="input"
							name="spectraPostGamePollIntervalMs"
							type="number"
							min="1"
							max="15000"
							value={data.config.spectraPostGamePollIntervalMs}
							required
						/>
					</label>
					<label class="label">
						<span>Maximum attempts</span>
						<input
							class="input"
							name="spectraPostGameMaxAttempts"
							type="number"
							min="1"
							max="4"
							value={data.config.spectraPostGameMaxAttempts}
							required
						/>
					</label>
				</div>
			</div>
			<p class="text-sm text-surface-600-400">
				Live match data uses port 5200 and supporter lookup uses port 5101. Hosted post-game reports
				use the statistics service host separately.
			</p>
		</section>

		<section class="admin-editor space-y-4" aria-label="GStack settings">
			<h2 class="h3">GStack</h2>
			<label class="label">
				<span>Server address</span>
				<input
					class="input"
					name="gstackUrl"
					type="url"
					value={data.config.gstackUrl}
					required={provider === 'gstack'}
				/>
			</label>
			<p class="text-sm text-surface-600-400">
				The server reads /livenow and the VHUD command stream. Keep the Expansion Client running for
				ability and enhanced health/shield data.
			</p>
		</section>

		<section class="admin-editor space-y-4" aria-label="HenrikDev settings">
			<h2 class="h3">HenrikDev post-game</h2>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="label md:col-span-2">
					<span>API key</span>
					<input
						class="input"
						name="henrikdevApiKey"
						type="password"
						autocomplete="new-password"
						bind:value={henrikdevApiKey}
						placeholder={data.config.hasHenrikdevApiKey
							? 'Encrypted API key saved · leave blank to keep'
							: 'HenrikDev API key'}
					/>
				</label>
				<label class="label">
					<span>Riot affinity / region</span>
					<select class="select" name="henrikdevAffinity" value={data.config.henrikdevAffinity}>
						<option value="ap">Asia Pacific · ap</option>
						<option value="br">Brazil · br</option>
						<option value="eu">Europe · eu</option>
						<option value="kr">Korea · kr</option>
						<option value="latam">Latin America · latam</option>
						<option value="na">North America · na</option>
					</select>
				</label>
				<label class="label">
					<span>Platform</span>
					<select class="select" name="henrikdevPlatform" value={data.config.henrikdevPlatform}>
						<option value="pc">PC</option>
						<option value="console">Console</option>
					</select>
				</label>
				<label class="label md:col-span-2">
					<span>API base URL</span>
					<input
						class="input"
						name="henrikdevBaseUrl"
						type="url"
						value={data.config.henrikdevBaseUrl}
						required
					/>
				</label>
				<label class="label">
					<span>Recent match candidates</span>
					<input
						class="input"
						name="henrikdevCandidateLimit"
						type="number"
						min="1"
						max="10"
						value={data.config.henrikdevCandidateLimit}
						required
					/>
				</label>
				<label class="label">
					<span>Provider request timeout (ms)</span>
					<input
						class="input"
						name="postGameRequestTimeoutMs"
						type="number"
						min="1"
						max="30000"
						value={data.config.postGameRequestTimeoutMs}
						required
					/>
				</label>
			</div>
			<label class="flex items-center gap-2">
				<input class="checkbox" type="checkbox" name="clearHenrikdevApiKey" />
				Clear the saved HenrikDev API key
			</label>
			<p class="text-sm text-surface-600-400">
				Affinity follows Riot's Valorant routing groups and is independent from ValoSpectra's live
				server region.
			</p>
		</section>

		{#if form?.error}<p role="alert">{form.error}</p>{/if}
		{#if form?.saved}<p role="status">Settings saved.</p>{/if}
		<div class="flex flex-wrap gap-3">
			<button class="btn preset-tonal-primary" type="submit">Save settings</button>
			<button class="btn preset-filled-primary-500" type="submit" name="connect" value="on"
				>Save and connect</button
			>
		</div>
	</form>

	<p>
		<a class="underline" href="/admin/graphics/in-game">Open In-Game control</a> · Current source: {data
			.status.provider ?? 'None'} · {data.status.health} · {data.status.mode === 'native'
			? 'Native HUD'
			: 'External HUD'}
	</p>
</div>
