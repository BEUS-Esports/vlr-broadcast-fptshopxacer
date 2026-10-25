// TUỲ CHỌN, chỉ test nội bộ: logo đội + ảnh tuyển thủ từ vlr.gg → assets/real (không commit, không dùng phát sóng).
// node design/pacific-gfx/scripts/fetch-real.mjs
import fs from 'node:fs';
import path from 'node:path';
process.chdir(path.resolve(import.meta.dirname, '..'));
fs.mkdirSync('assets/real', { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' };
const TEAMS = {
	GEN: 17,
	T1: 14,
	PRX: 624,
	DRX: 8185,
	TS: 6199,
	GE: 918,
	BLD: 6387,
	ZETA: 5448,
	TLN: 8304,
	RRQ: 878,
	DFM: 278
};
const get = async (u) => (await fetch(u, { headers: UA })).text();
const save = async (u, f) => {
	const r = await fetch(u.startsWith('//') ? 'https:' + u : u, { headers: UA });
	if (!r.ok) return false;
	fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
	return true;
};
const out = {};
for (const [tag, id] of Object.entries(TEAMS)) {
	const h = await get(`https://www.vlr.gg/team/${id}`);
	const name = (h.match(/<h1 class="wf-title"[^>]*>\s*([^<]+?)\s*</) || [])[1] || tag;
	const logo = (h.match(/team-header-logo">\s*<img src="([^"]+)"/) ||
		h.match(/(\/\/owcdn\.net\/img\/[a-z0-9]+\.png)/) ||
		[])[1];
	const lf = `assets/real/${tag}.png`;
	if (logo) await save(logo, lf);
	const players = [];
	const seen = new Set();
	for (const m of h.matchAll(/href="\/player\/(\d+)\/([^"]+)"/g)) {
		if (seen.has(m[1]) || players.length >= 5) continue;
		seen.add(m[1]);
		const ph = await get(`https://www.vlr.gg/player/${m[1]}/${m[2]}`);
		const ign = (ph.match(/<h1 class="wf-title"[^>]*>\s*([^<]+?)\s*</) || [])[1] || m[2];
		const img = (ph.match(/wf-avatar mod-player[\s\S]{0,400}?<img src="([^"]+)"/) || [])[1];
		if (!img || /ph\/sil/.test(img)) continue;
		const f = `assets/real/${tag}_${players.length}.png`;
		if (await save(img, f)) players.push({ ign, img: f });
	}
	out[tag] = { name, logo: logo ? lf : null, players };
	console.log(tag, name, !!logo, players.map((p) => p.ign).join(', '));
}
fs.writeFileSync('assets/real/real.js', 'window.REAL_DATA=' + JSON.stringify(out) + ';');
