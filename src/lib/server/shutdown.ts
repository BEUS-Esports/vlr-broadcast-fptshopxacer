const controller = new AbortController();

/**
 * Aborted when the production server starts shutting down. adapter-node's graceful shutdown waits
 * for open connections, and event streams never finish on their own, so they end on this instead.
 */
export const shutdownSignal = controller.signal;

export function beginShutdown() {
	controller.abort();
}
