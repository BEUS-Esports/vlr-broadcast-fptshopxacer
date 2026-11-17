import { createCipheriv, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const key = Buffer.alloc(32, 7);

beforeEach(() => {
	vi.resetModules();
	process.env.SETTINGS_ENCRYPTION_KEY = key.toString('base64');
});
afterEach(() => {
	delete process.env.SETTINGS_ENCRYPTION_KEY;
});

it('round-trips a secret and binds it to its purpose', async () => {
	const { decryptSecret, encryptSecret } = await import('./secrets');
	const encrypted = await encryptSecret('pw', 'a');
	expect(encrypted).toMatch(/^v1:/);
	expect(await decryptSecret(encrypted, 'a')).toBe('pw');
	await expect(decryptSecret(encrypted, 'b')).rejects.toThrow(/Could not decrypt saved settings/);
});

it('keeps the provider AAD format', async () => {
	const { decryptSecret } = await import('./secrets');
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from('provider-settings:spectra-access-key:v1'));
	const ciphertext = Buffer.concat([cipher.update('legacy', 'utf8'), cipher.final()]);
	const value = ['v1', iv, cipher.getAuthTag(), ciphertext]
		.map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
		.join(':');
	expect(await decryptSecret(value, 'spectra-access-key')).toBe('legacy');
});

it('stores empty secrets as null', async () => {
	const { decryptSecret, encryptSecret } = await import('./secrets');
	expect(await encryptSecret('', 'a')).toBeNull();
	expect(await decryptSecret(null, 'a')).toBe('');
});
