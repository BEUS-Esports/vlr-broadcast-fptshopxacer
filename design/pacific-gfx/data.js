// Dữ liệu mẫu cho bản thiết kế (giả lập, chưa nối dữ liệu thật)
window.GFX = {
	event: 'BEUS GRAPH TEST',
	stage: 'UPPER FINAL',
	bestOf: 3,
	map: { key: 'ascent', name: 'Ascent', game: 2 },
	teams: {
		a: { tag: 'ALP', name: 'TEAM ALPHA', score: 13, series: 1, color: '#3ad7dc' },
		b: { tag: 'BRV', name: 'TEAM BRAVO', score: 9, series: 1, color: '#ff4655' }
	},
	players: {
		a: [
			['Rook', 'jett'],
			['Vanta', 'omen'],
			['Kestrel', 'sova'],
			['Juno', 'killjoy'],
			['Pyre', 'raze']
		],
		b: [
			['Ashen', 'cypher'],
			['Morrow', 'viper'],
			['Tide', 'breach'],
			['Quill', 'neon'],
			['Ember', 'fade']
		]
	},
	// thứ tự veto BO3: ban, ban, pick, pick, ban, ban, decider
	veto: [
		{ team: 'a', act: 'ban', map: 'split' },
		{ team: 'b', act: 'ban', map: 'bind' },
		{ team: 'a', act: 'pick', map: 'lotus', side: { team: 'b', choice: 'DEFENSE' } },
		{ team: 'b', act: 'pick', map: 'ascent', side: { team: 'a', choice: 'ATTACK' } },
		{ team: 'a', act: 'ban', map: 'sunset' },
		{ team: 'b', act: 'ban', map: 'pearl' },
		{ team: null, act: 'decider', map: 'haven', side: { team: 'a', choice: 'ATTACK' } }
	],
	winner: 'a'
};
window.cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// chèn delay animation: d(0.4) → style
window.d = (s) => `animation-delay:${s.toFixed(2)}s`;
