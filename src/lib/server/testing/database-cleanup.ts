import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export default async function setup() {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-test-cleanup-'));
	const manifest = join(directory, 'directories.txt');
	await writeFile(manifest, '');
	process.env.VLR_TEST_CLEANUP = manifest;
	return async () => {
		const paths = (await readFile(manifest, 'utf8')).split('\n').filter(Boolean);
		for (const path of paths) {
			const target = resolve(path);
			if (
				!target.startsWith(resolve(tmpdir()) + sep) ||
				!target.split(sep).at(-1)?.startsWith('vlr-')
			)
				throw new Error('Invalid test cleanup directory');
			await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		}
		await rm(directory, { recursive: true, force: true });
	};
}
