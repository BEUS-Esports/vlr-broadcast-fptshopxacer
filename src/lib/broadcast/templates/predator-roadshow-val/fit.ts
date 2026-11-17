import type { Attachment } from 'svelte/attachments';

const MIN_SCALE = 0.6;

/**
 * Shrinks every `[data-fit="<group>"]` descendant to one shared size: the scale that makes the
 * widest one fit. Styles read it as `calc(<base> * var(--fit-<group>, 1))`. Groups are independent,
 * so player names and team names each stay consistent among themselves.
 */
export function fitGroup(group: string): Attachment<HTMLElement> {
	return (container) => {
		const property = `--fit-${group}`;
		let frame = 0;
		const measure = () => {
			const items = container.querySelectorAll<HTMLElement>(`[data-fit="${group}"]`);
			container.style.setProperty(property, '1');
			let scale = 1;
			for (const item of items)
				if (item.scrollWidth > item.clientWidth)
					scale = Math.min(scale, item.clientWidth / item.scrollWidth);
			// Round down so sub-pixel text layout cannot overflow by a fraction of a pixel.
			if (scale < 1) scale = Math.max(MIN_SCALE, Math.floor(scale * 100) / 100 - 0.01);
			container.style.setProperty(property, String(scale));
		};
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};
		measure();
		void document.fonts?.ready.then(schedule);
		const observer = new MutationObserver(schedule);
		observer.observe(container, { subtree: true, childList: true, characterData: true });
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
		};
	};
}
