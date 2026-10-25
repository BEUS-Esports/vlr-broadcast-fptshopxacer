// chèn nền + khung chung cho scene fullscreen
const ARTS = ['jett', 'reyna', 'neon', 'sova', 'omen', 'viper', 'raze', 'clove', 'iso', 'killjoy'];
window.frame = (delay = 0, art) => `
  <div class="bg"><img class="baked" src="assets/bg/${art || ARTS[(location.pathname.length * 7) % ARTS.length]}.jpg" alt=""></div>
  <div class="foot a-fade" style="animation-delay:${delay + 0.6}s"><span>${GFX.event}</span><span>VALORANT <b>//</b> ${GFX.stage}</span></div>
  <div class="frame a-fade" style="animation-delay:${delay}s">
    <i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>
    <i class="dl dash-v"></i><i class="dr dash-v"></i><i class="tick t"></i><i class="tick b"></i></div>`;
window.PL = [
	'MUNCHKIN',
	'MAKO',
	'JREMY',
	'JEMKIN',
	'MEIYY',
	'T3XTURE',
	'SOMETHING',
	'JINGGG',
	'RUSS',
	'YAY',
	'NDG',
	'LENNE',
	'KAROON',
	'FOXY9',
	'SAYAPLAYER',
	'BUZZ',
	'FORSAKEN',
	'CARPE',
	'STAX',
	'ZEST'
];
window.TM = [
	['GEN', 'Gen.G'],
	['T1', 'T1'],
	['TS', 'Team Secret'],
	['GE', 'Global Esports'],
	['BLD', 'Bleed'],
	['PRX', 'Paper Rex'],
	['DRX', 'DRX'],
	['ZETA', 'ZETA DIVISION'],
	['TLN', 'Talon'],
	['RRQ', 'Rex Regum Qeon'],
	['DFM', 'DetonatioN FM']
];
window.img = (i) => `assets/players/p${(((i % 20) + 20) % 20) + 1}.png`;
// logo đội giả: ô màu + tag (thay bằng logo thật khi có)
window.TC = {
	GEN: '#c9a34a',
	T1: '#e2012d',
	TS: '#9aa6b0',
	GE: '#3b6fd8',
	BLD: '#d1342f',
	PRX: '#c94db0',
	DRX: '#3b7dd8',
	ZETA: '#8a8f99',
	TLN: '#e2322b',
	RRQ: '#f2a516',
	DFM: '#3a5bd9'
};
window.logo = (tag, size = 50) =>
	`<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:${TC[tag] || '#3ad7dc'};color:#fff;font-family:var(--display);font-weight:900;font-size:${size * 0.34}px;clip-path:polygon(15% 0,100% 0,85% 100%,0 100%)">${tag}</span>`;

// ===== dữ liệu thật để test: logo + ảnh tuyển thủ từ vlr.gg (assets/real) =====
(function () {
	// assets/real/real.js (tuỳ chọn, chỉ để test nội bộ) không có thì dùng đội/tuyển thủ giả + ô placeholder
	const SIL =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125"><rect width="100" height="125" fill="#1d4757"/><circle cx="50" cy="44" r="20" fill="#3a6f80"/><path d="M12 125c4-30 20-44 38-44s34 14 38 44z" fill="#3a6f80"/></svg>'
		);
	const R =
		window.REAL_DATA ||
		Object.fromEntries(
			['GEN', 'T1', 'PRX', 'DRX', 'TS', 'GE', 'BLD', 'ZETA', 'TLN', 'RRQ', 'DFM'].map((tag) => [
				tag,
				{
					name: tag,
					logo: null,
					players: Array.from({ length: 5 }, (_, i) => ({ ign: `${tag} P${i + 1}`, img: SIL }))
				}
			])
		);
	window.REAL = R;
	const all = [];
	for (const [tag, t] of Object.entries(R)) for (const p of t.players) all.push({ ...p, tag });
	window.PL = all.map((p) => p.ign.toUpperCase());
	window.PT = all.map((p) => p.tag);
	window.img = (i) => all[((i % all.length) + all.length) % all.length].img;
	// tuyển thủ thứ k của đội tag
	window.pick = (tag, k = 0) => {
		const p = R[tag].players;
		return p[k % p.length];
	};
	window.TM = Object.entries(R).map(([tag, t]) => [tag, t.name]);
	window.logo = (tag, size = 50) =>
		R[tag]?.logo
			? `<img src="${R[tag].logo}" style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle" alt="${tag}">`
			: `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:#3ad7dc;color:#04161d;font:900 ${Math.round(size * 0.32)}px var(--display)">${tag}</span>`;
})();
