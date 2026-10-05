import type { LiveGameState, LiveNormalizationContext, LiveRoundResult } from '#lib/live/types.ts';
import {
	boolean,
	emptyPlayer,
	emptyState,
	finish,
	jsonInput,
	numeric,
	record,
	scalar,
	string,
	triplet
} from './shared';

const playerFields = [
	'Name',
	'Agent',
	'Weapon',
	'Shield',
	'HP%',
	'KDA',
	'Creds',
	'Ultimate',
	'Ultimate Points',
	'Skill 1 Points',
	'Skill 2 Points',
	'Skill 3 Points',
	'XHP',
	'XShield'
] as const;
const snapshotFields = [
	'ScoreTeamLeft',
	'ScoreTeamRight',
	'SpikeState',
	'SpikeCarrier',
	'RoundHistoryTeam1',
	'RoundHistoryTeam2',
	'PlayerPOV'
] as const;

type Literal = string | number | boolean | null;
export type GStackParsedMessage =
	| { kind: 'script'; name: string; args: Literal[] }
	| { kind: 'json'; patch: Record<string, unknown> }
	| { kind: 'unsupported'; issue: string }
	| { kind: 'invalid'; issue: string };
type RawSnapshot = Record<string, unknown> & {
	TeamLeft: Record<string, Record<string, Literal>>;
	TeamRight: Record<string, Record<string, Literal>>;
	_carrierTeam?: number;
	_carrierPlayer?: number;
};

function safeObject(value: unknown, seen = new WeakSet<object>(), depth = 0): boolean {
	if (value === null || typeof value !== 'object') return true;
	if (depth > 8 || seen.has(value)) return false;
	seen.add(value);
	return Object.entries(value).every(
		([key, child]) =>
			!['__proto__', 'prototype', 'constructor'].includes(key) && safeObject(child, seen, depth + 1)
	);
}

function isScalar(value: unknown): value is Literal {
	return (
		value === null ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value)) ||
		(typeof value === 'string' && value.length <= 4096)
	);
}

function pickFields(
	input: Record<string, unknown>,
	fields: readonly string[]
): Record<string, Literal> | null {
	const result: Record<string, Literal> = {};
	for (const key of fields) {
		if (!Object.hasOwn(input, key)) continue;
		if (!isScalar(input[key])) return null;
		result[key] = input[key];
	}
	return result;
}

function pickPlayers(input: unknown): Record<string, Record<string, Literal>> | null {
	const list = players(input);
	if (!list) return null;
	const result: Record<string, Record<string, Literal>> = {};
	for (const { slot, raw } of list) {
		const player = pickFields(raw, playerFields);
		if (!player) return null;
		result[`Player${slot}`] = player;
	}
	return result;
}

function parseArguments(source: string): Literal[] | null {
	const args: Literal[] = [];
	let index = 0;
	const whitespace = () => {
		while (/\s/.test(source[index] ?? '') && index < source.length) index++;
	};
	whitespace();
	if (index === source.length) return args;
	while (index < source.length && args.length < 8) {
		const quote = source[index];
		if (quote === "'" || quote === '"') {
			index++;
			let value = '',
				closed = false;
			while (index < source.length) {
				const char = source[index++];
				if (char === quote) {
					closed = true;
					break;
				}
				if (char === '\n' || char === '\r' || char.charCodeAt(0) < 32) return null;
				if (char !== '\\') {
					value += char;
					continue;
				}
				const escaped = source[index++];
				const escapes: Record<string, string> = {
					"'": "'",
					'"': '"',
					'\\': '\\',
					n: '\n',
					r: '\r',
					t: '\t',
					b: '\b',
					f: '\f',
					v: '\v',
					'0': '\0'
				};
				if (Object.hasOwn(escapes, escaped)) value += escapes[escaped];
				else if (escaped === 'u' && /^[0-9a-fA-F]{4}$/.test(source.slice(index, index + 4))) {
					value += String.fromCharCode(parseInt(source.slice(index, index + 4), 16));
					index += 4;
				} else return null;
			}
			if (!closed || value.length > 4096) return null;
			args.push(value);
		} else {
			const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?)(?=\s*(?:,|$))/.exec(
				source.slice(index)
			);
			if (!match) return null;
			const token = match[0];
			const value =
				token === 'true'
					? true
					: token === 'false'
						? false
						: token === 'null'
							? null
							: Number(token);
			if (
				typeof value === 'number' &&
				(!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
			)
				return null;
			args.push(value);
			index += token.length;
		}
		whitespace();
		if (index === source.length) return args;
		if (source[index++] !== ',') return null;
		whitespace();
		if (index === source.length) return null;
	}
	return null;
}

