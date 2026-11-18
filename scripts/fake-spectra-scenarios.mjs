// @ts-nocheck -- dev-only script; typed through the Spectra normalizer test.
// Pure scenario builder for scripts/fake-spectra.mjs; tested through the real Spectra normalizer.

const abilities = [
	{ grenade: 1, ability1: 2, ability2: 1 },
	{ grenade: 0, ability1: 1, ability2: 1 },
	{ grenade: 2, ability1: 0, ability2: 1 },
	{ grenade: 1, ability1: 1, ability2: 0 },
	{ grenade: 0, ability1: 2, ability2: 1 }
];
const weapons = ['Vandal', 'Phantom', 'Operator', 'Spectre', 'Sheriff'];
const armors = ['Heavy', 'Light', 'Regen', 'Heavy', 'None'];

/** Spectra roundRecord for `played` rounds; `upcoming` fills to `total`. */
function record(teamIndex, played, total, wasAttack) {
	return Array.from({ length: total }, (_, i) => {
		const round = i + 1;
		if (round > played) return { type: 'upcoming', wasAttack, round };
		const winner = (round * 7 + 3) % 5 < 3 ? 0 : 1;
		const types = ['kills', 'detonated', 'defused', 'timeout'];
		return { type: winner === teamIndex ? types[round % 4] : 'lost', wasAttack, round };
	});
}

/**
 * Returns a fresh match_data object for one scenario.
 * `tick` animates health and credits so the HUD visibly updates every second.
 */
export function scenario(base, name, tick) {
	const data = structuredClone(base);
	const round = name === 'overtime' ? 31 : 14;
	const played = round - 1;
	data.roundNumber = round;
	data.roundPhase = name === 'buy' ? 'shopping' : 'combat';
	data.hasEnteredOvertime = name === 'overtime';
	data.spikeState = {
		planted: ['planted', 'detonated', 'defused'].includes(name),
		detonated: name === 'detonated',
		defused: name === 'defused'
	};
	let observed = false;
	data.teams.forEach((team, t) => {
		team.roundRecord = record(t, played, Math.max(25, played + 1), team.isAttacking);
		team.roundsWon = team.roundRecord.filter(
			(r) => r.type !== 'lost' && r.type !== 'upcoming'
		).length;
		team.players.forEach((player, p) => {
			const dead =
				name === 'buy' || name === 'overtime'
					? false
					: name === 'wipe'
						? t === 0
						: name === 'clutch'
							? t === 0
								? p > 0
								: p > 1
							: p === (t + tick) % 5 && p < 2;
			player.isAlive = !dead;
			player.health = dead
				? 0
				: name === 'buy'
					? 100
					: Math.max(1, 100 - ((tick * 13 + p * 29 + t * 7) % 99));
			player.abilities =
				name === 'buy' || dead ? { grenade: 0, ability1: 0, ability2: 0 } : abilities[p];
			if (name === 'buy') player.abilities = abilities[p];
			player.auxiliaryAvailable = { health: true, abilities: true, scoreboard: true };
			player.scoreboardAvailable = true;
			player.highestWeapon = dead ? 'Classic' : weapons[p];
			player.armorName = dead ? 'None' : armors[p];
			player.money = name === 'buy' ? 3900 - p * 300 + (tick % 5) * 100 : 600 + p * 150;
			player.hasSpike =
				t === (data.teams[0].isAttacking ? 0 : 1) && p === 0 && !dead && !data.spikeState.planted;
			player.isObserved = !observed && !dead && t === 1;
			if (player.isObserved) observed = true;
			player.currUltPoints = (p + tick) % (player.maxUltPoints + 1);
			player.ultReady = player.currUltPoints === player.maxUltPoints;
		});
	});
	return data;
}

export const names = [
	'buy',
	'combat',
	'planted',
	'detonated',
	'defused',
	'clutch',
	'wipe',
	'overtime'
];
