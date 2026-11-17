import { afterEach, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
afterEach(() => {
	delete (navigator as unknown as Record<string, unknown>).clipboard;
	if (original) Object.defineProperty(Navigator.prototype, 'clipboard', original);
	vi.restoreAllMocks();
});

it('falls back to a selected textarea when the Clipboard API is unavailable (plain-HTTP LAN)', async () => {
	Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
	let copied = '';
	const exec = vi.spyOn(document, 'execCommand').mockImplementation((command) => {
		if (command === 'copy') copied = (document.activeElement as HTMLTextAreaElement).value;
		return true;
	});
	await copyText('https://vdo.ninja/?push=BOOTH1_S1');
	expect(exec).toHaveBeenCalledWith('copy');
	expect(copied).toBe('https://vdo.ninja/?push=BOOTH1_S1');
	expect(document.querySelector('textarea')).toBeNull();
});

it('rejects when the fallback copy command fails', async () => {
	Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
	vi.spyOn(document, 'execCommand').mockReturnValue(false);
	await expect(copyText('x')).rejects.toThrow();
});
