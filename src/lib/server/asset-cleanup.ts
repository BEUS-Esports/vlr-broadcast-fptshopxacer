import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import * as s from '#lib/server/db/schema/index.ts';
import { listAssetPaths, removeAsset } from './assets';
import { logEvent } from './logging';

const retentionMs = 14 * 24 * 60 * 60 * 1000;
const scanIntervalMs = 60 * 60 * 1000;

function collectReferences(value: unknown, paths: Set<string>) {
	if (typeof value === 'string') {
		if (value.startsWith('/assets/')) paths.add(value);
	} else if (value && typeof value === 'object') {
		for (const child of Object.values(value)) collectReferences(child, paths);
	}
}

export async function collectUnusedAssets(now = Date.now()) {
	const files = new Set(await listAssetPaths());
	const failures: Error[] = [];
	// shortcut: one write lock protects references; batch deletions if large queues delay saves.
	await db.transaction(async (tx) => {
		const referenced = new Set<string>();
		for (const table of [s.teams, s.players, s.maps, s.agents, s.weapons])
			collectReferences(await tx.select().from(table), referenced);
		collectReferences(
			await tx.select({ publications: s.broadcastState.publications }).from(s.broadcastState),
			referenced
		);
		const pending = await tx.select().from(s.assetDeletionQueue);
		for (const { path, unreferencedAt } of pending) {
			if (files.has(path) && !referenced.has(path)) {
				if (now - unreferencedAt < retentionMs) continue;
				try {
					await removeAsset(path);
				} catch (cause) {
					failures.push(new Error(`Could not remove ${path}`, { cause }));
					continue;
				}
			}
			await tx.delete(s.assetDeletionQueue).where(eq(s.assetDeletionQueue.path, path));
		}
		const marked = new Set(pending.map(({ path }) => path));
		const unreferenced = [...files]
			.filter((path) => !referenced.has(path) && !marked.has(path))
			.map((path) => ({ path, unreferencedAt: now }));
		for (let offset = 0; offset < unreferenced.length; offset += 100)
			await tx.insert(s.assetDeletionQueue).values(unreferenced.slice(offset, offset + 100));
	});
	if (failures.length)
		throw new AggregateError(failures, 'Asset cleanup could not delete some files; will retry.');
}

export function startAssetCleanup() {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	async function run() {
		const startedAt = performance.now();
		logEvent('debug', 'assets.cleanup.started');
		try {
			await collectUnusedAssets();
			logEvent('info', 'assets.cleanup.completed', {
				durationMs: Math.round(performance.now() - startedAt)
			});
		} catch (cause) {
			logEvent('error', 'assets.cleanup.failed', { retryMs: scanIntervalMs }, cause);
		} finally {
			if (!stopped) {
				timer = setTimeout(run, scanIntervalMs);
				timer.unref();
			}
		}
	}
	void run();
	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}
