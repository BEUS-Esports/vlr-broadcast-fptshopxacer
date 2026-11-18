import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { normalizeSpectra } from './spectra';
import { names, scenario } from '../../../../../scripts/fake-spectra-scenarios.mjs';

const raw = JSON.parse(readFileSync('docs/spectra-matchData.example.json', 'utf8'));
const base = JSON.parse(raw[1]);
const context = { generation: 1, selectedGameId: null, receivedAt: 0 };
const normalize = (name: string, tick = 3) =>
	normalizeSpectra(JSON.stringify(scenario(base, name, tick)), context);

it.each(names as string[])('fake Spectra %s scenario normalizes without issues', (name) => {
	const { state, issues } = normalize(name);
	expect(issues).toEqual([]);
	expect(state?.teams).toHaveLength(2);
	expect(state?.teams.flatMap((team) => team.players)).toHaveLength(10);
});

it('fake Spectra scenarios reach the states the HUD must show', () => {
	expect(normalize('buy').state?.phase).toBe('buy');
	expect(normalize('combat').state?.phase).toBe('combat');
	expect(normalize('planted').state?.spike.state).toBe('planted');
	expect(normalize('detonated').state?.spike.state).toBe('detonated');
	expect(normalize('defused').state?.spike.state).toBe('defused');
	const alive = (name: string) =>
		normalize(name).state!.teams.map((team) => team.players.filter((p) => p.alive).length);
	expect(alive('clutch')).toEqual([1, 2]);
	expect(alive('wipe')).toEqual([0, 5]);
	const overtime = normalize('overtime').state!;
	expect(overtime.roundNumber).toBe(31);
	expect(overtime.rounds).toHaveLength(30);
	const player = normalize('combat').state!.teams[1].players[2];
	expect(player.health).not.toBeNull();
	expect(player.abilities.grenade.current).not.toBeNull();
	expect(
		normalize('combat')
			.state!.teams.flatMap((t) => t.players)
			.filter((p) => p.observed)
	).toHaveLength(1);
});
