import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PlayerCameraPreview from './PlayerCameraPreview.svelte';

function post(source: MessageEventSource | null, origin: string, value: unknown) {
	window.dispatchEvent(
		new MessageEvent('message', { data: { action: 'view-connection', value }, origin, source })
	);
}

it('maps view-connection messages from its own VDO.Ninja iframe', async () => {
	const view = render(PlayerCameraPreview, { src: 'about:blank', title: 'Camera preview S1' });
	const frame = view.container.querySelector('iframe')!;
	await expect.element(view.getByText('Not connected')).toBeInTheDocument();
	post(frame.contentWindow, 'https://vdo.ninja', true);
	await expect.element(view.getByText('Connected', { exact: true })).toBeInTheDocument();
	post(frame.contentWindow, 'https://vdo.ninja', false);
	await expect.element(view.getByText('Not connected')).toBeInTheDocument();
});

it('ignores messages from other windows and origins', async () => {
	const view = render(PlayerCameraPreview, { src: 'about:blank', title: 'Camera preview S1' });
	const frame = view.container.querySelector('iframe')!;
	post(window, 'https://vdo.ninja', true);
	post(frame.contentWindow, 'https://evil.example', true);
	await new Promise((resolve) => setTimeout(resolve, 50));
	await expect.element(view.getByText('Not connected')).toBeInTheDocument();
});

it('renders no iframe without a link', async () => {
	const view = render(PlayerCameraPreview, { src: null, title: 'Camera preview S1' });
	expect(view.container.querySelector('iframe')).toBeNull();
	await expect.element(view.getByText('Not connected')).toBeInTheDocument();
});
