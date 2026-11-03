import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPlayerStats, defaultVisibility, graphicIds } from './controls';
import type { BroadcastSnapshot } from './types';
import type { LiveResources } from '../live/selectors';
import { collectGraphicAssetUrls, createAssetPreloader } from './preload';

function fixture(): BroadcastSnapshot {
	const scope = {
		statistics: { scope: 'game' as const, gamesTotal: 0, gamesContributing: 0, players: [] },
		candidates: [
			{ playerId: 'p', displayName: 'Player', portraitPath: '/scope.png', entryIds: ['a'] }
		],
		mvpPlayerId: 'p'
	};
	return {
		version: 4,
		controlRevision: 1,
		dataRevision: 1,
		liveControls: {
			swapped: false,
			lineupTeams: 'both',
			currentAttackersEntryId: null,
			pause: { type: 'none' },
			ceremony: null
		},
		selection: { tournamentId: 't', matchId: 'm', gameId: 'g' },
		tournament: { id: 't', name: 'Test', slug: 'test' },
		match: {
			id: 'm',
			label: 'Match',
			bestOf: 1,
			scoreA: 0,
			scoreB: 0,
			resultType: null,
			winnerEntryId: null
		},
		game: {
			id: 'g',
			name: 'Game',
			number: 1,
			map: {
				id: 'map',
				key: 'map',
				displayName: 'Map',
				displayIconPath: '/map.png',
				listViewIconPath: null,
				splashPath: '/map-splash.png',
				stylizedBackgroundPath: null
			},
			scoreA: null,
			scoreB: null,
			resultType: null,
			winnerEntryId: null
		},
		competition: { teamAEntryId: 'a', teamBEntryId: null },
		presentation: { leftEntryId: 'a', rightEntryId: null },
		sides: {
			preparedAttackersEntryId: null,
			preparedDefendersEntryId: null,
			attackersEntryId: null,
			defendersEntryId: null,
			source: 'unknown'
		},
		teams: [
			{
				entryId: 'a',
				teamId: 'a',
				name: 'Alpha',
				tag: 'A',
				logoPath: '/logo.png',
				logoWhitePath: '/white.png',
				logoBlackPath: '/logo.png'
			}
		],
		lineups: [
			{
				entryId: 'a',
				slot: 1,
				player: { playerId: 'p', displayName: 'Player', portraitPath: '/lineup.png' },
				agent: {
					id: 'agent',
					key: 'agent',
					displayName: 'Agent',
					roleName: null,
					displayIconPath: '/agent.png',
					fullPortraitPath: '/agent-full.png',
					bustPortraitPath: null,
					roleIconPath: '/role.png'
				}
			}
		],
		veto: [],
		scopes: {
			game: scope,
			match: {
				...scope,
				statistics: { ...scope.statistics, scope: 'match' },
				candidates: [{ ...scope.candidates[0], portraitPath: '/match.png' }]
			},
			tournament: { ...scope, statistics: { ...scope.statistics, scope: 'tournament' } }
		},
		controls: {
			visibility: { ...defaultVisibility },
			playerStats: { ...defaultPlayerStats, playerId: 'p' },
			mvpScope: 'match',
			mvpFields: [...defaultPlayerStats.fields]
		},
		readiness: { selected: true, map: true, lineups: true, agents: true, result: false },
		publications: Object.fromEntries(
			graphicIds.map((id) => [id, null])
		) as BroadcastSnapshot['publications']
	};
}

