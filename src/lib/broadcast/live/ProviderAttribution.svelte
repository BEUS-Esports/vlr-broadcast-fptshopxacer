<script lang="ts">
	import type { LiveSessionStatus } from '#lib/live/types.ts';
	let { status }: { status: Pick<LiveSessionStatus, 'provider' | 'attribution'> } = $props();
</script>

{#if status.provider === 'spectra' && status.attribution !== 'supporter'}
	<aside aria-label="Provider attribution" class="attribution">
		<img src="/providers/valospectra/icon.webp" alt="ValoSpectra" width="20" height="20" />
		<span>Powered by Spectra</span>
	</aside>
{/if}

<style>
	.attribution {
		position: absolute;
		top: 0;
		right: 30px;
		width: 218px;
		height: 27px;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border-radius: 0 0 8px 8px;
		background: #10151d;
		color: #f7f4eb;
		white-space: nowrap;
		text-transform: uppercase;
		font:
			700 14px/1.2 'Segoe UI',
			sans-serif;
	}
	img {
		object-fit: contain;
	}
</style>
