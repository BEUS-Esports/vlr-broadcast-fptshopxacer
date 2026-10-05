import { describe, expect, it } from 'vitest';
import { decodeLiveGameEnvelope, isLiveGameState } from './decoder';
import { liveGameFixture, liveSessionFixture } from './fixtures';

function envelope() {
	return {
		version: 1,
		stream: { epoch: 'test', sequence: 0 },
		state: liveGameFixture(),
		status: liveSessionFixture()
	};
}

describe('live envelope decoder', () => {
	it('accepts the complete nullable contract and zero values', () => {
		const value = envelope();
		expect(decodeLiveGameEnvelope(JSON.stringify(value))).toEqual(value);
		expect(isLiveGameState(value.state)).toBe(true);
	});
	it('rejects malformed JSON and incomplete nested values', () => {
		expect(decodeLiveGameEnvelope('{')).toBeNull();
		const value = envelope();
		delete (value.state.spike as Partial<typeof value.state.spike>).carrierRaw;
		expect(decodeLiveGameEnvelope(JSON.stringify(value))).toBeNull();
	});
	it('validates nullable ability charge pairs without inventing capacity', () => {
		const value = envelope();
		const ability = value.state.teams[0].players[0].abilities;
		Object.assign(ability, { grenade: { current: 0, capacity: 2 } });
		expect(isLiveGameState(value.state)).toBe(true);
		Object.assign(ability, { grenade: { current: 2, capacity: null } });
		expect(isLiveGameState(value.state)).toBe(true);
		for (const grenade of [
			{ current: 3, capacity: 2 },
			{ current: 0, capacity: 0 },
			{ current: -1, capacity: 2 },
			{ current: 0.5, capacity: 2 },
			{ current: 0 },
			{ current: 0, capacity: 2, token: 'secret' }
		]) {
			Object.assign(ability, { grenade });
			expect(isLiveGameState(value.state)).toBe(false);
		}
	});
	it('rejects credential or unexpected properties anywhere', () => {
		const value = envelope();
		Object.assign(value.state.teams[0].players[0].shield, { accessKey: 'secret' });
		expect(decodeLiveGameEnvelope(JSON.stringify(value))).toBeNull();
	});
	it('rejects invalid ranges, duplicate provider identities and unbounded strings', () => {
		const value = envelope();
		value.state.teams[0].players[0].health = -1;
		expect(isLiveGameState(value.state)).toBe(false);
		value.state.teams[0].players[0].health = 0;
		value.state.teams[1].players[0].providerKey = value.state.teams[0].players[0].providerKey;
		expect(isLiveGameState(value.state)).toBe(false);
		const fresh = envelope();
		fresh.state.map = 'a'.repeat(513);
		expect(isLiveGameState(fresh.state)).toBe(false);
	});
	it('supports status-only events but refuses mixed generations', () => {
		expect(decodeLiveGameEnvelope(JSON.stringify({ ...envelope(), state: null }))).not.toBeNull();
		const value = envelope();
		value.status.generation++;
		expect(decodeLiveGameEnvelope(JSON.stringify(value))).toBeNull();
	});
});
