import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { SaveError } from './services/save-error';

const directory = process.env.ASSET_DIR ?? join(process.cwd(), 'data', 'assets');
const maxBytes = 10 * 1024 * 1024;
export const STINGER_MAX_BYTES = 1024 ** 3;
const filenamePattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|webm|avif)$/;
const mimeByExtension: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	webp: 'image/webp',
	webm: 'video/webm',
	avif: 'image/avif'
};

const text = (bytes: Uint8Array, start: number, end: number) =>
	new TextDecoder().decode(bytes.subarray(start, end));

export function stingerType(head: Uint8Array): {
	extension: 'webm' | 'webp' | 'avif';
	mime: string;
	kind: 'video' | 'image';
} {
	if (head.length >= 4 && [0x1a, 0x45, 0xdf, 0xa3].every((v, i) => head[i] === v))
		return { extension: 'webm', mime: 'video/webm', kind: 'video' };
	if (head.length >= 12 && text(head, 0, 4) === 'RIFF' && text(head, 8, 12) === 'WEBP')
		return { extension: 'webp', mime: 'image/webp', kind: 'image' };
	if (
		head.length >= 12 &&
		text(head, 4, 8) === 'ftyp' &&
		['avif', 'avis'].includes(text(head, 8, 12))
	)
		return { extension: 'avif', mime: 'image/avif', kind: 'image' };
	throw new SaveError('invalid', 'Use a WebM, WebP or AVIF stinger.');
}

export function imageType(bytes: Uint8Array) {
	if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
		return { extension: 'png', mime: 'image/png' };
	if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
		return { extension: 'jpg', mime: 'image/jpeg' };
	if (
		bytes.length >= 12 &&
		new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
		new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
	)
		return { extension: 'webp', mime: 'image/webp' };
	throw new SaveError('invalid', 'Use a PNG, JPEG, or WebP image.');
}

export async function saveBytes(bytes: Uint8Array) {
	if (!bytes.length || bytes.length > maxBytes)
		throw new SaveError('invalid', 'Images must be between 1 byte and 10 MB.');
	const { extension } = imageType(bytes);
	const name = `${crypto.randomUUID()}.${extension}`;
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, name), bytes, { flag: 'wx' });
	return `/assets/${name}`;
}

export async function saveUpload(value: FormDataEntryValue | null) {
	if (value == null || value === '') return null;
	if (!(value instanceof File)) throw new SaveError('invalid', 'Choose an image file.');
	if (value.size === 0 && value.name === '') return null;
	if (value.size > maxBytes) throw new SaveError('invalid', 'Images must be 10 MB or smaller.');
	return saveBytes(new Uint8Array(await value.arrayBuffer()));
}

export async function saveCatalogueImage(url: string) {
	const parsed = new URL(url);
	if (parsed.protocol !== 'https:' || parsed.hostname !== 'media.valorant-api.com')
		throw new SaveError('invalid', 'The catalogue supplied an unexpected image URL.');
	const response = await fetch(parsed, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
	if (!response.ok || !response.body) throw new Error(`Catalogue image failed: ${response.status}`);
	if (Number(response.headers.get('content-length')) > maxBytes)
		throw new SaveError('invalid', 'A catalogue image exceeds 10 MB.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of response.body) {
		size += chunk.length;
		if (size > maxBytes) {
			await response.body.cancel();
			throw new SaveError('invalid', 'A catalogue image exceeds 10 MB.');
		}
		chunks.push(chunk);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return saveBytes(bytes);
}

export async function assetExists(path: string | null | undefined) {
	const name = path?.startsWith('/assets/') ? path.slice('/assets/'.length) : '';
	if (!filenamePattern.test(name)) return false;
	try {
		return (await stat(join(directory, name))).isFile();
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw cause;
	}
}

export async function saveStingerStream(
	body: ReadableStream<Uint8Array>,
	maxBytes = STINGER_MAX_BYTES
): Promise<{ path: string; kind: 'video' | 'image' }> {
	await mkdir(directory, { recursive: true });
	const id = crypto.randomUUID();
	const part = join(directory, `${id}.part`);
	let size = 0;
	const limit = new Transform({
		transform(chunk: Buffer, _encoding, done) {
			size += chunk.length;
			done(
				size > maxBytes ? new SaveError('invalid', 'Stingers must be 1 GB or smaller.') : null,
				chunk
			);
		}
	});
	try {
		await pipeline(
			Readable.fromWeb(body as NodeReadableStream<Uint8Array>),
			limit,
			createWriteStream(part, { flags: 'wx' })
		);
		const head = new Uint8Array(16);
		const handle = await open(part, 'r');
		let read: number;
		try {
			read = (await handle.read(head, 0, head.length, 0)).bytesRead;
		} finally {
			await handle.close();
		}
		const { extension, kind } = stingerType(head.subarray(0, read));
		const name = `${id}.${extension}`;
		await rename(part, join(directory, name));
		return { path: `/assets/${name}`, kind };
	} catch (cause) {
		await rm(part, { force: true });
		throw cause;
	}
}

export async function openAsset(name: string, range: string | null) {
	if (!filenamePattern.test(name)) throw new SaveError('not-found', 'Asset not found.');
	const file = join(directory, name);
	const size = (await stat(file)).size;
	const mime = mimeByExtension[name.slice(name.lastIndexOf('.') + 1)];
	const match = size > 0 && range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
	let start = 0;
	let end = size - 1;
	let partial = false;
	if (match && (match[1] || match[2])) {
		const first = match[1] ? Number(match[1]) : null;
		const last = match[2] ? Number(match[2]) : null;
		if (first === null) {
			// Suffix range: the final `last` bytes.
			if (!last) throw new SaveError('range', 'Range not satisfiable.', { size });
			start = Math.max(size - last, 0);
			partial = true;
		} else if (last === null || last >= first) {
			if (first >= size) throw new SaveError('range', 'Range not satisfiable.', { size });
			start = first;
			end = Math.min(last ?? end, end);
			partial = true;
		}
	}
	const stream = size === 0 ? createReadStream(file) : createReadStream(file, { start, end });
	return {
		body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
		mime,
		size,
		start,
		end,
		partial
	};
}

export async function readAsset(name: string) {
	if (!filenamePattern.test(name)) throw new SaveError('not-found', 'Asset not found.');
	return {
		bytes: await readFile(join(directory, name)),
		mime: mimeByExtension[name.slice(name.lastIndexOf('.') + 1)]
	};
}

export async function removeAsset(path: string | null) {
	const name = path?.startsWith('/assets/') ? path.slice('/assets/'.length) : '';
	if (filenamePattern.test(name)) await rm(join(directory, name), { force: true });
}

export async function listAssetPaths() {
	try {
		return (await readdir(directory, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && filenamePattern.test(entry.name))
			.map((entry) => `/assets/${entry.name}`);
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw cause;
	}
}
