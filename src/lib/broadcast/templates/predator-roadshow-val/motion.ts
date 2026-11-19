import { gsap } from 'gsap';
import type { GraphicId } from '../../controls';

// Predator Roadshow motion: fast attack, hard settle, never an overshoot. Elements opt in with
// `data-rs-motion="<role>"`; everything stays visible without play() so previews render statically.
// stop() runs the same intro backwards (sped up), so every exit mirrors its entrance.

const SNAP = 'expo.out';
const PUNCH = 'power3.out';
const FULL = 'inset(0% 0% 0% 0%)';
const FROM_MIDDLE = 'inset(0% 50% 0% 50%)';
const FROM_TOP = 'inset(0% 0% 100% 0%)';
const FROM_BOTTOM = 'inset(100% 0% 0% 0%)';
const CLEARED = 'opacity,visibility,transform,translate,clipPath,filter';
// Exits run at least twice as fast as the intro and never take longer than this.
const MAX_EXIT_SECONDS = 0.6;

type Timeline = gsap.core.Timeline;
type Active = { timeline: Timeline; resolve: () => void; phase: 'play' | 'stop' };

const active = new WeakMap<HTMLElement, Active>();

function role(root: HTMLElement, name: string) {
	return Array.from(root.querySelectorAll<HTMLElement>(`[data-rs-motion="${name}"]`));
}

function animated(root: HTMLElement) {
	return [root, ...root.querySelectorAll<HTMLElement>('[data-rs-motion]')];
}

// Neon flash: the element lands overexposed and cools down to its real colours.
function flash(tl: Timeline, targets: Element[], at: number) {
	if (!targets.length) return;
	tl.fromTo(
		targets,
		{ filter: 'brightness(2.4) saturate(1.6)' },
		{ filter: 'brightness(1) saturate(1)', duration: 0.5, ease: 'power2.out' },
		at
	);
}

function header(tl: Timeline, root: HTMLElement, at = 0) {
	const title = role(root, 'title');
	if (title.length)
		tl.fromTo(
			title,
			{ autoAlpha: 0, y: -80 },
			{ autoAlpha: 1, y: 0, duration: 0.5, ease: SNAP },
			at
		);
	for (const [name, x] of [
		['logo-left', -60],
		['logo-right', 60]
	] as const) {
		const logo = role(root, name);
		if (logo.length)
			tl.fromTo(
				logo,
				{ autoAlpha: 0, x },
				{ autoAlpha: 1, x: 0, duration: 0.45, ease: SNAP },
				at + 0.05
			);
	}
}

// Sections that fade in from a direction, all on the same beat.
function directional(tl: Timeline, root: HTMLElement, at: number, distance: number) {
	const vectors = {
		'from-left': { x: -distance },
		'from-right': { x: distance },
		'from-bottom': { y: distance },
		'from-top': { y: -distance }
	};
	for (const [name, offset] of Object.entries(vectors)) {
		const targets = role(root, name);
		if (targets.length)
			tl.fromTo(
				targets,
				{ autoAlpha: 0, ...offset },
				{ autoAlpha: 1, x: 0, y: 0, duration: 0.55, ease: SNAP },
				at
			);
	}
}

function lineup(tl: Timeline, root: HTMLElement) {
	header(tl, root);
	directional(tl, root, 0, 120);
	// Team lockup flies in from beyond the left edge of the canvas.
	const identities = role(root, 'identity');
	if (identities.length)
		tl.fromTo(
			identities,
			{ x: (_: number, el: HTMLElement) => -(el.offsetLeft + el.offsetWidth + 80), skewX: -14 },
			{ x: 0, skewX: 0, duration: 0.6, ease: SNAP, stagger: 0.08 },
			0.05
		);
	// Player banners wipe open top to bottom, left to right; both rows share the slot beat.
	for (const card of role(root, 'card')) {
		const at = 0.32 + (Number(card.dataset.slot ?? 1) - 1) * 0.07;
		tl.fromTo(card, { clipPath: FROM_TOP }, { clipPath: FULL, duration: 0.5, ease: SNAP }, at);
		flash(tl, [card], at);
	}
}

function stats(tl: Timeline, root: HTMLElement) {
	header(tl, root);
	directional(tl, root, 0, 140);
}

