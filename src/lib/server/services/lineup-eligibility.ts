import { inArray } from 'drizzle-orm';
import type { db } from '#lib/server/db/index.ts';
import { players, tournamentEntryPlayers } from '#lib/server/db/schema/index.ts';
import { SaveError } from './save-error';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Selection = { entryId: string; playerId: string | null };

export async function validateLineupPlayers(
	tx: Transaction,
	rows: readonly Selection[],
	retained: readonly Selection[] = []
) {
	const ids = [...new Set(rows.flatMap((row) => (row.playerId ? [row.playerId] : [])))];
	if (!ids.length) return;
	const [profiles, roster] = await Promise.all([
		tx.select().from(players).where(inArray(players.id, ids)),
		tx.select().from(tournamentEntryPlayers).where(inArray(tournamentEntryPlayers.playerId, ids))
	]);
	for (const row of rows) {
		if (
			!row.playerId ||
			retained.some((saved) => saved.playerId === row.playerId && saved.entryId === row.entryId)
		)
			continue;
		const player = profiles.find((player) => player.id === row.playerId);
		if (
			!player ||
			player.archivedAt ||
			!roster.some((saved) => saved.playerId === row.playerId && saved.entryId === row.entryId)
		)
			throw new SaveError(
				'invalid',
				`${player?.displayName ?? row.playerId} (${row.playerId}): new selections must be active players on that team’s current roster.`
			);
	}
}