const commandNames = new Set([
	'SetNamePlayer',
	'SetPlayerAgent',
	'SetPlayerWeapon',
	'SetPlayerShield',
	'SetPlayerHP',
	'SetPlayerKDA',
	'SetPlayerCreds',
	'SetUltiActive',
	'SetUltiPoints',
	'SetSkillsPoints',
	'SetExtraData',
	'SetRound',
	'SlideSpike',
	'SpikeTeam',
	'SpikePlayer'
]);

function commandValid(name: string, args: Literal[]): boolean {
	const integer = (value: Literal, max = 100_000, blank = false) =>
		(blank && value === '') ||
		((typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
			Number.isSafeInteger(Number(value)) &&
			Number(value) >= 0 &&
			Number(value) <= max);
	const amount = (value: Literal, max: number) =>
		value === '' ||
		((typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) &&
			Number.isFinite(Number(value)) &&
			Number(value) >= 0 &&
			Number(value) <= max);
	const text = (value: Literal, max = 512) => typeof value === 'string' && value.length <= max;
	const team = (value: Literal) => value === 0 || value === 1;
	const slot = (value: Literal) => typeof value === 'number' && integer(value, 5) && value > 0;
	const progress = (current: Literal, capacity: Literal) =>
		(current === '' && capacity === '') ||
		(integer(current) &&
			integer(capacity) &&
			Number(capacity) > 0 &&
			Number(current) <= Number(capacity));
	if (name === 'SetRound') return args.length === 2 && args.every((v) => integer(v));
	if (name === 'SpikeTeam') return args.length === 1 && team(args[0]);
	if (name === 'SpikePlayer')
		return args.length === 1 && typeof args[0] === 'number' && integer(args[0], 5);
	if (name === 'SlideSpike')
		return args.length === 1 && (typeof args[0] === 'boolean' || args[0] === 0 || args[0] === 1);
	if (name === 'SetSkillsPoints')
		return (
			args.length === 5 &&
			team(args[0]) &&
			typeof args[1] === 'number' &&
			integer(args[1], 2) &&
			slot(args[2]) &&
			progress(args[3], args[4])
		);
	if (!team(args[0]) || !slot(args[1])) return false;
	switch (name) {
		case 'SetNamePlayer':
		case 'SetPlayerAgent':
			return args.length === 3 && text(args[2]);
		case 'SetPlayerWeapon':
			return args.length === 4 && text(args[2]) && text(args[3], 128);
		case 'SetPlayerShield':
			return args.length === 3 && (text(args[2], 64) || integer(args[2], 1000));
		case 'SetPlayerHP':
			return args.length === 3 && amount(args[2], 100);
		case 'SetPlayerKDA':
			return args.length === 5 && args.slice(2).every((v) => integer(v));
		case 'SetPlayerCreds':
			return args.length === 3 && integer(args[2], 100_000, true);
		case 'SetUltiActive':
			return (
				args.length === 3 &&
				(typeof args[2] === 'boolean' ||
					args[2] === 0 ||
					args[2] === 1 ||
					args[2] === '0' ||
					args[2] === '1' ||
					args[2] === '')
			);
		case 'SetUltiPoints':
			return args.length === 4 && progress(args[2], args[3]);
		case 'SetExtraData':
			return args.length === 4 && args.slice(2).every((v) => amount(v, 1000));
		default:
			return false;
	}
}

function jsonPatch(wire: Record<string, unknown>): Record<string, unknown> | null {
	const patch: Record<string, unknown> = {};
	for (const [source, target] of [
		['Team_Left', 'TeamLeft'],
		['Team_Right', 'TeamRight']
	] as const) {
		if (!Object.hasOwn(wire, source)) continue;
		const list = pickPlayers(wire[source]);
		if (!list) return null;
		const relevant = Object.fromEntries(
			Object.entries(list).filter(([, fields]) => Object.keys(fields).length > 0)
		);
		if (Object.keys(relevant).length) patch[target] = relevant;
	}
	for (const section of ['Scoreboard', 'Spike'] as const) {
		if (!Object.hasOwn(wire, section)) continue;
		if (!record(wire[section])) return null;
		const fields = pickFields(
			wire[section],
			section === 'Scoreboard'
				? ['ScoreTeamLeft', 'ScoreTeamRight', 'RoundHistoryTeam1', 'RoundHistoryTeam2', 'PlayerPOV']
				: ['SpikeState', 'SpikeCarrier']
		);
		if (!fields) return null;
		Object.assign(patch, fields);
	}
	return patch;
}

/** A literal command grammar: data is parsed, never executed. */
export function parseGStackMessage(input: unknown): GStackParsedMessage {
	if (typeof input !== 'string' || input.length > 65_536)
		return { kind: 'invalid', issue: 'Invalid GStack message' };
	if (input.startsWith('[ExecuteJSON]:')) {
		const wire = jsonInput(input.slice('[ExecuteJSON]:'.length).trim());
		if (!record(wire) || !safeObject(wire))
			return { kind: 'invalid', issue: 'Invalid or unsafe ExecuteJSON object' };
		const patch = jsonPatch(wire);
		if (!patch) return { kind: 'invalid', issue: 'Malformed known ExecuteJSON fields' };
		return Object.keys(patch).length
			? { kind: 'json', patch }
			: { kind: 'unsupported', issue: 'Unsupported ExecuteJSON fields' };
	}
	if (!input.startsWith('[ExecuteScript]:'))
		return { kind: 'unsupported', issue: 'Unknown GStack message family' };
	const source = input.slice('[ExecuteScript]:'.length).trim();
	const name = /^([A-Za-z][A-Za-z0-9_]*)/.exec(source)?.[1];
	if (name && ['__proto__', 'prototype', 'constructor'].includes(name))
		return { kind: 'invalid', issue: 'Unsafe ExecuteScript command' };
	if (name && !commandNames.has(name))
		return { kind: 'unsupported', issue: 'Unsupported ExecuteScript command' };
	const match = /^([A-Za-z][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*;?\s*$/.exec(source);
	if (!match) return { kind: 'invalid', issue: 'Invalid ExecuteScript grammar' };
	const args = parseArguments(match[2]);
	if (!args || !commandValid(match[1], args))
		return { kind: 'invalid', issue: 'Invalid command arguments' };
	return { kind: 'script', name: match[1], args };
}

export function createGStackAccumulator() {
	let snapshot: RawSnapshot | null = null;
	let lastMessage: string | null = null,
		lastUnknownMessage: string | null = null;
	return {
		seed(input: unknown): { accepted: boolean; issues: string[] } {
			const wire = jsonInput(input);
			if (!record(wire) || !safeObject(wire))
				return { accepted: false, issues: ['Invalid GStack snapshot'] };
			const left = pickPlayers(wire.TeamLeft),
				right = pickPlayers(wire.TeamRight),
				fields = pickFields(wire, snapshotFields);
			if (!left || !right || !fields)
				return { accepted: false, issues: ['Invalid GStack snapshot fields'] };
			snapshot = { ...fields, TeamLeft: left, TeamRight: right };
			return { accepted: true, issues: [] };
		},
		apply(message: unknown): { accepted: boolean; issues: string[] } {
			lastMessage = typeof message === 'string' ? message.slice(0, 16_384) : null;
			const parsed = parseGStackMessage(message);
			if (parsed.kind === 'invalid' || parsed.kind === 'unsupported') {
				lastUnknownMessage = lastMessage;
				return { accepted: false, issues: [parsed.issue] };
			}
			if (!snapshot) return { accepted: false, issues: ['GStack snapshot required before delta'] };
			if (parsed.kind === 'json') {
				for (const [key, value] of Object.entries(parsed.patch)) {
					if (key === 'TeamLeft' || key === 'TeamRight') {
						for (const [player, fields] of Object.entries(
							value as Record<string, Record<string, Literal>>
						))
							snapshot[key][player] = { ...snapshot[key][player], ...fields };
					} else snapshot[key] = value;
				}
				return { accepted: true, issues: [] };
			}
			const { name, args } = parsed;
			if (name === 'SetRound') {
				snapshot.ScoreTeamLeft = args[0];
				snapshot.ScoreTeamRight = args[1];
			} else if (name === 'SlideSpike') snapshot.SpikeState = args[0];
			else if (name === 'SpikeTeam') snapshot._carrierTeam = args[0] as number;
			else if (name === 'SpikePlayer') snapshot._carrierPlayer = args[0] as number;
			else {
				const team = args[0] === 0 ? snapshot.TeamLeft : snapshot.TeamRight;
				const slot = name === 'SetSkillsPoints' ? args[2] : args[1];
				const player = (team[`Player${slot}`] ??= {});
				switch (name) {
					case 'SetNamePlayer':
						player.Name = args[2];
						break;
					case 'SetPlayerAgent':
						player.Agent = args[2];
						break;
					case 'SetPlayerWeapon':
						player.Weapon = args[2];
						break;
					case 'SetPlayerShield':
						player.Shield = args[2];
						break;
					case 'SetPlayerHP':
						player['HP%'] = args[2];
						break;
					case 'SetPlayerKDA':
						player.KDA = args.slice(2).join('/');
						break;
					case 'SetPlayerCreds':
						player.Creds = args[2];
						break;
					case 'SetUltiActive':
						player.Ultimate = args[2];
						break;
					case 'SetUltiPoints':
						player['Ultimate Points'] = args[2] === '' ? '' : `${args[2]}/${args[3]}`;
						break;
					case 'SetSkillsPoints':
						player[`Skill ${Number(args[1]) + 1} Points`] =
							args[3] === '' ? '' : `${args[3]}/${args[4]}`;
						break;
					case 'SetExtraData':
						player.XHP = args[2];
						player.XShield = args[3];
						break;
				}
			}
			return { accepted: true, issues: [] };
		},
		getSnapshot(): unknown {
			return structuredClone(snapshot);
		},
		/** Raw message text is diagnostic server memory only, never a LiveGameState field. */
		getDiagnostics(): { lastMessage: string | null; lastUnknownMessage: string | null } {
			return { lastMessage, lastUnknownMessage };
		}
	};
}

function players(input: unknown): Array<{ slot: number; raw: Record<string, unknown> }> | null {
	if (Array.isArray(input))
		return input.length <= 5 && input.every(record)
			? input.map((raw, index) => ({ slot: index + 1, raw }))
			: null;
	if (!record(input)) return null;
	const result: Array<{ slot: number; raw: Record<string, unknown> }> = [];
	for (const [key, raw] of Object.entries(input)) {
		const match = /^(?:Player)?([1-5])$/.exec(key);
		if (!match || !record(raw)) return null;
		result.push({ slot: Number(match[1]), raw });
	}
	return result.length <= 5 && new Set(result.map((p) => p.slot)).size === result.length
		? result.sort((a, b) => a.slot - b.slot)
		: null;
}

export function normalizeGStack(
	input: unknown,
	context: LiveNormalizationContext
): { state: LiveGameState | null; issues: string[] } {
	const wire = jsonInput(input);
	if (!record(wire)) return { state: null, issues: ['Invalid GStack /livenow object'] };
	const left = players(wire.TeamLeft),
		right = players(wire.TeamRight);
	if (!left || !right)
		return { state: null, issues: ['Invalid GStack TeamLeft/TeamRight players'] };
	const issues: string[] = [];
	const state = emptyState('gstack', context);
	state.teams = [left, right].map((list, teamIndex) => {
		const providerSide = teamIndex === 0 ? 'left' : 'right';
		return {
			providerSide,
			entryId: null,
			observedName: null,
			attacking: null,
			score: numeric(
				wire[teamIndex === 0 ? 'ScoreTeamLeft' : 'ScoreTeamRight'],
				issues,
				`${providerSide}.score`
			),
			players: list.map(({ slot, raw }) => {
				const field = `${providerSide}.Player${slot}`;
				const player = emptyPlayer(`${providerSide}:${slot}`, slot);
				player.observedName = string(raw.Name, issues, `${field}.Name`);
				player.agent = string(raw.Agent, issues, `${field}.Agent`);
				player.weapon = string(raw.Weapon, issues, `${field}.Weapon`);
				player.health = numeric(raw['HP%'], issues, `${field}.HP%`, 100, true);
				player.extraHealth = numeric(raw.XHP, issues, `${field}.XHP`, 1000, true);
				player.shield.raw = scalar(raw.Shield, issues, `${field}.Shield`);
				const shield = player.shield.raw;
				player.shield.kind =
					shield === 'X'
						? 'none'
						: shield === '25'
							? 'light'
							: shield === '50'
								? 'heavy'
								: shield === 'R'
									? 'regen'
									: 'unknown';
				if (shield === 'X') player.shield.current = 0;
				else if (shield !== null && player.shield.kind === 'unknown')
					issues.push(`${field}.Shield: unverified equipment code`);
				player.shield.extra = numeric(raw.XShield, issues, `${field}.XShield`, 1000, true);
				[player.kills, player.deaths, player.assists] = triplet(raw.KDA, issues, `${field}.KDA`, 3);
				player.credits = numeric(raw.Creds, issues, `${field}.Creds`);
				player.ultimate.ready = boolean(raw.Ultimate, issues, `${field}.Ultimate`, true);
				[player.ultimate.current, player.ultimate.required] = triplet(
					raw['Ultimate Points'],
					issues,
					`${field}.Ultimate Points`,
					2
				);
				for (const [index, key] of (['grenade', 'ability1', 'ability2'] as const).entries()) {
					const value = raw[`Skill ${index + 1} Points`];
					const label = `${field}.Skill ${index + 1} Points`;
					if (typeof value === 'string' && value.includes('/')) {
						const [current, capacity] = triplet(value, issues, label, 2);
						player.abilities[key] = { current, capacity };
					} else player.abilities[key].current = numeric(value, issues, label);
				}
				player.capabilities = {
					health: player.health !== null,
					enhancedHealth: player.extraHealth !== null,
					enhancedShield: player.shield.extra !== null,
					abilities: Object.values(player.abilities).some((v) => v.current !== null),
					scoreboard: player.kills !== null && player.deaths !== null && player.assists !== null
				};
				// Only confirmed WS team+slot carrier commands resolve a player marker.
				if (
					(wire._carrierTeam === 0 || wire._carrierTeam === 1) &&
					typeof wire._carrierPlayer === 'number'
				) {
					player.hasSpike = wire._carrierTeam === teamIndex && wire._carrierPlayer === slot;
				}
				return player;
			})
		};
	});
	state.spike.raw = scalar(wire.SpikeState, issues, 'SpikeState');
	state.spike.carrierRaw = scalar(wire.SpikeCarrier, issues, 'SpikeCarrier');
	if (state.teams.some((team) => team.players.some((player) => player.hasSpike)))
		state.spike.state = 'carried';
	state.roundHistory.leftRaw = string(wire.RoundHistoryTeam1, issues, 'RoundHistoryTeam1', 4096);
	state.roundHistory.rightRaw = string(wire.RoundHistoryTeam2, issues, 'RoundHistoryTeam2', 4096);
	const histories = [
		state.roundHistory.leftRaw?.split('|') ?? [],
		state.roundHistory.rightRaw?.split('|') ?? []
	];
	const reasons: LiveRoundResult['reason'][] = ['defuse', 'elimination', 'time', 'detonation'];
	for (let index = 0; index < Math.max(histories[0].length, histories[1].length); index++) {
		const a = histories[0][index],
			b = histories[1][index];
		if (
			a === undefined ||
			b === undefined ||
			!/^[0-4]$/.test(a) ||
			!/^[0-4]$/.test(b) ||
			(a !== '0' && b !== '0')
		) {
			issues.push(`round ${index + 1}: malformed or conflicting history`);
			continue;
		}
		if (a !== '0' || b !== '0')
			state.rounds.push({
				round: index + 1,
				winnerProviderSide: a !== '0' ? 'left' : 'right',
				reason: reasons[Number(a !== '0' ? a : b) - 1]
			});
	}
	return finish(state, issues);
}
