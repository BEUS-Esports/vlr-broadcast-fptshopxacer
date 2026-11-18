#!/usr/bin/env node
// Dev-only fake ValoSpectra server for rehearsing the provider HUD without a live match.
// Settings → Spectra region "custom", host http://localhost (socket port 5200 is implied), any group code.
// Keys: 1-8 pick a scenario, a toggles auto-cycle, q quits.
import { readFileSync } from 'node:fs';
import { Server } from 'socket.io';
import { names, scenario } from './fake-spectra-scenarios.mjs';

const port = Number(process.env.FAKE_SPECTRA_PORT ?? 5200);
const file = process.argv[2] ?? 'docs/spectra-matchData.example.json';
const raw = JSON.parse(readFileSync(file, 'utf8'));
const base = JSON.parse(
	Array.isArray(raw) ? raw[1] : typeof raw === 'string' ? raw : JSON.stringify(raw)
);

let current = 'buy';
let auto = false;
let tick = 0;
let sinceSwitch = 0;

const io = new Server(port, { cors: { origin: '*' } });
io.on('connection', (socket) => {
	console.log(`client connected (${socket.conn.transport.name})`);
	socket.on('logon', (payload) => {
		console.log(`logon ${payload}`);
		socket.emit('logon_success', JSON.stringify({ groupCode: 'FAKE' }));
		socket.join('match');
	});
	socket.on('disconnect', (reason) => console.log(`client disconnected: ${reason}`));
});
setInterval(() => {
	tick++;
	if (auto && ++sinceSwitch >= 8) {
		current = names[(names.indexOf(current) + 1) % names.length];
		sinceSwitch = 0;
		console.log(`scenario → ${current}`);
	}
	io.to('match').emit('match_data', JSON.stringify(scenario(base, current, tick)));
}, 1000);

console.log(`fake Spectra on http://localhost:${port}/ — scenario ${current}`);
console.log(`keys: ${names.map((n, i) => `${i + 1}=${n}`).join(' ')}  a=auto-cycle  q=quit`);
if (process.stdin.isTTY) {
	process.stdin.setRawMode(true);
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', (key) => {
		if (key === 'q' || key === '\u0003') process.exit(0);
		if (key === 'a') {
			auto = !auto;
			sinceSwitch = 0;
			console.log(`auto-cycle ${auto ? 'on' : 'off'}`);
		}
		const picked = names[Number(key) - 1];
		if (picked) {
			current = picked;
			console.log(`scenario → ${current}`);
		}
	});
}
