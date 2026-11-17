import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import FitHarness from './FitHarness.test.svelte';

const size = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
const settle = async () => {
	await tick();
	await document.fonts.ready;
	await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
};

it('shrinks every name in a group to one size that fits', async () => {
	const view = render(FitHarness, { long: '9G CHARLINGTON VERY LONG' });
	await settle();
	const [short, long] = view.container.querySelectorAll<HTMLElement>('.player');
	expect(size(short)).toBe(size(long));
	expect(size(long)).toBeLessThan(20);
	for (const el of [short, long]) expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth);
});

it('keeps groups independent', async () => {
	const view = render(FitHarness, { long: '9G CHARLINGTON VERY LONG' });
	await settle();
	expect(size(view.container.querySelector('.team')!)).toBe(20);
});

it('re-fits when a name changes', async () => {
	const view = render(FitHarness, { long: '9G CHARLINGTON VERY LONG' });
	await settle();
	await view.rerender({ long: 'C' });
	await settle();
	for (const el of view.container.querySelectorAll('.player')) expect(size(el)).toBe(20);
});
