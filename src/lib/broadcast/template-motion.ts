import { gsap } from 'gsap';

type ActiveTimeline = {
	timeline: gsap.core.Timeline;
	resolve: () => void;
};

const active = new WeakMap<HTMLElement, ActiveTimeline>();
const itemSelector =
	'[data-gfx-motion="item"], [data-slot], [data-sequence], [data-player-panel], [data-team-mvp]';
const animatedProperties = 'opacity,visibility,transform';

function finishActive(root: HTMLElement) {
	const running = active.get(root);
	if (!running) return;
	running.timeline.kill();
	running.resolve();
	active.delete(root);
}

function outermost(elements: HTMLElement[]) {
	const candidates = new Set(elements);
	return elements.filter((element) => {
		for (let parent = element.parentElement; parent; parent = parent.parentElement) {
			if (candidates.has(parent)) return false;
		}
		return true;
	});
}

function motionTargets(root: HTMLElement) {
	const chrome = Array.from(
		root.querySelectorAll<HTMLElement>('[data-gfx-motion="chrome"], .rs-header')
	);
	const content = Array.from(root.querySelectorAll<HTMLElement>('[data-gfx-motion="content"]'));
	const items = outermost(Array.from(root.querySelectorAll<HTMLElement>(itemSelector)));
	return { chrome, content, items, all: [root, ...chrome, ...content, ...items] };
}

function run(
	root: HTMLElement | undefined,
	reducedMotion: boolean,
	phase: 'play' | 'stop'
): Promise<void> {
	if (!root) return Promise.resolve();
	finishActive(root);
	const targets = motionTargets(root);

	if (reducedMotion) {
		gsap.set(targets.all, { clearProps: animatedProperties });
		if (phase === 'stop') gsap.set(root, { autoAlpha: 0 });
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		const complete = () => {
			active.delete(root);
			if (phase === 'play') gsap.set(targets.all, { clearProps: animatedProperties });
			else
				gsap.set([...targets.chrome, ...targets.content, ...targets.items], {
					clearProps: animatedProperties
				});
			resolve();
		};
		const timeline = gsap.timeline({ paused: true, onComplete: complete });
		active.set(root, { timeline, resolve });

		if (phase === 'play') {
			timeline.fromTo(
				root,
				{ autoAlpha: 0 },
				{ autoAlpha: 1, duration: 0.16, ease: 'power1.out' },
				0
			);
			if (targets.chrome.length)
				timeline.fromTo(
					targets.chrome,
					{ autoAlpha: 0, y: -28 },
					{ autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out' },
					0
				);
			if (targets.content.length)
				timeline.fromTo(
					targets.content,
					{ autoAlpha: 0, y: 38, scale: 0.985 },
					{ autoAlpha: 1, y: 0, scale: 1, duration: 0.46, ease: 'power3.out' },
					0.03
				);
			if (targets.items.length)
				timeline.fromTo(
					targets.items,
					{ autoAlpha: 0, y: 18 },
					{
						autoAlpha: 1,
						y: 0,
						duration: 0.3,
						ease: 'power2.out',
						stagger: { amount: 0.12, from: 'start' }
					},
					0.1
				);
		} else {
			if (targets.items.length)
				timeline.to(targets.items, {
					autoAlpha: 0,
					y: -10,
					duration: 0.14,
					ease: 'power2.in',
					stagger: { amount: 0.06, from: 'end' }
				});
			if (targets.content.length)
				timeline.to(
					targets.content,
					{ autoAlpha: 0, y: 24, scale: 0.99, duration: 0.22, ease: 'power2.in' },
					0.04
				);
			if (targets.chrome.length)
				timeline.to(
					targets.chrome,
					{ autoAlpha: 0, y: -18, duration: 0.2, ease: 'power2.in' },
					0.06
				);
			timeline.to(root, { autoAlpha: 0, duration: 0.12, ease: 'power1.in' }, 0.2);
		}

		timeline.play(0);
	});
}

export function playGraphic(root: HTMLElement | undefined, reducedMotion: boolean) {
	return run(root, reducedMotion, 'play');
}

export function stopGraphic(root: HTMLElement | undefined, reducedMotion: boolean) {
	return run(root, reducedMotion, 'stop');
}
