import type { GraphicId } from './controls';

export type LayerTarget = { graphic: GraphicId; revision: number }; // revision = captured publication controlRevision

type Steps = {
	enter(target: LayerTarget): Promise<void>; // mount + play
	exit(current: LayerTarget): Promise<void>; // stop + unmount
	refresh(target: LayerTarget): Promise<void>; // update in place
};

/** Orders exit -> enter -> refresh for one layer so two graphics are never on it at once. */
export function createLayerSequencer(steps: Steps) {
	let desired: LayerTarget | null = null;
	let current: LayerTarget | null = null;
	let running: Promise<void> | null = null;

	// A throwing step is treated as completed so a bad template cannot freeze the layer.
	async function run(step: () => Promise<void>) {
		try {
			await step();
		} catch (error) {
			console.warn('layer sequencer step failed', error);
		}
	}

	async function loop() {
		// desired is re-read on every iteration, i.e. after every await.
		while (current?.graphic !== desired?.graphic || current?.revision !== desired?.revision) {
			if (current && current.graphic !== desired?.graphic) {
				const leaving = current;
				await run(() => steps.exit(leaving));
				current = null;
			} else if (!current && desired) {
				const target = desired;
				await run(() => steps.enter(target));
				current = target;
			} else if (current && desired) {
				const target = (current = desired);
				await run(() => steps.refresh(target));
			}
		}
	}

	return {
		set(target: LayerTarget | null) {
			desired = target;
			running ??= loop().finally(() => (running = null));
		},
		idle: async () => {
			await running;
		}
	};
}
