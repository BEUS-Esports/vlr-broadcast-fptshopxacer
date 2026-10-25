// Tải tài nguyên (không commit) vào design/pacific-gfx/assets: agent, map (valorant-api), GSAP, rồi nướng nền.
// node design/pacific-gfx/scripts/setup.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const A = (p) => path.join(ROOT, 'assets', p);
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const save = async (url, file) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const r = await fetch(url);
	if (!r.ok) throw new Error(`${r.status} ${url}`);
	fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
};

const agents = (
	await (await fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true')).json()
).data;
for (const a of agents) {
	await save(a.displayIcon, A(`agents/${key(a.displayName)}.png`));
	if (a.fullPortrait) await save(a.fullPortrait, A(`agents/full/${key(a.displayName)}.png`));
}
const maps = (await (await fetch('https://valorant-api.com/v1/maps')).json()).data;
for (const m of maps) {
	const url = m.listViewIconTall || m.splash;
	if (url) await save(url, A(`maps/${key(m.displayName)}.png`));
}
await save(
	'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
	A('vendor/gsap.min.js')
);
console.log(`${agents.length} agents, ${maps.length} maps, gsap`);

// nền xoáy nướng sẵn thành ảnh tĩnh → OBS nhẹ, chuyển động mượt
const ARTS = ['jett', 'reyna', 'neon', 'sova', 'omen', 'viper', 'raze', 'clove', 'iso', 'killjoy'];
fs.mkdirSync(A('bg'), { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const art of ARTS) {
	await page.goto(`${pathToFileURL(path.join(ROOT, 'bake.html')).href}?art=${art}`, {
		waitUntil: 'networkidle'
	});
	await page.screenshot({ path: A(`bg/${art}.jpg`), type: 'jpeg', quality: 90 });
}
await browser.close();
console.log('baked', ARTS.length, 'backgrounds');
