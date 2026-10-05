export type BroadcastPauseState =
	| { type: 'none' }
	| { type: 'tactical'; entryId: string; pendingTechnical: boolean }
	| { type: 'technical' };
export const ceremonyTypes = ['round-win', 'thrifty', 'clutch', 'team-ace', 'flawless'] as const;
export type BroadcastCeremonyType = (typeof ceremonyTypes)[number];
export type BroadcastCeremonyEvent = {
	type: BroadcastCeremonyType;
	entryId: string;
	triggeredAt: number;
	sequence: number;
} | null;
export const CEREMONY_VISIBLE_MS = 6000;
export const ceremonyLabels: Record<BroadcastCeremonyType, string> = {
	'round-win': 'ROUND WIN',
	thrifty: 'THRIFTY',
	clutch: 'CLUTCH',
	'team-ace': 'TEAM ACE',
	flawless: 'FLAWLESS'
};
export type InGameControlAction =
	| { type: 'start-tactical'; entryId: string }
	| { type: 'request-technical' }
	| { type: 'cancel-pending-technical' }
	| { type: 'finish-tactical' }
	| { type: 'resume-technical' }
	| { type: 'trigger-ceremony'; ceremony: BroadcastCeremonyType; entryId: string }
	| { type: 'dismiss-ceremony' };

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
	return (
		!!value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value).length === keys.length &&
		keys.every((key) => Object.hasOwn(value, key))
	);
}
export function isBroadcastPauseState(value: unknown): value is BroadcastPauseState {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		(exact(v, ['type']) && (v.type === 'none' || v.type === 'technical')) ||
		(exact(v, ['type', 'entryId', 'pendingTechnical']) &&
			v.type === 'tactical' &&
			typeof v.entryId === 'string' &&
			!!v.entryId &&
			typeof v.pendingTechnical === 'boolean')
	);
}
export function isBroadcastCeremonyEvent(value: unknown): value is BroadcastCeremonyEvent {
	if (value === null) return true;
	return (
		exact(value, ['type', 'entryId', 'triggeredAt', 'sequence']) &&
		ceremonyTypes.includes(value.type as BroadcastCeremonyType) &&
		typeof value.entryId === 'string' &&
		!!value.entryId &&
		Number.isSafeInteger(value.triggeredAt) &&
		(value.triggeredAt as number) >= 0 &&
		Number.isSafeInteger(value.sequence) &&
		(value.sequence as number) > 0
	);
}
export function isInGameControlAction(value: unknown): value is InGameControlAction {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	if (v.type === 'start-tactical')
		return exact(v, ['type', 'entryId']) && typeof v.entryId === 'string' && !!v.entryId;
	if (v.type === 'trigger-ceremony')
		return (
			exact(v, ['type', 'entryId', 'ceremony']) &&
			typeof v.entryId === 'string' &&
			!!v.entryId &&
			ceremonyTypes.includes(v.ceremony as BroadcastCeremonyType)
		);
	return (
		exact(v, ['type']) &&
		[
			'request-technical',
			'cancel-pending-technical',
			'finish-tactical',
			'resume-technical',
			'dismiss-ceremony'
		].includes(v.type as string)
	);
}
