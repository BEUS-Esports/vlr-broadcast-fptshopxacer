import { createSubscriber } from 'svelte/reactivity';
import type { LiveResources } from './selectors';
async function fetchLiveResources(signal: AbortSignal): Promise<LiveResources | null> {
	try {
		const response = await fetch('/api/live-game/resources', { signal, cache: 'no-store' });
		if (!response.ok) return null;
		const resources = await response.json();
		return Array.isArray(resources.agents) && Array.isArray(resources.weapons) ? resources : null;
	} catch {
		return null;
	}
}

let current = $state.raw<LiveResources | null>(null);

// Share polling across reactive readers; weapon edits need no broadcast revision.
const subscribe = createSubscriber(() => {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout>;
	let controller: AbortController;
	async function refresh() {
		controller = new AbortController();
		timer = setTimeout(() => controller.abort(), 5000);
		const value = await fetchLiveResources(controller.signal);
		clearTimeout(timer);
		if (stopped) return;
		if (value) current = value;
		timer = setTimeout(refresh, value ? 30_000 : 5000);
	}
	void refresh();
	return () => {
		stopped = true;
		clearTimeout(timer);
		controller.abort();
	};
});

export const liveResources = {
	get current() {
		subscribe();
		return current;
	}
};
