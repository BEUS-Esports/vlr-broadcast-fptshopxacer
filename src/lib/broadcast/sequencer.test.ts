import { describe, expect, it, vi } from 'vitest';
import { createLayerSequencer, type LayerTarget } from './sequencer';

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(exitGate?: Promise<void>) {
	const log: string[] = [];
	const seq = createLayerSequencer({
		enter: async (t) => void log.push(`enter:${t.graphic}`),
		exit: async (t) => {
			log.push(`exit:${t.graphic}`);
			await exitGate;
		},
		refresh: async (t) => void log.push(`refresh:${t.graphic}`)
	});
	return { log, seq };
}
const mvp = (revision = 1): LayerTarget => ({ graphic: 'mvp', revision });
const post = (revision = 1): LayerTarget => ({ graphic: 'post-game', revision });

describe('layer sequencer', () => {
	it('exits the old graphic before entering the new one', async () => {
		const gate = deferred();
		const { log, seq } = setup(gate.promise);
		seq.set(post());
		await seq.idle();
		log.length = 0;
		seq.set(mvp());
		await tick();
		expect(log).toEqual(['exit:post-game']);
		gate.resolve();
		await seq.idle();
		expect(log).toEqual(['exit:post-game', 'enter:mvp']);
	});

	it('only the latest target enters after rapid changes', async () => {
		const gate = deferred();
		const { log, seq } = setup(gate.promise);
		seq.set(post());
		await seq.idle();
		log.length = 0;
		seq.set({ graphic: 'player-lineup', revision: 1 }); // A
		await tick();
		seq.set({ graphic: 'in-game', revision: 1 }); // B
		seq.set(mvp()); // C
		gate.resolve();
		await seq.idle();
		expect(log).toEqual(['exit:post-game', 'enter:mvp']);
	});

	it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
		'ends on the newest target when set() lands %i microtasks after a step resolves',
		async (depth) => {
			const { log, seq } = setup();
			seq.set(post());
			let p: Promise<void> = Promise.resolve();
			for (let i = 0; i < depth; i++) p = p.then(() => {});
			void p.then(() => seq.set(mvp()));
			await seq.idle();
			await tick();
			await seq.idle();
			expect(log).toEqual(['enter:post-game', 'exit:post-game', 'enter:mvp']);
		}
	);

	it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
		'refreshes to the newest revision when a bump lands %i microtasks after a step resolves',
		async (depth) => {
			const { log, seq } = setup();
			seq.set(mvp(1));
			let p: Promise<void> = Promise.resolve();
			for (let i = 0; i < depth; i++) p = p.then(() => {});
			void p.then(() => seq.set(mvp(2)));
			await seq.idle();
			await tick();
			await seq.idle();
			expect(log).toEqual(['enter:mvp', 'refresh:mvp']);
		}
	);

	it('refreshes in place on a new revision of the same graphic', async () => {
		const { log, seq } = setup();
		seq.set(mvp(1));
		await seq.idle();
		log.length = 0;
		seq.set(mvp(2));
		await seq.idle();
		expect(log).toEqual(['refresh:mvp']);
	});

	it('exits to empty on null', async () => {
		const { log, seq } = setup();
		seq.set(mvp());
		await seq.idle();
		seq.set(null);
		await seq.idle();
		expect(log).toEqual(['enter:mvp', 'exit:mvp']);
	});

	it('continues after a throwing step', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const log: string[] = [];
		const seq = createLayerSequencer({
			enter: async (t) => void log.push(`enter:${t.graphic}`),
			exit: async () => {
				throw new Error('boom');
			},
			refresh: async () => {}
		});
		seq.set(post());
		await seq.idle();
		seq.set(mvp());
		await seq.idle();
		expect(log).toEqual(['enter:post-game', 'enter:mvp']);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});
