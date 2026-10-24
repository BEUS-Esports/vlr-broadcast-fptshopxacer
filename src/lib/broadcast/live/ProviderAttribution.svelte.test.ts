import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProviderAttribution from './ProviderAttribution.svelte';
import { liveSessionFixture } from '#lib/live/fixtures.ts';

it('shows the Spectra logo and readable credit unless supporter status is verified', async () => {
	const view = render(ProviderAttribution, {
		status: liveSessionFixture({ provider: 'spectra', attribution: 'required' })
	});
	const badge = () => view.container.querySelector('[aria-label="Provider attribution"]');
	expect(badge()?.textContent).toContain('Powered by Spectra');
	expect(badge()?.querySelector('img')?.getAttribute('src')).toBe(
		'/providers/valospectra/icon.webp'
	);
	expect(getComputedStyle(badge()!).top).toBe('0px');
	expect(getComputedStyle(badge()!).right).toBe('30px');
	expect(getComputedStyle(badge()!).width).toBe('218px');
	for (const attribution of ['unknown', 'invalid-key', 'supporter'] as const) {
		await view.rerender({ status: liveSessionFixture({ provider: 'spectra', attribution }) });
		expect(!!badge()).toBe(attribution !== 'supporter');
	}
	await view.rerender({
		status: liveSessionFixture({ provider: 'gstack', attribution: 'required' })
	});
	expect(badge()).toBeNull();
});
