import { describe, expect, it, vi } from 'vitest';
import { createLayerSequencer, type LayerTarget } from './sequencer';

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(exitGate?: Promise<void>, transition?: { result: boolean; gate?: Promise<void> }) {
	const log: string[] = [];
	const seq = createLayerSequencer({
		enter: async (t) => void log.push(`enter:${t.graphic}`),
		exit: async (t) => {
			log.push(`exit:${t.graphic}`);
			await exitGate;
		},
		refresh: async (t) => void log.push(`refresh:${t.graphic}`),
		...(transition && {
			transition: async (from, to) => {
				log.push(`transition:${from?.graphic ?? null}->${to?.graphic ?? null}`);
				await transition.gate;
				return transition.result;
			}
		})
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

	describe('transition step', () => {
		it('replaces exit/enter when it handles a graphic swap', async () => {
			const { log, seq } = setup(undefined, { result: true });
			seq.set(post());
			await seq.idle();
			log.length = 0;
			seq.set(mvp());
			await seq.idle();
			expect(log).toEqual(['transition:post-game->mvp']);
		});

		it('is called when showing from empty and hiding to empty', async () => {
			const { log, seq } = setup(undefined, { result: true });
			seq.set(mvp());
			await seq.idle();
			seq.set(null);
			await seq.idle();
			expect(log).toEqual(['transition:null->mvp', 'transition:mvp->null']);
		});

		it('falls back to exit/enter, asking only once, when it returns false', async () => {
			const { log, seq } = setup(undefined, { result: false });
			seq.set(post());
			await seq.idle();
			log.length = 0;
			seq.set(mvp());
			await seq.idle();
			expect(log).toEqual(['transition:post-game->mvp', 'exit:post-game', 'enter:mvp']);
		});

		it('asks again for a later swap after a declined one', async () => {
			const { log, seq } = setup(undefined, { result: false });
			seq.set(post());
			await seq.idle();
			seq.set(mvp());
			await seq.idle();
			seq.set(post());
			await seq.idle();
			expect(log.filter((l) => l.startsWith('transition'))).toEqual([
				'transition:null->post-game',
				'transition:post-game->mvp',
				'transition:mvp->post-game'
			]);
		});

		it('re-reads the desired target after a gated transition resolves', async () => {
			const gate = deferred();
			const { log, seq } = setup(undefined, { result: true, gate: gate.promise });
			seq.set(mvp());
			await tick();
			seq.set(post());
			gate.resolve();
			await seq.idle();
			expect(log).toEqual(['transition:null->mvp', 'transition:mvp->post-game']);
		});

		it('refreshes, never transitions, on a revision change of the same graphic', async () => {
			const { log, seq } = setup(undefined, { result: true });
			seq.set(mvp(1));
			await seq.idle();
			log.length = 0;
			seq.set(mvp(2));
			await seq.idle();
			expect(log).toEqual(['refresh:mvp']);
		});

		it('treats a throwing transition as handled', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const log: string[] = [];
			const seq = createLayerSequencer({
				enter: async (t) => void log.push(`enter:${t.graphic}`),
				exit: async (t) => void log.push(`exit:${t.graphic}`),
				refresh: async () => {},
				transition: async () => {
					throw new Error('boom');
				}
			});
			seq.set(post());
			await seq.idle();
			seq.set(mvp());
			await seq.idle();
			expect(log).toEqual([]);
			expect(warn).toHaveBeenCalled();
			warn.mockRestore();
		});
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
