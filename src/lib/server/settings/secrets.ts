import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function parseEncryptionKey(value: string) {
	const trimmed = value.trim();
	const key = /^[0-9a-f]{64}$/i.test(trimmed)
		? Buffer.from(trimmed, 'hex')
		: Buffer.from(trimmed, 'base64');
	if (key.length !== 32)
		throw new Error('SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes.');
	return key;
}

let encryptionKey: Promise<Buffer> | undefined;
async function getEncryptionKey() {
	return (encryptionKey ??= (async () => {
		const configured = process.env.SETTINGS_ENCRYPTION_KEY;
		if (configured) return parseEncryptionKey(configured);
		const file = resolve(process.env.SETTINGS_ENCRYPTION_KEY_FILE ?? 'data/settings.key');
		try {
			return parseEncryptionKey(await readFile(file, 'utf8'));
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
		}
		const encoded = randomBytes(32).toString('base64');
		await mkdir(dirname(file), { recursive: true });
		try {
			await writeFile(file, encoded + '\n', { mode: 0o600, flag: 'wx' });
			return parseEncryptionKey(encoded);
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
			return parseEncryptionKey(await readFile(file, 'utf8'));
		}
	})());
}

export async function encryptSecret(value: string, purpose: string) {
	if (!value) return null;
	const key = await getEncryptionKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(`provider-settings:${purpose}:v1`));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return ['v1', iv, tag, ciphertext]
		.map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
		.join(':');
}

export async function decryptSecret(value: string | null, purpose: string) {
	if (!value) return '';
	const [version, iv, tag, ciphertext, extra] = value.split(':');
	if (version !== 'v1' || !iv || !tag || !ciphertext || extra)
		throw new Error('Encrypted setting has an unsupported format.');
	try {
		const key = await getEncryptionKey();
		const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
		decipher.setAAD(Buffer.from(`provider-settings:${purpose}:v1`));
		decipher.setAuthTag(Buffer.from(tag, 'base64url'));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertext, 'base64url')),
			decipher.final()
		]).toString('utf8');
	} catch {
		throw new Error('Could not decrypt saved settings. Check the server encryption key.');
	}
}
