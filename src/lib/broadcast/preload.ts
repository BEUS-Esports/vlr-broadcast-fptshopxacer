import { resourceByName, type LiveResources } from '../live/selectors';
import type { GraphicId } from './controls';
import { programSnapshot } from './selectors';
import type { BroadcastMap, BroadcastPreparedSnapshot, BroadcastSnapshot } from './types';

export const assetRetryDelays = [1000, 5000, 15000] as const;

/** Only saved content and the valid held capture belong to this output's working set. */
export function collectGraphicAssetUrls(
	snapshot: BroadcastSnapshot,
	graphic: GraphicId,
	resources: LiveResources | null
): string[] {
	const urls = new Set<string>();
	const add = (...paths: (string | null | undefined)[]) =>
		paths.forEach((path) => {
			if (path) urls.add(path);
		});
	const map = (value: BroadcastMap | null) =>
		add(
			value?.displayIconPath,
			value?.listViewIconPath,
			value?.splashPath,
			value?.stylizedBackgroundPath
		);
	function collect(saved: BroadcastPreparedSnapshot) {
		const selectedPlayers =
			graphic === 'player-stats'
				? [
						saved.controls.playerStats.playerId,
						...(saved.controls.playerStats.mode === 'head-to-head'
							? [saved.controls.playerStats.opponentPlayerId]
							: [])
					]
				: graphic === 'mvp'
					? [saved.scopes[saved.controls.mvpScope].mvpPlayerId]
					: null;
		const scope = graphic === 'mvp' ? saved.controls.mvpScope : saved.controls.playerStats.scope;
		const candidates = selectedPlayers
			? saved.scopes[scope].candidates.filter((player) => selectedPlayers.includes(player.playerId))
			: [];
		const entryIds = selectedPlayers
			? candidates
					.flatMap((player) => player.entryIds)
					.concat(
						saved.scopes[scope].statistics.players
							.filter((player) => selectedPlayers.includes(player.playerId))
							.flatMap((player) => player.entryIds)
					)
			: [
					saved.competition.teamAEntryId,
					saved.competition.teamBEntryId,
					saved.presentation.leftEntryId,
					saved.presentation.rightEntryId
				];
		for (const team of saved.teams.filter((team) => entryIds.includes(team.entryId)))
			add(team.logoPath, team.logoWhitePath, team.logoBlackPath);
		if (selectedPlayers) {
			for (const player of candidates) add(player.portraitPath);
			return;
		}
		if (graphic === 'map-veto') {
			for (const step of saved.veto) map(step.map);
		}
		if (graphic === 'agent-select') map(saved.game?.map ?? null);
		if (['player-lineup', 'agent-select', 'post-game', 'in-game'].includes(graphic)) {
			for (const row of saved.lineups.filter((row) => entryIds.includes(row.entryId))) {
				if (graphic !== 'in-game') add(row.player?.portraitPath);
				if (graphic === 'agent-select' || graphic === 'in-game') {
					const agent = row.agent;
					add(
						agent?.displayIconPath,
						agent?.fullPortraitPath,
						agent?.bustPortraitPath,
						agent?.roleIconPath
					);
					if (graphic === 'in-game') {
						const catalog = resourceByName(resources?.agents ?? [], agent?.displayName ?? null);
						add(catalog?.displayIconPath);
						for (const ability of catalog?.abilities ?? []) add(ability.displayIconPath);
					}
				}
			}
		}
	}
	collect(snapshot);
	const held = programSnapshot(snapshot, graphic);
	if (held) collect(held);
	if (graphic === 'in-game')
		for (const weapon of resources?.weapons ?? []) add(weapon.displayIconPath);
	return [...urls];
}

type Entry = {
	state: 'queued' | 'loading' | 'waiting' | 'done';
	retries: number;
	image?: HTMLImageElement;
	timer?: ReturnType<typeof setTimeout>;
};

/** Keeps decoded images only while their URLs belong to current saved/held content. */
export function createAssetPreloader(): { update(urls: readonly string[]): void; destroy(): void } {
	const entries = new Map<string, Entry>();
	let active = 0;
	let destroyed = false;
	const current = (url: string, entry: Entry) => !destroyed && entries.get(url) === entry;
	function detach(entry: Entry) {
		if (entry.timer !== undefined) clearTimeout(entry.timer);
		if (entry.image) {
			entry.image.onload = null;
			entry.image.onerror = null;
			if (entry.state === 'loading') entry.image.removeAttribute?.('src');
		}
	}
	function pump() {
		if (destroyed || typeof Image === 'undefined') return;
		for (const [url, entry] of entries) {
			if (active >= 4) break;
			if (entry.state !== 'queued') continue;
			entry.state = 'loading';
			active++;
			const image = new Image();
			entry.image = image;
			let settled = false;
			function finish(success: boolean) {
				if (settled || !current(url, entry)) return;
				settled = true;
				active--;
				image.onload = null;
				image.onerror = null;
				const delay = assetRetryDelays[entry.retries];
				if (!success && delay !== undefined) {
					entry.state = 'waiting';
					entry.retries++;
					entry.timer = setTimeout(() => {
						if (current(url, entry)) {
							entry.state = 'queued';
							pump();
						}
					}, delay);
				} else entry.state = 'done';
				pump();
			}
			image.onload = async () => {
				try {
					if (image.decode) await image.decode();
				} catch {
					/* Loaded images remain usable when decode is unsupported or rejected. */
				}
				finish(true);
			};
			image.onerror = () => finish(false);
			image.src = url;
		}
	}
	return {
		update(urls) {
			if (destroyed) return;
			const wanted = new Set(urls.filter(Boolean));
			for (const [url, entry] of entries)
				if (!wanted.has(url)) {
					detach(entry);
					if (entry.state === 'loading') active--;
					entries.delete(url);
				}
			for (const url of wanted)
				if (!entries.has(url)) entries.set(url, { state: 'queued', retries: 0 });
			pump();
		},
		destroy() {
			destroyed = true;
			for (const entry of entries.values()) detach(entry);
			entries.clear();
			active = 0;
		}
	};
}
