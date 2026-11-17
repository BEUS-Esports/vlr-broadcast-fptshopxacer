import { expect, it } from 'vitest';
import { resolveTemplate } from './template-resolution';

it('uses the selected tournament template and falls back for missing or unknown slugs', () => {
	const templates = { test: { name: 'generic' }, event: { name: 'custom' } };
	expect(resolveTemplate('event', templates)).toBe(templates.event);
	for (const slug of [null, '', 'unknown', 'constructor', '__proto__'])
		expect(resolveTemplate(slug, templates)).toBe(templates.test);
});

it('resolves stop slugs to their event template by prefix', () => {
	const t = {
		test: { name: 'generic' },
		event: { name: 'event' },
		'event-special': { name: 'special' }
	};
	expect(resolveTemplate('event-dong-nai', t)).toBe(t.event);
	expect(resolveTemplate('event-special-x', t)).toBe(t['event-special']);
	expect(resolveTemplate('eventual', t)).toBe(t.test);
	expect(resolveTemplate('test-x', t)).toBe(t.test);
});
