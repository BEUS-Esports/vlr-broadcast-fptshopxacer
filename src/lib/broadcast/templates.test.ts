import { describe, expect, it } from 'vitest';
import { resolveGraphicTemplate } from './templates';

describe('template sponsor support', () => {
	it('lets the predator-roadshow-val template show every sponsor element', () => {
		expect(resolveGraphicTemplate('predator-roadshow-val').sponsor).toEqual({
			banners: true,
			loop: true
		});
	});

	it('shares the declaration across prefix-matched stop slugs', () => {
		expect(resolveGraphicTemplate('predator-roadshow-val-hanoi').sponsor).toEqual({
			banners: true,
			loop: true
		});
	});

	it('defaults to no sponsor support for templates without a declaration and the test fallback', () => {
		expect(resolveGraphicTemplate('beus-graph-test').sponsor).toEqual({
			banners: false,
			loop: false
		});
		expect(resolveGraphicTemplate(null).sponsor).toEqual({ banners: false, loop: false });
	});
});
