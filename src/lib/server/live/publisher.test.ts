import { afterEach, expect, it, vi } from 'vitest';
import { createLivePublisher, createLiveResponse } from './publisher';
import type { LiveSessionStatus } from '#lib/live/types.ts';
const status: LiveSessionStatus = {
	provider: null,
	generation: 0,
	selectedGameId: null,
	health: 'disabled',
	mode: 'native',
	mappingReady: false,
	retryAttempt: 0,
	nextRetryAt: null,
	lastReceivedAt: null,
	lastError: null,
	attribution: 'unknown'
};
afterEach(() => vi.useRealTimers());
it('shares a validated latest envelope, coalesces telemetry and publishes mode immediately', () => {
	vi.useFakeTimers();
	const publisher = createLivePublisher('epoch');
	const a = vi.fn();
	const b = vi.fn();
	const stopA = publisher.subscribe(a);
	const stopB = publisher.subscribe(b);
	expect(a.mock.calls[0][0]).toMatchObject({
		version: 1,
		state: null,
		status,
		stream: { epoch: 'epoch', sequence: 1 }
	});
	publisher.publish(null, { ...status, generation: 1 }, false);
	publisher.publish(null, { ...status, generation: 2 }, false);
	expect(a).toHaveBeenCalledTimes(1);
	vi.advanceTimersByTime(100);
	expect(a).toHaveBeenCalledTimes(2);
	expect(b.mock.calls.at(-1)![0]).toMatchObject({
		status: { generation: 2 },
		stream: { sequence: 2 }
	});
	publisher.publish(null, { ...status, generation: 3 }, true);
	expect(a.mock.calls.at(-1)![0].status.generation).toBe(3);
	expect(() =>
		publisher.publish(null, { ...status, secret: 'leak' } as LiveSessionStatus, true)
	).toThrow();
	stopA();
	stopB();
	publisher.dispose();
});
it('serves immediate SSE with heartbeat and tears down cancelled subscribers', async () => {
	const publisher = createLivePublisher('epoch');
	const abort = new AbortController();
	const response = createLiveResponse(publisher, abort.signal);
	const reader = response.body!.getReader();
	expect(response.headers.get('content-encoding')).toBe('identity');
	expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: live-game');
	abort.abort();
	expect((await reader.read()).done).toBe(true);
	publisher.dispose();
});
