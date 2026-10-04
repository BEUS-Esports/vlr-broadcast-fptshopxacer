import type { LiveGameEnvelope, LiveGameState, LiveSessionStatus } from './types';

type Check = (value: unknown) => boolean;
const text = (value: unknown, max = 512): value is string =>
	typeof value === 'string' && value.length > 0 && value.length <= max;
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const amount: Check = (value) =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000;
const boolean: Check = (value) => typeof value === 'boolean';
const nullable =
	(check: Check): Check =>
	(value) =>
		value === null || check(value);
const string: Check = (value) => text(value);
const raw: Check = (value) => text(value, 4096);
const count: Check = (value) => integer(value, 100_000);
const side: Check = (value) => ['left', 'right', 'team-0', 'team-1'].includes(value as string);
const provider: Check = (value) => value === 'spectra' || value === 'gstack';

function object(value: unknown, fields: Record<string, Check>): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value).length === Object.keys(fields).length &&
		Object.entries(fields).every(
			([key, check]) => Object.hasOwn(value, key) && check((value as Record<string, unknown>)[key])
		)
	);
}

const player: Check = (value) =>
	object(value, {
		providerKey: string,
		providerSlot: nullable((v) => integer(v, 10)),
		playerId: nullable(string),
		entryId: nullable(string),
		observedName: nullable(string),
		agent: nullable(string),
		weapon: nullable(string),
		alive: nullable(boolean),
		observed: nullable(boolean),
		hasSpike: nullable(boolean),
		health: nullable(amount),
		extraHealth: nullable(amount),
		kills: nullable(count),
		deaths: nullable(count),
		assists: nullable(count),
		credits: nullable(count),
		shield: (v) =>
			object(v, {
				raw: nullable(raw),
				kind: (k) =>
					['none', 'light', 'heavy', 'regen', 'standard', 'unknown'].includes(k as string),
				current: nullable(amount),
				extra: nullable(amount)
			}),
		ultimate: (v) =>
			object(v, {
				ready: nullable(boolean),
				current: nullable(count),
				required: nullable(count)
			}) &&
			(v.current === null ||
				v.required === null ||
				((v.required as number) > 0 && (v.current as number) <= (v.required as number))),
		abilities: (v) =>
			object(v, { grenade: nullable(count), ability1: nullable(count), ability2: nullable(count) }),
		capabilities: (v) =>
			object(v, {
				health: boolean,
				abilities: boolean,
				enhancedHealth: boolean,
				enhancedShield: boolean,
				scoreboard: boolean
			})
	});
const team: Check = (value) =>
	object(value, {
		providerSide: side,
		entryId: nullable(string),
		observedName: nullable(string),
		score: nullable(count),
		attacking: nullable(boolean),
		players: (v) => Array.isArray(v) && v.length <= 5 && v.every(player)
	});
const round: Check = (value) =>
	object(value, {
		round: (v) => integer(v, 1000) && v > 0,
		winnerProviderSide: side,
		reason: (v) => ['defuse', 'elimination', 'time', 'detonation'].includes(v as string)
	});

export function isLiveGameState(value: unknown): value is LiveGameState {
	if (
		!object(value, {
			version: (v) => v === 1,
			provider,
			generation: integer,
			selectedGameId: nullable(string),
			phase: (v) =>
				['unknown', 'lobby', 'agent-select', 'buy', 'combat', 'post-round', 'game-end'].includes(
					v as string
				),
			roundNumber: nullable((v) => integer(v, 1000)),
			map: nullable(string),
			spike: (v) =>
				object(v, {
					state: (s) =>
						['unknown', 'carried', 'dropped', 'planted', 'defused', 'detonated'].includes(
							s as string
						),
					carrierPlayerId: nullable(string),
					carrierRaw: nullable(raw),
					raw: nullable(raw)
				}),
			teams: (v) => Array.isArray(v) && v.length <= 2 && v.every(team),
			rounds: (v) => Array.isArray(v) && v.length <= 1000 && v.every(round),
			roundHistory: (v) => object(v, { leftRaw: nullable(raw), rightRaw: nullable(raw) }),
			receivedAt: integer
		})
	)
		return false;
	const state = value as unknown as LiveGameState;
	const keys = state.teams.flatMap((t) => t.players.map((p) => p.providerKey));
	const sides = state.teams.map((t) => t.providerSide);
	const rounds = state.rounds.map((r) => r.round);
	return (
		new Set(keys).size === keys.length &&
		new Set(sides).size === sides.length &&
		new Set(rounds).size === rounds.length &&
		state.rounds.every((r) => sides.includes(r.winnerProviderSide))
	);
}

export function isLiveSessionStatus(value: unknown): value is LiveSessionStatus {
	return object(value, {
		provider: nullable(provider),
		generation: integer,
		selectedGameId: nullable(string),
		health: (v) =>
			['disabled', 'connecting', 'live', 'retrying', 'fallback', 'ready', 'error'].includes(
				v as string
			),
		mode: (v) => v === 'native' || v === 'external',
		mappingReady: boolean,
		retryAttempt: count,
		nextRetryAt: nullable(integer),
		lastReceivedAt: nullable(integer),
		lastError: nullable(string),
		attribution: (v) => ['supporter', 'required', 'unknown', 'invalid-key'].includes(v as string)
	});
}

export function isLiveGameEnvelope(value: unknown): value is LiveGameEnvelope {
	if (
		!object(value, {
			version: (v) => v === 1,
			stream: (v) => object(v, { epoch: string, sequence: integer }),
			state: nullable(isLiveGameState),
			status: isLiveSessionStatus
		})
	)
		return false;
	const envelope = value as unknown as LiveGameEnvelope;
	return (
		envelope.state === null ||
		(envelope.state.provider === envelope.status.provider &&
			envelope.state.generation === envelope.status.generation &&
			envelope.state.selectedGameId === envelope.status.selectedGameId)
	);
}

export function decodeLiveGameEnvelope(data: string): LiveGameEnvelope | null {
	if (typeof data !== 'string' || data.length > 262_144) return null;
	try {
		const value: unknown = JSON.parse(data);
		return isLiveGameEnvelope(value) ? value : null;
	} catch {
		return null;
	}
}
