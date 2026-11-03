export const statisticFields = [
	'kills',
	'deaths',
	'assists',
	'performanceScore',
	'trades',
	'firstBloods',
	'plants',
	'defuses'
] as const;

export type StatisticField = (typeof statisticFields)[number];

/** Canonical nonempty field lists are stable across storage and publication. */
export function isStatisticFieldList(value: unknown): value is StatisticField[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((field, index) => {
			const position = statisticFields.indexOf(field);
			return position >= 0 && (index === 0 || statisticFields.indexOf(value[index - 1]) < position);
		})
	);
}
