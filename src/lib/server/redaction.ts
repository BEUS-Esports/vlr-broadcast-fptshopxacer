/** Bounded diagnostics shared by server logs and the admin live inspector. */
export function redactDiagnostics(value: unknown, secrets: string[], depth = 0): unknown {
	if (depth > 10) return '[truncated]';
	if (typeof value === 'string') {
		if (/^\s*[[{]/.test(value)) {
			try {
				return redactDiagnostics(JSON.parse(value), secrets, depth + 1);
			} catch {
				/* Keep malformed raw text inspectable. */
			}
		}
		let redacted = value;
		for (const secret of secrets.filter(Boolean)) {
			for (const variant of new Set([
				secret,
				encodeURIComponent(secret),
				new URLSearchParams({ value: secret }).toString().slice(6)
			]))
				redacted = redacted.split(variant).join('[redacted]');
		}
		redacted = redacted.replace(
			/([?&](?:access[_-]?key|api[_-]?key|key|secret|token|password|authorization|cookie|credential|auth|group[_-]?code)=)[^&#\s"']*/gi,
			'$1[redacted]'
		);
		redacted = redacted.replace(
			/(["']?(?:access[_-]?key|api[_-]?key|key|secret|token|password|authorization|cookie|credential|auth|group[_-]?code)["']?\s*[:=]\s*)(["'])([^"']*)\2/gi,
			'$1"[redacted]"'
		);
		return redacted.slice(0, 65536);
	}
	if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
	if (Array.isArray(value))
		return value.slice(0, 500).map((item) => redactDiagnostics(item, secrets, depth + 1));
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.slice(0, 1000)
				.filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key))
				.map(([key, item]) => [
					redactDiagnostics(key, secrets, depth + 1),
					/key|secret|token|password|authorization|cookie|credential|auth|group[_-]?code|headers|body|payload/i.test(
						key
					)
						? '[redacted]'
						: redactDiagnostics(item, secrets, depth + 1)
				])
		);
	return null;
}
