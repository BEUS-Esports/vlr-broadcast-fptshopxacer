import { expect, it, vi } from 'vitest';

it('publishes streamed catalogue sync only after completion and keeps publication failure separate', async () => {
	vi.resetModules();
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const publish = vi.fn(async () => {
		throw new Error('publication unavailable');
	});
	vi.doMock('#lib/server/services/resources.ts', () => ({
		syncResourceKind: async () => {
			await pending;
			return { count: 2 };
		}
	}));
	vi.doMock('#lib/server/broadcast/publisher.ts', () => ({ broadcastPublisher: { publish } }));
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		const { POST } = await import('../../../routes/admin/resources/sync/+server');
		const response = await POST({
			url: new URL('http://localhost/admin/resources/sync?kind=map')
		} as Parameters<typeof POST>[0]);
		expect(publish).not.toHaveBeenCalled();
		finish();
		const output = await response.text();
		expect(publish).toHaveBeenCalledExactlyOnceWith();
		expect(output).toContain('"type":"done"');
		expect(output).not.toContain('"type":"error"');
	} finally {
		log.mockRestore();
		vi.doUnmock('#lib/server/services/resources.ts');
		vi.doUnmock('#lib/server/broadcast/publisher.ts');
		vi.resetModules();
	}
});
