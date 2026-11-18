import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findDuplicates } from './find-profile-duplicates.mjs';

test('reports case-insensitive team clashes', () => {
	const lines = findDuplicates({
		teams: [
			{ id: '1', name: 'Alpha', tag: 'ALP' },
			{ id: '2', name: 'alpha', tag: 'X' }
		],
		players: []
	});
	assert.equal(lines.length, 1);
	assert.match(lines[0], /Alpha/);
	assert.match(lines[0], /alpha/);
});

test('treats NFD and NFC variants as the same player', () => {
	const lines = findDuplicates({
		teams: [],
		players: [
			{ id: '1', display_name: 'Thắng'.normalize('NFC'), riot_id: null },
			{ id: '2', display_name: 'Thắng'.normalize('NFD'), riot_id: null }
		]
	});
	assert.equal(lines.length, 1);
});

test('reports nothing when profiles are distinct', () => {
	assert.deepEqual(
		findDuplicates({
			teams: [{ id: '1', name: 'A', tag: 'A' }],
			players: [{ id: '1', display_name: 'P', riot_id: null }]
		}),
		[]
	);
});
