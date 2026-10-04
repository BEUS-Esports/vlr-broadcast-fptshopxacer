import { describe, expect, it } from 'vitest';
import { gstackFixture, spectraFixture } from '#lib/live/fixtures.ts';
import { isLiveGameState } from '#lib/live/decoder.ts';
import { normalizeSpectra } from './spectra';
import { normalizeGStack } from './gstack';

const context = { generation: 1, selectedGameId: 'game-1', receivedAt: 1000 };

describe('provider normalizers', () => {
	it('namespaces stable Spectra identities separately from positional fallback keys', () => {
		const wire = spectraFixture();
		wire.teams[0].players[0].riotId = '';
		const result = normalizeSpectra(wire, context);
		expect(result.state?.teams[0].players[0].providerKey).toBe('slot:left:1');
		expect(result.state?.teams[1].players[0].providerKey).toBe('id:provider-right');
	});
	it.each(['25', '50'])(
		'keeps purchased GStack shield %s separate from measured current shield',
		(code) => {
			const wire = gstackFixture();
			wire.TeamLeft[0].Shield = code;
			const player = normalizeGStack(wire, context).state?.teams[0].players[0];
			expect(player?.shield).toMatchObject({
				raw: code,
				kind: code === '25' ? 'light' : 'heavy',
				current: null
			});
		}
	);
	it('keeps unknown Spectra phase and unsupported round reasons diagnostic only', () => {
		const wire = spectraFixture();
		wire.roundPhase = 'constructor';
		Object.assign(wire.teams[0], { roundRecord: [{ round: 1, type: 'constructor' }] });
		const result = normalizeSpectra(wire, context);
		expect(result.state?.phase).toBe('unknown');
		expect(result.state?.rounds).toEqual([]);
		expect(result.issues).toContain('roundRecord: unsupported outcome');
	});
	it('preserves explicit dictionary player slots and empty synchronized teams', () => {
		const raw = gstackFixture();
		const result = normalizeGStack(
			{ ...raw, TeamLeft: { Player3: raw.TeamLeft[0] }, TeamRight: {} },
			context
		);
		expect(result.state?.teams[0].players[0]).toMatchObject({
			providerKey: 'left:3',
			providerSlot: 3
		});
		expect(result.state?.teams[1].players).toEqual([]);
		expect(result.issues).toEqual([]);
	});
	it('uses actual Spectra serialized wire fields and independent capabilities', () => {
		const wire = spectraFixture();
		const first = wire.teams[0].players[0];
		first.health = 0;
		first.auxiliaryAvailable.abilities = true;
		wire.teams[1].players[0].auxiliaryAvailable.health = false;
		const result = normalizeSpectra(JSON.stringify(wire), context);
		expect(result.issues).toEqual([]);
		expect(isLiveGameState(result.state)).toBe(true);
		expect(result.state?.teams[0].players[0]).toMatchObject({
			providerKey: 'id:provider-left',
			health: 0,
			alive: true,
			credits: 800,
			abilities: { grenade: 0, ability1: 0, ability2: 0 }
		});
		expect(result.state?.teams[1].players[0].health).toBeNull();
	});
	it('normalizes equivalent confirmed observations from both providers', () => {
		const a = normalizeSpectra(spectraFixture(), context).state!.teams[0].players[0];
		const b = normalizeGStack(gstackFixture(), context).state!.teams[0].players[0];
		const comparable = (p: typeof a) => ({
			name: p.observedName,
			agent: p.agent,
			weapon: p.weapon,
			health: p.health,
			kills: p.kills,
			deaths: p.deaths,
			assists: p.assists,
			credits: p.credits,
			ultimate: p.ultimate,
			abilities: p.abilities,
			capabilities: p.capabilities,
			shieldKind: p.shield.kind
		});
		expect(comparable(a)).toEqual(comparable(b));
	});
	it('preserves blanks versus zero and never derives alive from HP or unchanged stats', () => {
		const wire = gstackFixture();
		Object.assign(wire.TeamLeft[0], {
			'HP%': '0',
			KDA: '0/0/0',
			Creds: '0',
			XHP: '',
			XShield: '',
			'Skill 1 Points': '0'
		});
		wire.TeamRight[0]['HP%'] = '';
		const result = normalizeGStack(wire, context);
		expect(result.issues).toEqual([]);
		expect(result.state?.teams[0].players[0]).toMatchObject({
			health: 0,
			alive: null,
			credits: 0,
			extraHealth: null,
			abilities: { grenade: 0 }
		});
		expect(result.state?.teams[1].players[0].health).toBeNull();
	});
	it('keeps regen equipment separate from measured shield and supports enhanced fields', () => {
		const wire = gstackFixture();
		Object.assign(wire.TeamLeft[0], {
			Shield: 'R',
			XHP: '20',
			XShield: '0',
			'HP%': '100',
			'Skill 2 Points': '1'
		});
		const player = normalizeGStack(wire, context).state!.teams[0].players[0];
		expect(player.shield).toEqual({ raw: 'R', kind: 'regen', current: null, extra: 0 });
		expect(player.health).toBe(100);
		expect(player.extraHealth).toBe(20);
		expect(player.capabilities).toMatchObject({
			enhancedHealth: true,
			enhancedShield: true,
			abilities: true
		});
	});
	it('requires complete KDA and ultimate pairs and bounds numeric text', () => {
		const wire = gstackFixture();
		Object.assign(wire.TeamLeft[0], {
			KDA: '2/1',
			'Ultimate Points': '8/2',
			Creds: '8e3',
			'HP%': '150'
		});
		const result = normalizeGStack(wire, context);
		expect(result.state?.teams[0].players[0]).toMatchObject({
			kills: null,
			deaths: null,
			assists: null,
			credits: null,
			health: null,
			ultimate: { current: null, required: null }
		});
		expect(result.issues.length).toBeGreaterThanOrEqual(4);
	});
	it('parses round reasons without inventing winners in conflicts or unsupported codes', () => {
		const wire = gstackFixture();
		wire.RoundHistoryTeam1 = '1|0|2|0|9';
		wire.RoundHistoryTeam2 = '0|3|4|4|0';
		wire.SpikeCarrier = '00000;10000';
		const result = normalizeGStack(wire, context);
		expect(result.state?.rounds).toEqual([
			{ round: 1, winnerProviderSide: 'left', reason: 'defuse' },
			{ round: 2, winnerProviderSide: 'right', reason: 'time' },
			{ round: 4, winnerProviderSide: 'right', reason: 'detonation' }
		]);
		expect(result.issues).toHaveLength(2);
		expect(result.state?.spike).toMatchObject({ carrierRaw: '00000;10000', carrierPlayerId: null });
	});
	it('rejects malformed roots and strips all nonallowlisted payload fields', () => {
		for (const input of [null, [], {}, '{', { TeamLeft: 'wrong', TeamRight: [] }]) {
			expect(normalizeGStack(input, context).state).toBeNull();
			expect(normalizeSpectra(input, context).state).toBeNull();
		}
		const wire = spectraFixture();
		Object.assign(wire, {
			accessKey: 'secret',
			groupSecret: 'secret',
			tools: { secret: 'secret' }
		});
		Object.assign(wire.teams[0].players[0], { token: 'secret', name: 'a'.repeat(513) });
		const result = normalizeSpectra(wire, context);
		expect(JSON.stringify(result.state)).not.toContain('secret');
		expect(result.state?.teams[0].players[0].observedName).toBeNull();
		expect(isLiveGameState(result.state)).toBe(true);
	});
});
