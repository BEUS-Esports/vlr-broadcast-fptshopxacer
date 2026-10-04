import type { LiveGameState, LivePlayerState, LiveSessionStatus } from './types';

export function livePlayerFixture(overrides: Partial<LivePlayerState> = {}): LivePlayerState {
	return {
		providerKey: 'left:1',
		providerSlot: 1,
		playerId: null,
		entryId: null,
		observedName: 'Player',
		agent: 'Jett',
		weapon: 'Classic',
		alive: null,
		observed: null,
		hasSpike: null,
		health: 100,
		extraHealth: null,
		shield: { raw: 'X', kind: 'none', current: 0, extra: null },
		kills: 0,
		deaths: 0,
		assists: 0,
		credits: 800,
		ultimate: { ready: false, current: 0, required: 8 },
		abilities: { grenade: null, ability1: null, ability2: null },
		capabilities: {
			health: true,
			abilities: false,
			enhancedHealth: false,
			enhancedShield: false,
			scoreboard: true
		},
		...overrides
	};
}

export function liveGameFixture(overrides: Partial<LiveGameState> = {}): LiveGameState {
	return {
		version: 1,
		provider: 'gstack',
		generation: 1,
		selectedGameId: 'game-1',
		phase: 'unknown',
		roundNumber: null,
		map: null,
		spike: { state: 'unknown', carrierPlayerId: null, carrierRaw: null, raw: null },
		teams: [
			{
				providerSide: 'left',
				entryId: null,
				observedName: null,
				score: 0,
				attacking: null,
				players: [livePlayerFixture()]
			},
			{
				providerSide: 'right',
				entryId: null,
				observedName: null,
				score: 0,
				attacking: null,
				players: [livePlayerFixture({ providerKey: 'right:1' })]
			}
		],
		rounds: [],
		roundHistory: { leftRaw: null, rightRaw: null },
		receivedAt: 1000,
		...overrides
	};
}

export function liveSessionFixture(overrides: Partial<LiveSessionStatus> = {}): LiveSessionStatus {
	return {
		provider: 'gstack',
		generation: 1,
		selectedGameId: 'game-1',
		health: 'live',
		mode: 'native',
		mappingReady: false,
		retryAttempt: 0,
		nextRetryAt: null,
		lastReceivedAt: 1000,
		lastError: null,
		attribution: 'unknown',
		...overrides
	};
}

/** Independently authored payload using Spectra-Server's serialized property names. */
export function spectraFixture() {
	const player = (riotId: string) => ({
		riotId,
		name: 'Player',
		position: 1,
		agentProper: 'Jett',
		highestWeapon: 'Classic',
		isAlive: true,
		isObserved: false,
		hasSpike: false,
		health: 100,
		armorName: 'None',
		kills: 0,
		deaths: 0,
		assists: 0,
		money: 800,
		currUltPoints: 0,
		maxUltPoints: 8,
		ultReady: false,
		abilities: { grenade: 0, ability1: 0, ability2: 0 },
		scoreboardAvailable: true,
		auxiliaryAvailable: { health: true, abilities: false, scoreboard: false }
	});
	return {
		roundPhase: 'combat',
		roundNumber: 1,
		map: 'Ascent',
		spikeState: { planted: false, defused: false, detonated: false },
		teams: [
			{
				teamName: 'Left',
				roundsWon: 0,
				isAttacking: true,
				players: [player('provider-left')],
				roundRecord: []
			},
			{
				teamName: 'Right',
				roundsWon: 0,
				isAttacking: false,
				players: [player('provider-right')],
				roundRecord: []
			}
		]
	};
}

/** Full /livenow shape; enhanced fields intentionally unavailable. */
export function gstackFixture() {
	const player = () => ({
		Name: 'Player',
		Agent: 'Jett',
		Weapon: 'Classic',
		Shield: 'X',
		'HP%': '100',
		KDA: '0/0/0',
		Creds: '800',
		Ultimate: '0',
		'Ultimate Points': '0/8',
		'Skill 1 Points': '',
		'Skill 2 Points': '',
		'Skill 3 Points': '',
		XHP: '',
		XShield: ''
	});
	return {
		TeamLeft: [player()],
		TeamRight: [player()],
		ScoreTeamLeft: '0',
		ScoreTeamRight: '0',
		SpikeState: '',
		SpikeCarrier: '',
		RoundHistoryTeam1: '',
		RoundHistoryTeam2: '',
		PlayerPOV: ''
	};
}
