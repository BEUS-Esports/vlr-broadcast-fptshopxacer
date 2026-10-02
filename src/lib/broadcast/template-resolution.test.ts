import { expect, it } from 'vitest';
import { resolveTemplate } from './template-resolution';

it('uses the selected tournament template and falls back for missing or unknown slugs', () => {
	const templates = { test: { name: 'generic' }, event: { name: 'custom' } };
	expect(resolveTemplate('event', templates)).toBe(templates.event);
	for (const slug of [null, '', 'unknown', 'constructor', '__proto__'])
		expect(resolveTemplate(slug, templates)).toBe(templates.test);
});
