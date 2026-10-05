import type { LiveResources } from './selectors';
export async function fetchLiveResources(): Promise<LiveResources | null> {
	try {
		const response = await fetch('/api/live-game/resources');
		if (!response.ok) return null;
		const resources = await response.json();
		return Array.isArray(resources.agents) && Array.isArray(resources.weapons) ? resources : null;
	} catch {
		return null;
	}
}
