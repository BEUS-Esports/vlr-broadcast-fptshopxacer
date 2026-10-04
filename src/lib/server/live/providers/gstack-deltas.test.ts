import { describe, expect, it } from 'vitest';
import { gstackFixture } from '#lib/live/fixtures.ts';
import { createGStackAccumulator, normalizeGStack, parseGStackMessage } from './gstack';

const context = { generation: 1, selectedGameId: 'game-1', receivedAt: 1000 };

describe('GStack safe command protocol', () => {
	it('parses literal quoted commas and escaped quotes without executing input', () => {
		expect(parseGStackMessage("[ExecuteScript]: SetNamePlayer(0,1,'O\\'Brien, A');")).toEqual({
			kind: 'script',
			name: 'SetNamePlayer',
			args: [0, 1, "O'Brien, A"]
		});
	});
	it.each([
		'[ExecuteJSON]: {"Logos":{"left":"logo"}}',
		'[ExecuteJSON]: {"Scoreboard":{"FutureField":{"value":1}}}',
		'[ExecuteJSON]: {"Team_Left":{"Player1":{"FutureField":true}}}',
		'[ExecuteScript]: SetRefreshLogos(1)'
	])('classifies unsupported protocol data as diagnostic only: %s', (message) => {
		expect(parseGStackMessage(message).kind).toBe('unsupported');
		const accumulator = createGStackAccumulator();
		accumulator.seed(gstackFixture());
		const before = accumulator.getSnapshot();
		expect(accumulator.apply(message).accepted).toBe(false);
		expect(accumulator.getSnapshot()).toEqual(before);
		expect(accumulator.getDiagnostics().lastUnknownMessage).toBe(message);
	});
	it.each([
		'[ExecuteJSON]: {',
		'[ExecuteJSON]: {"Scoreboard":[]}',
		'[ExecuteJSON]: {"Team_Left":{"Player1":{"Creds":{}}}}'
	])('classifies malformed known JSON as invalid: %s', (message) => {
		expect(parseGStackMessage(message).kind).toBe('invalid');
	});
	it('retains skill capacity across deltas and clears unavailable pairs on resync', () => {
		const accumulator = createGStackAccumulator();
		accumulator.seed(gstackFixture());
		const ability = () =>
			normalizeGStack(accumulator.getSnapshot(), context).state!.teams[0].players[0].abilities
				.grenade;
		accumulator.apply('[ExecuteScript]: SetSkillsPoints(0,0,1,1,2)');
		expect(ability()).toEqual({ current: 1, capacity: 2 });
		accumulator.apply('[ExecuteScript]: SetPlayerHP(0,1,50)');
		expect(ability()).toEqual({ current: 1, capacity: 2 });
		accumulator.apply('[ExecuteScript]: SetSkillsPoints(0,0,1,0,2)');
		expect(ability()).toEqual({ current: 0, capacity: 2 });
		expect(accumulator.apply('[ExecuteScript]: SetSkillsPoints(0,0,1,3,2)').accepted).toBe(false);
		expect(ability()).toEqual({ current: 0, capacity: 2 });
		accumulator.apply("[ExecuteScript]: SetSkillsPoints(0,0,1,'','')");
		expect(ability()).toEqual({ current: null, capacity: null });
		accumulator.apply('[ExecuteScript]: SetSkillsPoints(0,0,1,2,2)');
		accumulator.seed(gstackFixture());
		expect(ability()).toEqual({ current: null, capacity: null });
	});
	it.each([
		"[ExecuteScript]: SetPlayerKDA(0,1,'1','2','3'); globalThis.compromised=true",
		'[ExecuteScript]: SetPlayerHP(0,1,process.exit())',
		'[ExecuteScript]: constructor(0,1,1)',
		'[ExecuteScript]: SetPlayerHP(2,1,50)',
		'[ExecuteScript]: SetPlayerHP(0,0,50)',
		'[ExecuteScript]: SetPlayerHP(0,1,150)',
		'[ExecuteScript]: SetUltiPoints(0,1,8,2)',
		'[ExecuteScript]: SetSkillsPoints(0,3,1,1,2)',
		'[ExecuteScript]: SetNamePlayer(0,1,`${process.env.SECRET}`)',
		'[ExecuteJSON]: {"Team_Left":{"__proto__":{"polluted":true}}}',
		'[ExecuteJSON]: {"constructor":{}}'
	])('rejects invalid protocol payload %s', (message) => {
		expect(parseGStackMessage(message).kind).toBe('invalid');
	});
	it('replaces snapshots and applies only relevant deltas, retaining explicit carrier commands', () => {
		const accumulator = createGStackAccumulator();
		expect(accumulator.seed(gstackFixture()).accepted).toBe(true);
		for (const message of [
			"SetPlayerKDA(0,1,'3','0','1')",
			"SetPlayerHP(0,1,'0')",
			"SetPlayerShield(0,1,'R')",
			"SetExtraData(0,1,'20','0')",
			'SetSkillsPoints(0,2,1,0,2)',
			'SetUltiPoints(0,1,2,8)',
			'SetUltiActive(0,1,1)',
			'SetRound(3,4)',
			'SpikeTeam(0)',
			'SpikePlayer(1)'
		])
			expect(accumulator.apply(`[ExecuteScript]: ${message}`).accepted).toBe(true);
		const state = normalizeGStack(accumulator.getSnapshot(), context).state!;
		expect(state.teams[0].score).toBe(3);
		expect(state.teams[1].score).toBe(4);
		expect(state.teams[0].players[0]).toMatchObject({
			health: 0,
			alive: null,
			kills: 3,
			hasSpike: true,
			extraHealth: 20,
			shield: { kind: 'regen', current: null, extra: 0 },
			ultimate: { ready: true, current: 2, required: 8 },
			abilities: { ability2: { current: 0, capacity: 2 } }
		});
		expect(state.spike.state).toBe('carried');
		expect(accumulator.seed(gstackFixture()).accepted).toBe(true);
		expect(
			normalizeGStack(accumulator.getSnapshot(), context).state?.teams[0].players[0].hasSpike
		).toBeNull();
	});
	it('does not publish deltas before synchronization and refuses unsafe or unknown mutations', () => {
		const accumulator = createGStackAccumulator();
		expect(accumulator.apply('[ExecuteScript]: SetRound(1,2)').accepted).toBe(false);
		accumulator.seed(gstackFixture());
		const before = accumulator.getSnapshot();
		expect(accumulator.apply('[ExecuteScript]: SetRefreshLogos(1)').accepted).toBe(false);
		expect(accumulator.getSnapshot()).toEqual(before);
		expect(accumulator.getDiagnostics().lastUnknownMessage).toContain('SetRefreshLogos');
		expect(accumulator.seed({ TeamLeft: 'bad', TeamRight: [] }).accepted).toBe(false);
		expect(accumulator.getSnapshot()).toEqual(before);
	});
	it('merges allowlisted ExecuteJSON fields atomically and isolates returned snapshots', () => {
		const accumulator = createGStackAccumulator();
		accumulator.seed(gstackFixture());
		const message =
			'[ExecuteJSON]: {"Team_Left":{"Player1":{"Creds":"0","token":"secret"}},"Scoreboard":{"ScoreTeamRight":"2"},"Spike":{"SpikeState":"1"},"unknown":{"anything":"secret"}}';
		expect(accumulator.apply(message).accepted).toBe(true);
		const state = normalizeGStack(accumulator.getSnapshot(), context).state!;
		expect(state.teams[0].players[0].credits).toBe(0);
		expect(state.teams[1].score).toBe(2);
		expect(state.spike).toMatchObject({ state: 'unknown', raw: '1' });
		expect(JSON.stringify(accumulator.getSnapshot())).not.toContain('secret');
		const copy = accumulator.getSnapshot() as Record<string, unknown>;
		copy.ScoreTeamRight = '99';
		expect(normalizeGStack(accumulator.getSnapshot(), context).state?.teams[1].score).toBe(2);
		const before = accumulator.getSnapshot();
		expect(
			accumulator.apply(
				'[ExecuteJSON]: {"Scoreboard":{"ScoreTeamRight":"3"},"Team_Left":{"Player1":{"Creds":{}}}}'
			).accepted
		).toBe(false);
		expect(accumulator.getSnapshot()).toEqual(before);
	});
});