function veto(tl: Timeline, root: HTMLElement) {
	header(tl, root);
	directional(tl, root, 0, 120);
	const matchup = role(root, 'matchup');
	if (matchup.length)
		tl.fromTo(
			matchup,
			{ clipPath: FROM_MIDDLE },
			{ clipPath: FULL, duration: 0.5, ease: SNAP },
			0.05
		);
	role(root, 'map').forEach((map, index) => {
		const at = 0.25 + index * 0.08;
		tl.fromTo(map, { clipPath: FROM_TOP }, { clipPath: FULL, duration: 0.45, ease: SNAP }, at);
		const shade = map.querySelector<HTMLElement>('[data-rs-motion="ban-shade"]');
		if (!shade) return;
		tl.fromTo(shade, { yPercent: -100 }, { yPercent: 0, duration: 0.28, ease: PUNCH }, at + 0.2);
		const mark = shade.querySelector<HTMLElement>('[data-rs-motion="ban-mark"]');
		// Two fast blinks: visible -> off -> on -> off -> on.
		if (mark)
			tl.to(mark, { autoAlpha: 0, duration: 0.045, ease: 'none', repeat: 3, yoyo: true }, at + 0.5);
	});
	// Action plates drop out from under their tiles once every map has landed.
	const plates = role(root, 'plate');
	if (plates.length)
		tl.fromTo(
			plates,
			{ yPercent: -100, clipPath: FROM_BOTTOM },
			{ yPercent: 0, clipPath: FULL, duration: 0.35, ease: PUNCH, stagger: 0.05 },
			tl.duration()
		);
}

function agentSelect(tl: Timeline, root: HTMLElement) {
	directional(tl, root, 0, 120);
	const band = role(root, 'band');
	if (band.length)
		tl.fromTo(band, { clipPath: FROM_MIDDLE }, { clipPath: FULL, duration: 0.5, ease: SNAP }, 0);
	// Outermost slots first, mirrored: left reads 1..5, right reads 5..1 (its slot 5 is at the edge).
	const left = Array.from(
		root.querySelectorAll<HTMLElement>('[data-position="left"] [data-rs-motion="agent"]')
	);
	const right = Array.from(
		root.querySelectorAll<HTMLElement>('[data-position="right"] [data-rs-motion="agent"]')
	).reverse();
	const start = band.length ? 0.5 : 0;
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const pair = [left[index], right[index]].filter(Boolean);
		const at = start + index * 0.09;
		tl.fromTo(pair, { clipPath: FROM_BOTTOM }, { clipPath: FULL, duration: 0.35, ease: SNAP }, at);
		flash(tl, pair, at);
	}
}

function postGame(tl: Timeline, root: HTMLElement) {
	const banner = role(root, 'post-header');
	if (banner.length)
		tl.fromTo(banner, { clipPath: FROM_MIDDLE }, { clipPath: FULL, duration: 0.5, ease: SNAP }, 0);
	directional(tl, root, 0.2, 260);
}

const builders: Partial<Record<GraphicId, (tl: Timeline, root: HTMLElement) => void>> = {
	'player-lineup': lineup,
	'player-stats': stats,
	mvp: stats,
	'map-veto': veto,
	'agent-select': agentSelect,
	'post-game': postGame
};

function build(root: HTMLElement, graphic: GraphicId) {
	const tl = gsap.timeline({ paused: true });
	tl.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: 'none' }, 0);
	// Every builder also enters `from-*` sections (such as the WAITING FOR MATCH card) on its own beat.
	(builders[graphic] ?? stats)(tl, root);
	return tl;
}

function finishActive(root: HTMLElement) {
	const running = active.get(root);
	if (!running) return;
	running.timeline.kill();
	running.resolve();
	active.delete(root);
}

export function playRoadshow(
	root: HTMLElement | undefined,
	graphic: GraphicId,
	reducedMotion: boolean
): Promise<void> {
	if (!root) return Promise.resolve();
	finishActive(root);
	if (reducedMotion) {
		gsap.set(animated(root), { clearProps: CLEARED });
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const timeline = build(root, graphic);
		timeline.eventCallback('onComplete', () => {
			active.delete(root);
			gsap.set(animated(root), { clearProps: CLEARED });
			resolve();
		});
		active.set(root, { timeline, resolve, phase: 'play' });
		timeline.play(0);
	});
}

export function stopRoadshow(
	root: HTMLElement | undefined,
	graphic: GraphicId,
	reducedMotion: boolean
): Promise<void> {
	if (!root) return Promise.resolve();
	const running = active.get(root);
	if (reducedMotion || running?.phase === 'stop') {
		finishActive(root);
		gsap.set(animated(root), { clearProps: CLEARED });
		gsap.set(root, { autoAlpha: 0 });
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		let timeline: Timeline;
		if (running) {
			// Interrupted intro: reverse from where it is instead of jumping to the end first.
			active.delete(root);
			running.resolve();
			timeline = running.timeline;
			timeline.eventCallback('onComplete', null);
		} else {
			timeline = build(root, graphic);
			timeline.progress(1, true);
		}
		const done = () => {
			active.delete(root);
			timeline.kill();
			gsap.set(animated(root), { clearProps: CLEARED });
			gsap.set(root, { autoAlpha: 0 });
			resolve();
		};
		if (timeline.progress() === 0) return done();
		timeline.timeScale(Math.max(2, timeline.duration() / MAX_EXIT_SECONDS));
		timeline.eventCallback('onReverseComplete', done);
		active.set(root, { timeline, resolve, phase: 'stop' });
		timeline.reverse();
	});
}
