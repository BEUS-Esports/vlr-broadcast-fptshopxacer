import { expect, it } from 'vitest';
import { normalizeConfig, publicConfig, redactDiagnostics } from './config';
it('validates server-only endpoints and never returns submitted credentials', () => {
	const config = normalizeConfig({
		spectraRegion: 'custom',
		spectraHost: 'http://localhost',
		accessKey: 'secret-key',
		groupCode: 'GROUP',
		gstackUrl: 'http://localhost:57780'
	});
	expect(config.spectraSocketUrl).toBe('http://localhost:5200/');
	expect(config.spectraExtrasUrl).toBe('http://localhost:5101/');
	expect(JSON.stringify(publicConfig(config))).not.toContain('secret-key');
	expect(() =>
		normalizeConfig({
			...config,
			spectraRegion: 'custom',
			spectraHost: 'http://user:pass@localhost'
		})
	).toThrow();
	expect(() =>
		normalizeConfig({ ...config, spectraRegion: 'custom', spectraHost: 'file:///etc/passwd' })
	).toThrow();
	expect(() => normalizeConfig({ ...config, groupCode: '' })).toThrow();
	expect(() => normalizeConfig({ ...config, groupCode: 'bad\u0001code' }, false)).toThrow();
});
it('redacts nested key fields, embedded key values, malformed JSON and executable-looking raw messages', () => {
	expect(
		redactDiagnostics(
			{
				accessKey: 'secret-key',
				nested: { token: 'private', name: 'Player', text: 'contains secret-key' }
			},
			['secret-key']
		)
	).toEqual({
		accessKey: '[redacted]',
		nested: { token: '[redacted]', name: 'Player', text: 'contains [redacted]' }
	});
	expect(redactDiagnostics('{"key":"secret-key"', ['secret-key'])).not.toContain('secret-key');
	expect(redactDiagnostics({ auth: { unexpected: 'credential' } }, [])).toEqual({
		auth: '[redacted]'
	});
});
it('redacts URL-encoded credentials, unquoted query values and secret property names', () => {
	const secret = 'example+private&key';
	const visible = JSON.stringify(
		redactDiagnostics(
			{
				url: `GET /getOrgForKey?key=${encodeURIComponent(secret)}`,
				[secret]: 'value',
				other: '/status?token=unknown-token&name=Player'
			},
			[secret]
		)
	);
	expect(visible).not.toContain(secret);
	expect(visible).not.toContain(encodeURIComponent(secret));
	expect(visible).not.toContain('unknown-token');
});
