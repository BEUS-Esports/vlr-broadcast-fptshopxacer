export interface SeriesInput {
	bestOf: 1 | 2 | 3 | 5;
	teamAEntryId: string;
	teamBEntryId: string;
	games: Array<{
		id: string;
		number: number;
		resultType: 'normal' | 'forfeit' | 'walkover' | 'cancelled' | null;
		winnerEntryId: string | null;
	}>;
}

export interface SeriesSummary {
	winsA: number;
	winsB: number;
	state: 'incomplete' | 'completed' | 'draw';
	winnerEntryId: string | null;
	clinchNumber: number | null;
	conflicts: Array<{
		gameId: string;
		reason: 'after-clinch' | 'invalid-winner' | 'invalid-number' | 'duplicate-number';
	}>;
}

export function deriveSeriesResult(input: SeriesInput): SeriesSummary {
	const conflicts: SeriesSummary['conflicts'] = [];
	const numberedGames = new Map<number, SeriesInput['games'][number]>();
	const decisive = new Map<number, string>();
	let winsA = 0;
	let winsB = 0;

	for (const game of input.games) {
		if (!Number.isInteger(game.number) || game.number < 1 || game.number > input.bestOf) {
			conflicts.push({ gameId: game.id, reason: 'invalid-number' });
			continue;
		}
		if (numberedGames.has(game.number)) {
			conflicts.push({ gameId: game.id, reason: 'duplicate-number' });
			continue;
		}
		numberedGames.set(game.number, game);
		const isDecisive =
			game.resultType === 'normal' ||
			game.resultType === 'forfeit' ||
			game.resultType === 'walkover';
		if (
			(isDecisive &&
				game.winnerEntryId !== input.teamAEntryId &&
				game.winnerEntryId !== input.teamBEntryId) ||
			(!isDecisive && game.winnerEntryId !== null)
		) {
			conflicts.push({ gameId: game.id, reason: 'invalid-winner' });
			continue;
		}
		if (isDecisive) decisive.set(game.number, game.winnerEntryId!);
	}

	const requiredWins = input.bestOf === 2 ? 2 : Math.floor(input.bestOf / 2) + 1;
	let clinchNumber: number | null = null;
	let prefixComplete = true;
	for (let number = 1; number <= input.bestOf; number++) {
		const winner = decisive.get(number);
		if (!winner) {
			if (clinchNumber === null) prefixComplete = false;
			continue;
		}
		if (clinchNumber !== null) {
			conflicts.push({ gameId: numberedGames.get(number)!.id, reason: 'after-clinch' });
		}
		if (winner === input.teamAEntryId) winsA++;
		else winsB++;
		if (clinchNumber === null && (winsA === requiredWins || winsB === requiredWins)) {
			clinchNumber = number;
		}
	}

	const complete = conflicts.length === 0 && prefixComplete && clinchNumber !== null;
	const draw =
		input.bestOf === 2 &&
		conflicts.length === 0 &&
		decisive.has(1) &&
		decisive.has(2) &&
		winsA === 1 &&
		winsB === 1;
	return {
		winsA,
		winsB,
		state: complete ? 'completed' : draw ? 'draw' : 'incomplete',
		winnerEntryId: complete ? (winsA > winsB ? input.teamAEntryId : input.teamBEntryId) : null,
		clinchNumber: complete ? clinchNumber : null,
		conflicts
	};
}
