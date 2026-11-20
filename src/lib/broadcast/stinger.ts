export type StingerKind = 'video' | 'image';

/** The active stinger as carried on the broadcast snapshot. Times are milliseconds. */
export type BroadcastStinger = {
	path: string;
	kind: StingerKind;
	durationMs: number;
	cutPointMs: number;
};

export const STINGER_DURATION_MAX_MS = 60000;
/** How long the player waits for playback to begin before giving up and falling back. */
export const STINGER_START_TIMEOUT_MS = 1500;
/** Slack after `durationMs` before a stinger that never reports its end is cut off. */
export const STINGER_END_MARGIN_MS = 1000;
