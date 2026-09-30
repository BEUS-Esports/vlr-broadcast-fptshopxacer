import { mkdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fork } from 'node:child_process';
import { once } from 'node:events';

export default async function setup() {
	await mkdir(process.env.ASSET_DIR!, { recursive: true });
	// Own one app process directly: Windows process-tree shutdown requires permissions
	// unavailable in restricted runners. IPC also closes every app DB handle on exit.
	const app = fork(new URL('./server.mjs', import.meta.url), {
		stdio: ['ignore', 'ignore', 'inherit', 'ipc']
	});
	try {
		await Promise.race([
			once(app, 'message', { signal: AbortSignal.timeout(120_000) }),
			once(app, 'exit').then(([code]) => {
				throw new Error(`Test app exited before ready (${code}).`);
			})
		]);
	} catch (cause) {
		app.kill();
		throw cause;
	}
	return async () => {
		const exited = once(app, 'exit');
		app.send('stop');
		await exited;
		const directory = resolve(process.env.VLR_E2E_DIR!);
		if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('vlr-e2e-'))
			throw new Error('Refusing to remove an unexpected test directory.');
		await rm(directory, { recursive: true, force: true });
	};
}
