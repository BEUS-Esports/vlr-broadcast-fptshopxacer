import { expect, it } from 'vitest';
import { pageSecurity } from './security';

it('treats HTTPS as safe for every machine', () => {
	expect(pageSecurity('https:', true)).toBe('https');
});

it('warns that localhost works only on the server machine', () => {
	expect(pageSecurity('http:', true)).toBe('local-only');
});

it('flags plain HTTP on a LAN address as insecure', () => {
	expect(pageSecurity('http:', false)).toBe('insecure');
});