describe('saved asset collection', () => {
	it('prepares hidden saved lineup and logo variants without duplicate URLs', () => {
		expect(collectGraphicAssetUrls(fixture(), 'player-lineup', null).sort()).toEqual([
			'/lineup.png',
			'/logo.png',
			'/white.png'
		]);
	});
	it('prepares saved map and agent art, reading abilities from the resource catalog', () => {
		const snapshot = fixture();
		const resources: LiveResources = {
			agents: [
				{
					...snapshot.lineups[0].agent!,
					abilities: [{ slot: 'ability1', displayName: 'Ability', displayIconPath: '/ability.png' }]
				}
			],
			weapons: [{ key: 'rifle', displayName: 'Rifle', displayIconPath: '/rifle.png' }]
		};
		expect(collectGraphicAssetUrls(snapshot, 'agent-select', resources)).toEqual(
			expect.arrayContaining([
				'/map.png',
				'/map-splash.png',
				'/agent.png',
				'/agent-full.png',
				'/role.png'
			])
		);
		expect(collectGraphicAssetUrls(snapshot, 'in-game', resources)).toEqual(
			expect.arrayContaining(['/agent.png', '/ability.png', '/rifle.png'])
		);
	});
	it('uses selected scope candidates for stats and MVP instead of lineup portraits', () => {
		const snapshot = fixture();
		snapshot.controls.playerStats.scope = 'match';
		expect(collectGraphicAssetUrls(snapshot, 'player-stats', null).sort()).toEqual([
			'/logo.png',
			'/match.png',
			'/white.png'
		]);
		expect(collectGraphicAssetUrls(snapshot, 'mvp', null).sort()).toEqual([
			'/logo.png',
			'/match.png',
			'/white.png'
		]);
	});
	it('includes both latest saved and held Program images on reconnect without mutating captures', () => {
		const snapshot = fixture();
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Captures omit the publications container.
		const { publications: _, ...held } = fixture();
		held.lineups[0].player!.portraitPath = '/held.png';
		snapshot.controls.visibility['player-lineup'] = true;
		snapshot.publications['player-lineup'] = held;
		expect(collectGraphicAssetUrls(snapshot, 'player-lineup', null)).toEqual(
			expect.arrayContaining(['/lineup.png', '/held.png'])
		);
		expect(held.lineups[0].player!.portraitPath).toBe('/held.png');
		snapshot.controls.visibility['player-lineup'] = false;
		expect(collectGraphicAssetUrls(snapshot, 'player-lineup', null)).not.toContain('/held.png');
	});
});

class TestImage {
	static created: TestImage[] = [];
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	src = '';
	decode = vi.fn(async () => {});
	constructor() {
		TestImage.created.push(this);
	}
}

describe('asset preparation queue', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		TestImage.created = [];
		vi.stubGlobal('Image', TestImage);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	it('limits work to four loads, decodes successes, and retains prepared URLs across updates', async () => {
		const loader = createAssetPreloader();
		loader.update(['/a', '/b', '/c', '/d', '/e', '/a']);
		expect(TestImage.created.map((image) => image.src)).toEqual(['/a', '/b', '/c', '/d']);
		TestImage.created[0].onload?.();
		await vi.advanceTimersByTimeAsync(0);
		expect(TestImage.created[0].decode).toHaveBeenCalledOnce();
		expect(TestImage.created.map((image) => image.src)).toEqual(['/a', '/b', '/c', '/d', '/e']);
		loader.update(['/a', '/b', '/c', '/d', '/e']);
		expect(TestImage.created).toHaveLength(5);
		loader.destroy();
	});
	it('retries at 1, 5 and 15 seconds then stops permanently failed images', async () => {
		const loader = createAssetPreloader();
		loader.update(['/bad']);
		for (const delay of [1000, 5000, 15000]) {
			TestImage.created.at(-1)!.onerror?.();
			const count = TestImage.created.length;
			await vi.advanceTimersByTimeAsync(delay - 1);
			expect(TestImage.created).toHaveLength(count);
			await vi.advanceTimersByTimeAsync(1);
			expect(TestImage.created).toHaveLength(count + 1);
		}
		TestImage.created.at(-1)!.onerror?.();
		loader.update(['/bad']);
		await vi.advanceTimersByTimeAsync(60000);
		expect(TestImage.created).toHaveLength(4);
		loader.destroy();
	});
	it('drops changed URLs and pending retries, releasing slots for current content', async () => {
		const loader = createAssetPreloader();
		loader.update(['/old']);
		TestImage.created[0].onerror?.();
		loader.update(['/new']);
		await vi.advanceTimersByTimeAsync(30000);
		expect(TestImage.created.map((image) => image.src)).toEqual(['/old', '/new']);
		loader.update(['/old']);
		expect(TestImage.created.at(-1)?.src).toBe('/old');
		loader.destroy();
	});
	it('cancels pending work and retry callbacks when destroyed', async () => {
		const loader = createAssetPreloader();
		loader.update(['/bad', '/pending']);
		TestImage.created[0].onerror?.();
		const lateLoad = TestImage.created[1].onload;
		loader.destroy();
		lateLoad?.();
		loader.update(['/ignored']);
		await vi.advanceTimersByTimeAsync(30000);
		expect(TestImage.created).toHaveLength(2);
		expect(TestImage.created[1].onload).toBeNull();
	});
});
