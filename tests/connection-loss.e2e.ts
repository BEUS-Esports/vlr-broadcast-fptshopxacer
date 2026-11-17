import { expect } from '@playwright/test';
import { test } from './fixtures';
import { save } from './management-helpers';

test('a lost server connection shows a page-wide warning and a save that never arrived asks for a plain retry', async ({
	page,
	context
}) => {
	// Offline emulation does not end an open event stream, so the journey replays the events a
	// real drop and reconnect fire on the page's own EventSource.
	await page.addInitScript(() => {
		const sources: EventSource[] = [];
		window.EventSource = class extends window.EventSource {
			constructor(...args: ConstructorParameters<typeof EventSource>) {
				super(...args);
				sources.push(this);
			}
		};
		Object.assign(window, {
			streamEvent: (type: 'error' | 'open') =>
				sources.forEach((source) => source.dispatchEvent(new Event(type)))
		});
	});
	const streamEvent = (type: 'error' | 'open') =>
		page.evaluate(
			(type) => (window as unknown as { streamEvent: (type: string) => void }).streamEvent(type),
			type
		);
	await page.goto('/admin/tournaments?new=1');
	await page
		.getByRole('textbox', { name: 'Tournament name', exact: true })
		.fill('Connection event');
	await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/tournaments\/[^/?]+$/);
	const banner = page.getByRole('alert', { name: 'Server connection', exact: true });
	await expect(banner).toHaveCount(0);

	await context.setOffline(true);
	await streamEvent('error');
	await expect(banner).toContainText('Server connection lost. Reconnecting');
	const name = page.getByRole('textbox', { name: 'Tournament name', exact: true });
	await name.fill('Renamed while offline');
	await page.getByRole('button', { name: 'Save details', exact: true }).click();
	await expect(page.getByText('Could not reach the server.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reload this section', exact: true })).toHaveCount(
		0
	);

	await context.setOffline(false);
	await streamEvent('open');
	await expect(banner).toHaveCount(0);
	await expect(
		page.getByText('Connection restored. This section was not saved; save it again.')
	).toBeVisible();
	await expect(name).toHaveValue('Renamed while offline');
	await save(page, 'Save details');
	await page.reload();
	await expect(name).toHaveValue('Renamed while offline');
});
