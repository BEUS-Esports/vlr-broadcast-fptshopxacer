<script lang="ts">
	import type { BroadcastPlayer, BroadcastAgent, BroadcastMap } from '../types';
	import Identity from './Identity.svelte';
	let {
		resource
	}: {
		resource:
			| { kind: 'player'; value: BroadcastPlayer | null }
			| { kind: 'agent'; value: BroadcastAgent | null }
			| { kind: 'map'; value: BroadcastMap | null };
	} = $props();
	const assetPath = $derived(
		resource.kind === 'player'
			? resource.value?.portraitPath
			: resource.kind === 'agent'
				? (resource.value?.fullPortraitPath ??
					resource.value?.bustPortraitPath ??
					resource.value?.displayIconPath)
				: (resource.value?.splashPath ??
					resource.value?.listViewIconPath ??
					resource.value?.displayIconPath)
	);
</script>

<Identity
	name={resource.value?.displayName ?? null}
	assetPath={assetPath ?? null}
	unavailable={`${resource.kind === 'player' ? 'Player' : resource.kind === 'agent' ? 'Agent' : 'Map'} unavailable`}
	detail={resource.kind === 'agent' ? resource.value?.roleName : null}
/>
