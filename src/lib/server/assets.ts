import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SaveError } from './services/save-error';

const directory = process.env.ASSET_DIR ?? join(process.cwd(), 'data', 'assets');
const maxBytes = 10 * 1024 * 1024;
const filenamePattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

function imageType(bytes: Uint8Array) {
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

async function saveBytes(bytes: Uint8Array) {
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

export async function readAsset(name: string) {
	if (!filenamePattern.test(name)) throw new SaveError('not-found', 'Asset not found.');
	const mime = name.endsWith('.png')
		? 'image/png'
		: name.endsWith('.jpg')
			? 'image/jpeg'
			: 'image/webp';
	return { bytes: await readFile(join(directory, name)), mime };
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
