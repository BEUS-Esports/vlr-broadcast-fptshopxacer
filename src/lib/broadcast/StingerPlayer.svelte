<script lang="ts">
	import {
		STINGER_END_MARGIN_MS,
		STINGER_START_TIMEOUT_MS,
		type BroadcastStinger
	} from './stinger';

	let { stinger, z }: { stinger: BroadcastStinger | null; z: number } = $props();

	let video = $state<HTMLVideoElement>();
	let imageSrc = $state<string | null>(null);
	let active = $state(false);
	let running = false;
	let onImageLoad: ((loaded: boolean) => void) | null = null;

	// Keyed by path so a snapshot that repeats the same stinger does not refetch it.
	const imagePath = $derived(stinger?.kind === 'image' ? stinger.path : null);
	let imageBlob: Promise<Blob | null> = Promise.resolve(null);

	$effect(() => {
		const path = imagePath;
		if (!path) {
			imageBlob = Promise.resolve(null);
			return;
		}
		const controller = new AbortController();
		imageBlob = fetch(path, { signal: controller.signal })
			.then((response) => (response.ok ? response.blob() : null))
			.catch(() => null);
		return () => controller.abort();
	});

	/** Resolves with `fallback` if `promise` has not settled within `ms`. */
	function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => resolve(fallback), ms);
			const settle = (value: T) => {
				clearTimeout(timer);
				resolve(value);
			};
			promise.then(settle, () => settle(fallback));
		});
	}

	/**
	 * Plays the stinger, calling `onCut` once at `cutPointMs` after playback starts. Resolves `false`
	 * (without calling `onCut`) when there is nothing to play or playback does not start in time;
	 * otherwise `true` once the stinger has ended and `onCut` has settled, or the end cap passed.
	 */
	export async function run(onCut: () => Promise<void>): Promise<boolean> {
		const current = stinger;
		if (!current || running) return false;
		running = true;
		const lifetime = new AbortController();
		const timers: ReturnType<typeof setTimeout>[] = [];
		let objectUrl: string | null = null;

		function startVideo(element: HTMLVideoElement) {
			return new Promise<boolean>((resolve) => {
				const options = { once: true, signal: lifetime.signal };
				element.addEventListener('playing', () => resolve(true), options);
				element.addEventListener('error', () => resolve(false), options);
				element.currentTime = 0;
				element.play().catch(() => resolve(false));
			});
		}

		async function startImage() {
			const blob = await imageBlob;
			if (!blob || lifetime.signal.aborted) return false;
			objectUrl = URL.createObjectURL(blob);
			const loaded = new Promise<boolean>((resolve) => (onImageLoad = resolve));
			// A fresh object URL per run: the animation always restarts from its first frame.
			imageSrc = objectUrl;
			return loaded;
		}

		try {
			let started: boolean;
			// A video reports its own end; an image is over after durationMs from the moment it shows.
			let ended: Promise<void>;
			if (current.kind === 'video') {
				if (!video) return false;
				const element = video;
				ended = new Promise((resolve) =>
					element.addEventListener('ended', () => resolve(), { signal: lifetime.signal })
				);
				started = await within(startVideo(element), STINGER_START_TIMEOUT_MS, false);
			} else {
				started = await within(startImage(), STINGER_START_TIMEOUT_MS, false);
				ended = new Promise((resolve) => timers.push(setTimeout(resolve, current.durationMs)));
			}
			if (!started) return false;

			active = true;
			const cut = new Promise<void>((resolve) =>
				timers.push(
					setTimeout(async () => {
						try {
							await onCut();
						} catch (error) {
							console.warn('stinger cut failed', error);
						}
						resolve();
					}, current.cutPointMs)
				)
			);
			const cap = new Promise<void>((resolve) =>
				timers.push(setTimeout(resolve, current.durationMs + STINGER_END_MARGIN_MS))
			);
			await Promise.race([Promise.all([ended, cut]), cap]);
			return true;
		} finally {
			lifetime.abort();
			timers.forEach(clearTimeout);
			video?.pause();
			active = false;
			imageSrc = null;
			onImageLoad = null;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			running = false;
		}
	}
</script>

<div
	data-stinger
	style:z-index={z}
	style:visibility={active ? 'visible' : 'hidden'}
	aria-hidden="true"
>
	{#if stinger?.kind === 'video'}
		<video bind:this={video} src={stinger.path} muted playsinline preload="auto"></video>
	{:else if imageSrc}
		<img
			src={imageSrc}
			alt=""
			onload={() => onImageLoad?.(true)}
			onerror={() => onImageLoad?.(false)}
		/>
	{/if}
</div>

<style>
	[data-stinger] {
		position: absolute;
		inset: 0;
		width: 1920px;
		height: 1080px;
		pointer-events: none;
	}
	video,
	img {
		width: 100%;
		height: 100%;
		object-fit: fill;
	}
</style>
