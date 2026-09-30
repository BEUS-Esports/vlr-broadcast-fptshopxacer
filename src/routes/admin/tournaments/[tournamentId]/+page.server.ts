import { error, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	maps,
	matches,
	players,
	teams,
	tournamentEntries,
	tournamentEntryPlayers,
	tournamentMapPool,
	tournaments
} from '#lib/server/db/schema/index.ts';
import { formError, readPayload } from '#lib/server/services/form-error.ts';
import { createMatch } from '#lib/server/services/matches.ts';
import { getTournamentStatistics } from '#lib/server/services/statistics-aggregation.ts';
import { getTournamentMvpCandidates, setTournamentMvp } from '#lib/server/services/mvp.ts';
import {
	deleteTournament,
	replaceTournamentMapPool,
	saveTournament,
	setTournamentArchived
} from '#lib/server/services/tournaments.ts';
import {
	addTournamentEntry,
	removeTournamentEntry,
	replaceTournamentRoster
} from '#lib/server/services/tournament-entries.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [tournament] = await db
		.select()
		.from(tournaments)
		.where(eq(tournaments.id, params.tournamentId))
		.limit(1);
	if (!tournament) error(404, 'Tournament not found.');
	const [entries, matchRows, pool, teamRows, playerRows, mapRows, rosters] = await Promise.all([
		db
			.select({
				id: tournamentEntries.id,
				teamId: teams.id,
				name: teams.name,
				tag: teams.tag,
				logoPath: teams.logoPath
			})
			.from(tournamentEntries)
			.innerJoin(teams, eq(tournamentEntries.teamId, teams.id))
			.where(eq(tournamentEntries.tournamentId, params.tournamentId))
			.orderBy(asc(teams.name)),
		db.select().from(matches).where(eq(matches.tournamentId, params.tournamentId)),
		db
			.select()
			.from(tournamentMapPool)
			.where(eq(tournamentMapPool.tournamentId, params.tournamentId)),
		db.select().from(teams).orderBy(asc(teams.name)),
		db.select().from(players).orderBy(asc(players.displayName)),
		db.select().from(maps).orderBy(asc(maps.displayName)),
		db
			.select({
				entryId: tournamentEntryPlayers.entryId,
				playerId: tournamentEntryPlayers.playerId
			})
			.from(tournamentEntryPlayers)
			.innerJoin(tournamentEntries, eq(tournamentEntryPlayers.entryId, tournamentEntries.id))
			.where(eq(tournamentEntries.tournamentId, params.tournamentId))
	]);
	return {
		tournament,
		entries,
		matches: matchRows,
		mapIds: pool.map((row) => row.mapId),
		teams: teamRows.filter(
			(team) => !team.archivedAt && !entries.some((entry) => entry.teamId === team.id)
		),
		players: playerRows,
		maps: mapRows,
		rosters,
		statistics: await getTournamentStatistics(tournament.id),
		mvpCandidates: await getTournamentMvpCandidates(tournament.id),
		counts: { entries: entries.length, matches: matchRows.length, maps: pool.length }
	};
};

export const actions: Actions = {
	mvp: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await setTournamentMvp({
				tournamentId: params.tournamentId,
				expectedRevision: draft.expectedRevision as number,
				playerId: draft.playerId === '' ? null : draft.playerId
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	createMatch: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		let matchId: string;
		try {
			draft = readPayload(form);
			const match = await createMatch({
				tournamentId: params.tournamentId,
				teamAEntryId: draft.teamAEntryId as string,
				teamBEntryId: draft.teamBEntryId as string,
				label: draft.label as string,
				bestOf: draft.bestOf as number
			});
			matchId = match.id;
		} catch (cause) {
			return formError(cause, form, draft);
		}
		redirect(303, `/admin/matches/${matchId}`);
	},
	addEntry: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await addTournamentEntry({
				tournamentId: params.tournamentId,
				expectedTournamentRevision: draft.expectedTournamentRevision as number,
				teamId: typeof draft.teamId === 'string' ? draft.teamId : ''
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	removeEntry: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await removeTournamentEntry({
				tournamentId: params.tournamentId,
				expectedTournamentRevision: draft.expectedTournamentRevision as number,
				entryId: typeof draft.entryId === 'string' ? draft.entryId : ''
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	roster: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await replaceTournamentRoster({
				tournamentId: params.tournamentId,
				expectedTournamentRevision: draft.expectedTournamentRevision as number,
				entryId: typeof draft.entryId === 'string' ? draft.entryId : '',
				playerIds: draft.playerIds as string[]
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	mapPool: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await replaceTournamentMapPool({
				tournamentId: params.tournamentId,
				expectedRevision: draft.expectedRevision as number,
				mapIds: draft.mapIds as string[]
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	save: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown>;
		try {
			draft = readPayload(form);
			await saveTournament({
				id: params.tournamentId,
				expectedRevision: draft.expectedRevision as number,
				name: draft.name as string,
				slug: draft.slug as string
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft!);
		}
	},
	archive: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown>;
		try {
			draft = readPayload(form);
			await setTournamentArchived({
				tournamentId: params.tournamentId,
				expectedRevision: draft.expectedRevision as number,
				archived: draft.archived as boolean
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft!);
		}
	},
	delete: async ({ request, params }) => {
		const form = await request.formData();
		let draft: Record<string, unknown>;
		try {
			draft = readPayload(form);
			await deleteTournament({
				tournamentId: params.tournamentId,
				expectedRevision: draft.expectedRevision as number
			});
		} catch (cause) {
			return formError(cause, form, draft!);
		}
		redirect(303, '/admin/tournaments');
	}
};
