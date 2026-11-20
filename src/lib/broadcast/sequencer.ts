import type { GraphicId } from './controls';

export type LayerTarget = { graphic: GraphicId; revision: number }; // revision = captured publication controlRevision

type Steps = {
	enter(target: LayerTarget): Promise<void>; // mount + play
	exit(current: LayerTarget): Promise<void>; // stop + unmount
	refresh(target: LayerTarget): Promise<void>; // update in place
	/**
	 * Optional. Called when the layer's graphic changes (including to/from empty).
	 * Resolve true if it fully handled the change; false to let the sequencer exit/enter.
	 */
	transition?(from: LayerTarget | null, to: LayerTarget | null): Promise<boolean>;
};

/** Orders exit -> enter -> refresh for one layer so two graphics are never on it at once. */
export function createLayerSequencer(steps: Steps) {
	let desired: LayerTarget | null = null;
	let current: LayerTarget | null = null;
	let looping = false;
	let running: Promise<void> = Promise.resolve();

	// A throwing step is treated as completed so a bad template cannot freeze the layer.
	async function run(step: () => Promise<void>) {
		try {
			await step();
		} catch (error) {
			console.warn('layer sequencer step failed', error);
		}
	}

	// Graphic a declined transition was heading to; stops the exit/enter fallback asking again.
	let declinedTo: GraphicId | null | undefined;

	async function loop() {
		// desired is re-read on every iteration, i.e. after every await.
		while (current?.graphic !== desired?.graphic || current?.revision !== desired?.revision) {
			if (
				steps.transition &&
				current?.graphic !== desired?.graphic &&
				declinedTo !== (desired?.graphic ?? null)
			) {
				const from = current;
				const to = desired;
				let handled: boolean;
				try {
					handled = await steps.transition(from, to);
				} catch (error) {
					console.warn('layer sequencer step failed', error);
					handled = true; // like run(): a bad transition must not freeze the layer
				}
				if (handled) current = to;
				else declinedTo = to?.graphic ?? null;
				continue;
			}
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
		// Cleared in the same tick as the final check: a set() after this starts a new loop.
		declinedTo = undefined;
		looping = false;
	}

	return {
		set(target: LayerTarget | null) {
			desired = target;
			if (looping) return;
			looping = true;
			running = loop(); // cannot reject: run() catches every step error
		},
		idle: () => running
	};
}
