import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) =>
	readFile(fileURLToPath(new URL(`../broadcast/fixtures/${name}`, import.meta.url)));
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const streamOf = (...chunks: Uint8Array[]) =>
	new ReadableStream<Uint8Array>({
		pull(controller) {
			const chunk = chunks.shift();
			if (chunk) controller.enqueue(chunk);
			else controller.close();
		}
	});
const bytesOf = async (body: ReadableStream) =>
	new Uint8Array(await new Response(body).arrayBuffer());

let directory: string;
let assetDir: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'vlr-stinger-files-'));
	assetDir = join(directory, 'assets');
	vi.stubEnv('ASSET_DIR', assetDir);
	vi.resetModules();
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(directory, { recursive: true, force: true });
});

describe('stingerType', () => {
	it('accepts WebM, WebP and AVIF', async () => {
		const { stingerType } = await import('./assets');
		expect(stingerType(await fixture('stinger.webm'))).toEqual({
			extension: 'webm',
			mime: 'video/webm',
			kind: 'video'
		});
		expect(stingerType(await fixture('stinger.webp'))).toEqual({
			extension: 'webp',
			mime: 'image/webp',
			kind: 'image'
		});
		const avif = new Uint8Array([0, 0, 0, 0x1c, ...ascii('ftypavif')]);
		expect(stingerType(avif)).toEqual({ extension: 'avif', mime: 'image/avif', kind: 'image' });
	});

	it('rejects PNG, MOV and short input', async () => {
		const { stingerType } = await import('./assets');
		const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
		const mov = new Uint8Array([0, 0, 0, 0x14, ...ascii('ftypqt  ')]);
		for (const head of [png, mov, new Uint8Array(), new Uint8Array([0x1a, 0x45])])
			expect(() => stingerType(head)).toThrow(
				expect.objectContaining({ code: 'invalid', message: 'Use a WebM, WebP or AVIF stinger.' })
			);
	});
});

describe('saveStingerStream', () => {
	it('streams a WebM to the asset directory', async () => {
		const { saveStingerStream, listAssetPaths } = await import('./assets');
		const webm = new Uint8Array(await fixture('stinger.webm'));
		const half = Math.floor(webm.length / 2);
		const saved = await saveStingerStream(streamOf(webm.slice(0, half), webm.slice(half)));
		expect(saved.kind).toBe('video');
		expect(saved.path).toMatch(
			/^\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webm$/
		);
		expect(await listAssetPaths()).toContain(saved.path);
		expect(
			new Uint8Array(await readFile(join(assetDir, saved.path.slice('/assets/'.length))))
		).toEqual(webm);
		expect(await readdir(assetDir)).toHaveLength(1);
	});

	it('rejects an unsupported file and leaves nothing behind', async () => {
		const { saveStingerStream } = await import('./assets');
		const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
		await expect(saveStingerStream(streamOf(png))).rejects.toMatchObject({ code: 'invalid' });
		await expect(saveStingerStream(streamOf())).rejects.toMatchObject({ code: 'invalid' });
		expect(await readdir(assetDir)).toEqual([]);
	});

	it('rejects a stream over the cap and leaves no file or temp file', async () => {
		const { saveStingerStream } = await import('./assets');
		const chunk = () => new Uint8Array(40);
		await expect(
			saveStingerStream(streamOf(chunk(), chunk(), chunk(), chunk(), chunk()), 100)
		).rejects.toMatchObject({ code: 'invalid', message: 'Stingers must be 1 GB or smaller.' });
		expect(await readdir(assetDir)).toEqual([]);
	});

	it('rejects a stream that errors mid-way and leaves no file', async () => {
		const { saveStingerStream } = await import('./assets');
		const webm = new Uint8Array(await fixture('stinger.webm'));
		let sent = false;
		const broken = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (!sent) {
					sent = true;
					controller.enqueue(webm.slice(0, 64));
				} else controller.error(new Error('connection dropped'));
			}
		});
		await expect(saveStingerStream(broken)).rejects.toThrow('connection dropped');
		expect(await readdir(assetDir)).toEqual([]);
	});
});

describe('openAsset', () => {
	async function saved() {
		const { saveStingerStream, openAsset } = await import('./assets');
		const webm = new Uint8Array(await fixture('stinger.webm'));
		const { path } = await saveStingerStream(streamOf(webm));
		return { openAsset, name: path.slice('/assets/'.length), webm };
	}

	it('serves a requested range', async () => {
		const { openAsset, name, webm } = await saved();
		const result = await openAsset(name, 'bytes=0-9');
		expect(result).toMatchObject({
			partial: true,
			start: 0,
			end: 9,
			size: webm.length,
			mime: 'video/webm'
		});
		expect(await bytesOf(result.body)).toEqual(webm.slice(0, 10));
	});

	it('serves open-ended, suffix and over-long ranges', async () => {
		const { openAsset, name, webm } = await saved();
		const open = await openAsset(name, 'bytes=10-');
		expect(open).toMatchObject({ partial: true, start: 10, end: webm.length - 1 });
		expect(await bytesOf(open.body)).toEqual(webm.slice(10));
		const suffix = await openAsset(name, 'bytes=-5');
		expect(suffix).toMatchObject({ partial: true, start: webm.length - 5, end: webm.length - 1 });
		expect(await bytesOf(suffix.body)).toEqual(webm.slice(-5));
		const long = await openAsset(name, `bytes=0-${webm.length * 10}`);
		expect(long).toMatchObject({ partial: true, start: 0, end: webm.length - 1 });
		await long.body.cancel();
	});

	it('serves the whole file without a Range header', async () => {
		const { openAsset, name, webm } = await saved();
		const result = await openAsset(name, null);
		expect(result).toMatchObject({
			partial: false,
			start: 0,
			end: webm.length - 1,
			size: webm.length
		});
		expect(await bytesOf(result.body)).toEqual(webm);
	});

	it('rejects ranges beyond the file with a range error carrying the size', async () => {
		const { openAsset, name, webm } = await saved();
		for (const range of ['bytes=999999999-', `bytes=${webm.length}-`, 'bytes=-0'])
			await expect(openAsset(name, range)).rejects.toMatchObject({
				name: 'SaveError',
				code: 'range',
				details: { size: webm.length }
			});
	});

	it('ignores malformed or multi-part Range headers', async () => {
		const { openAsset, name, webm } = await saved();
		for (const range of [
			'garbage',
			'bytes=',
			'bytes=-',
			'bytes=9-3',
			'bytes=0-1,5-6',
			'items=0-9'
		]) {
			const result = await openAsset(name, range);
			expect(result.partial, range).toBe(false);
			expect(await bytesOf(result.body)).toEqual(webm);
		}
	});

	it('treats unsafe names as not found', async () => {
		const { openAsset } = await import('./assets');
		await expect(openAsset('../../etc/passwd', null)).rejects.toMatchObject({ code: 'not-found' });
		await expect(openAsset('nope.webm', null)).rejects.toMatchObject({ code: 'not-found' });
	});
});
