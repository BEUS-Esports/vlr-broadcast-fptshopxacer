import { isLiveGameState } from '#lib/live/decoder.ts';
import type {
	LiveGameState,
	LiveNormalizationContext,
	LivePlayerState,
	LiveProviderId
} from '#lib/live/types.ts';

export function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function jsonInput(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	if (value.length > 262_144) return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

export function string(value: unknown, issues: string[], field: string, max = 512): string | null {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value === 'string' && value.trim() === '') return null;
	if (typeof value !== 'string' || value.length > max) {
		issues.push(`${field}: invalid string`);
		return null;
	}
	return value.trim();
}

export function scalar(value: unknown, issues: string[], field: string, max = 4096): string | null {
	if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean')
		return String(value);
	return string(value, issues, field, max);
}

export function numeric(
	value: unknown,
	issues: string[],
	field: string,
	max = 100_000,
	fractional = false
): number | null {
	if (value === null || value === undefined || (typeof value === 'string' && !value.trim()))
		return null;
	const number =
		typeof value === 'number'
			? value
			: typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())
				? Number(value)
				: NaN;
	if (
		!Number.isFinite(number) ||
		number < 0 ||
		number > max ||
		(!fractional && !Number.isSafeInteger(number))
	) {
		issues.push(`${field}: invalid number`);
		return null;
	}
	return number;
}

export function boolean(
	value: unknown,
	issues: string[],
	field: string,
	encoded = false
): boolean | null {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value === 'boolean') return value;
	if (encoded && (value === 1 || value === '1' || value === 'true')) return true;
	if (encoded && (value === 0 || value === '0' || value === 'false')) return false;
	issues.push(`${field}: invalid boolean`);
	return null;
}

export function triplet(
	value: unknown,
	issues: string[],
	field: string,
	count: number
): (number | null)[] {
	if (value === null || value === undefined || value === '') return Array(count).fill(null);
	const parts = typeof value === 'string' ? value.trim().split('/') : [];
	if (
		parts.length !== count ||
		parts.some((part) => !/^\d+$/.test(part.trim()) || Number(part) > 100_000)
	) {
		issues.push(`${field}: invalid tuple`);
		return Array(count).fill(null);
	}
	const numbers = parts.map(Number);
	if (count === 2 && (numbers[1] === 0 || numbers[0] > numbers[1])) {
		issues.push(`${field}: invalid progress`);
		return [null, null];
	}
	return numbers;
}

export function emptyPlayer(providerKey: string, providerSlot: number | null): LivePlayerState {
	return {
		providerKey,
		providerSlot,
		playerId: null,
		entryId: null,
		observedName: null,
		agent: null,
		weapon: null,
		alive: null,
		observed: null,
		hasSpike: null,
		health: null,
		extraHealth: null,
		shield: { raw: null, kind: 'unknown', current: null, extra: null },
		kills: null,
		deaths: null,
		assists: null,
		credits: null,
		ultimate: { ready: null, current: null, required: null },
		abilities: { grenade: null, ability1: null, ability2: null },
		capabilities: {
			health: false,
			abilities: false,
			enhancedHealth: false,
			enhancedShield: false,
			scoreboard: false
		}
	};
}

export function emptyState(
	provider: LiveProviderId,
	context: LiveNormalizationContext
): LiveGameState {
	return {
		version: 1,
		provider,
		generation: context.generation,
		selectedGameId: context.selectedGameId,
		receivedAt: context.receivedAt,
		phase: 'unknown',
		roundNumber: null,
		map: null,
		spike: { state: 'unknown', carrierPlayerId: null, carrierRaw: null, raw: null },
		teams: [],
		rounds: [],
		roundHistory: { leftRaw: null, rightRaw: null }
	};
}

export function finish(
	state: LiveGameState,
	issues: string[]
): { state: LiveGameState | null; issues: string[] } {
	if (!isLiveGameState(state))
		return { state: null, issues: [...issues, 'Invalid normalized state or context'] };
	return { state, issues };
}
