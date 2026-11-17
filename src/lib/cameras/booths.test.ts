import { expect, it } from 'vitest';
import type { BroadcastPreparedSnapshot } from '#lib/broadcast/types.ts';
import { boothViews } from './booths';

type Input = Parameters<typeof boothViews>[0];
const team = (entryId: string, name: string, tag: string) => ({
	entryId,
	teamId: entryId,
	name,
	tag,
	logoPath: null,
	logoWhitePath: null,
	logoBlackPath: null
});
const lineup = (entryId: string, slot: number, displayName: string | null) => ({
	entryId,
	slot,
	player: displayName === null ? null : { playerId: displayName, displayName, portraitPath: null },
	agent: null
});
const selected: Input = {
	booths: { booth1EntryId: 'a', booth2EntryId: 'b' },
	competition: { teamAEntryId: 'a', teamBEntryId: 'b' },
	teams: [team('a', 'Alpha', 'ALP'), team('b', 'Bravo', 'BRA')],
	lineups: [1, 2, 3, 4, 5].flatMap((slot) => [
		lineup('a', slot, `A${slot}`),
		lineup('b', slot, `B${slot}`)
	]) as BroadcastPreparedSnapshot['lineups']
};

it('falls back to seat IDs without a selected game', () => {
	const [one, two] = boothViews({
		booths: { booth1EntryId: null, booth2EntryId: null },
		competition: { teamAEntryId: null, teamBEntryId: null },
		teams: [],
		lineups: []
	});
	expect(one).toEqual({
		booth: 1,
		role: null,
		team: null,
		seats: [1, 2, 3, 4, 5].map((seat) => ({ id: `BOOTH1_S${seat}`, player: null }))
	});
	expect(two.booth).toBe(2);
	expect(two.seats.map((seat) => seat.id)).toEqual([
		'BOOTH2_S1',
		'BOOTH2_S2',
		'BOOTH2_S3',
		'BOOTH2_S4',
		'BOOTH2_S5'
	]);
});

it('assigns Team A to booth 1 and maps slot N to seat N', () => {
	const [one, two] = boothViews(selected);
	expect(one).toMatchObject({ role: 'Team A', team: { name: 'Alpha', tag: 'ALP' } });
	expect(one.seats[2]).toEqual({ id: 'BOOTH1_S3', player: 'A3' });
	expect(two).toMatchObject({ role: 'Team B', team: { name: 'Bravo', tag: 'BRA' } });
	expect(two.seats[4]).toEqual({ id: 'BOOTH2_S5', player: 'B5' });
});

it('follows swapped booths without changing Team A/B roles', () => {
	const [one, two] = boothViews({
		...selected,
		booths: { booth1EntryId: 'b', booth2EntryId: 'a' }
	});
	expect(one).toMatchObject({ role: 'Team B', team: { name: 'Bravo' } });
	expect(one.seats[0]).toEqual({ id: 'BOOTH1_S1', player: 'B1' });
	expect(two).toMatchObject({ role: 'Team A', team: { name: 'Alpha' } });
});

it('leaves missing and empty lineup slots unassigned', () => {
	const [one] = boothViews({
		...selected,
		lineups: [
			lineup('a', 1, 'A1'),
			lineup('a', 3, 'A3'),
			lineup('a', 4, null),
			lineup('a', 5, 'A5')
		] as BroadcastPreparedSnapshot['lineups']
	});
	expect(one.seats.map((seat) => seat.player)).toEqual(['A1', null, 'A3', null, 'A5']);
});
