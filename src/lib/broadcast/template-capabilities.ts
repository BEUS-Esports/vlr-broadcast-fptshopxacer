import { statisticFields } from '../statistics/fields';

// Kept independent of Svelte modules so the server validates the same limits.
export const statisticCapabilities = {
	'player-stats': { fields: statisticFields, min: 1, max: 8 },
	mvp: { fields: statisticFields, min: 1, max: 8 }
} as const;
