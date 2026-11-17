import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import { booths, seatId, seats, type Booth, type SeatId } from './vdo-ninja';

export type BoothView = {
	booth: Booth;
	role: 'Team A' | 'Team B' | null;
	team: { name: string; tag: string } | null;
	seats: Array<{ id: SeatId; player: string | null }>;
};

/** Booth N seat M shows lineup slot M of whichever entry sits in booth N. */
export function boothViews(
	snapshot: Pick<BroadcastPreparedSnapshot, 'booths' | 'competition' | 'teams' | 'lineups'>
): [BoothView, BoothView] {
	const [one, two] = booths.map((booth): BoothView => {
		const entryId = booth === 1 ? snapshot.booths.booth1EntryId : snapshot.booths.booth2EntryId;
		const team = entryId ? snapshot.teams.find((row) => row.entryId === entryId) : undefined;
		return {
			booth,
			role:
				entryId === null
					? null
					: entryId === snapshot.competition.teamAEntryId
						? 'Team A'
						: entryId === snapshot.competition.teamBEntryId
							? 'Team B'
							: null,
			team: team ? { name: team.name, tag: team.tag } : null,
			seats: seats.map((seat) => ({
				id: seatId(booth, seat),
				player:
					(entryId &&
						snapshot.lineups.find((row) => row.entryId === entryId && row.slot === seat)?.player
							?.displayName) ||
					null
			}))
		};
	});
	return [one, two];
}
