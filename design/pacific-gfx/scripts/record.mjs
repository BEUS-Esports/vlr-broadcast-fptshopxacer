// Quay chính xác từng khung 60fps (tua GSAP + CSS animation) → MP4 + GIF trong design/pacific-gfx/out. Cần ffmpeg.
// node design/pacific-gfx/scripts/record.mjs [scene ...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCENES = {
	'map-update': 4.6,
	'prize-pool': 4.6,
	'ace-players': 4.6,
	'patch-notes': 4.6,
	groups: 4.6,
	'championship-points': 4.6,
	playoffs: 4.6,
	schedule: 4.6,
	winner: 6.5,
	transition: 4.5
};
const FPS = 60;
const list = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
const OUT = path.join(ROOT, 'out');
const TMP = path.join(OUT, '.frames');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const s of list) {
	fs.rmSync(TMP, { recursive: true, force: true });
	fs.mkdirSync(TMP, { recursive: true });
	await page.goto(pathToFileURL(path.join(ROOT, `${s}.html`)).href, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.__ready === true);
	await page.evaluate(() => {
		window.__tl?.pause(0);
		document.getAnimations().forEach((a) => a.pause());
	});
	const n = Math.round(SCENES[s] * FPS);
	for (let i = 0; i < n; i++) {
		await page.evaluate((t) => {
			window.__tl?.seek(t, false);
			document.getAnimations().forEach((a) => {
				a.pause();
				a.currentTime = t * 1000;
			});
		}, i / FPS);
		await page.screenshot({
			path: path.join(TMP, `${String(i).padStart(4, '0')}.jpg`),
			type: 'jpeg',
			quality: 90
		});
	}
	const seq = path.join(TMP, '%04d.jpg');
	execFileSync('ffmpeg', [
		'-v',
		'error',
		'-y',
		'-framerate',
		`${FPS}`,
		'-i',
		seq,
		'-c:v',
		'libx264',
		'-crf',
		'16',
		'-pix_fmt',
		'yuv420p',
		path.join(OUT, `${s}.mp4`)
	]);
	execFileSync('ffmpeg', [
		'-v',
		'error',
		'-y',
		'-framerate',
		`${FPS}`,
		'-i',
		seq,
		'-vf',
		'fps=30,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a',
		path.join(OUT, `${s}.gif`)
	]);
	console.log('ok', s);
}
fs.rmSync(TMP, { recursive: true, force: true });
await browser.close();
