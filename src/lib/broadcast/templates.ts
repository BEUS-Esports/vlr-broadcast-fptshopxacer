import type { Component } from 'svelte';
import type { GraphicId } from './controls';
import type { BroadcastSnapshot } from './types';
import type { SponsorSupport } from './sponsor';
import { resolveTemplate } from './template-resolution';
import TestGraphic from './templates/test/Graphic.svelte';

export type GraphicTemplateProps = { snapshot: BroadcastSnapshot; graphic: GraphicId };

// Optional animation contract. A `Graphic.svelte` may export any of these as instance functions
// (`export function play() {...}`); GraphicRenderer awaits them, so a template can run its own
// in/out animation. A missing method falls back to a 150ms fade. `update(snapshot)` is called after
// the `snapshot` prop already holds the new data, so a template only animates the change. Each call
// is bounded by TEMPLATE_ACTION_TIMEOUT_MS: on timeout (or a throw) the renderer warns and cuts.
export type TemplateControls = {
	play?(): Promise<void>;
	stop?(): Promise<void>;
	update?(snapshot: BroadcastSnapshot): Promise<void>;
};
export const TEMPLATE_ACTION_TIMEOUT_MS = 5000;

// Add templates/<tournament-slug>/Graphic.svelte with the same typed props. A template opts in to
// sponsor elements by exporting `sponsor` (SponsorSupport) from a `<script module>` block.
const noSponsor: SponsorSupport = { banners: false, loop: false };
const modules = import.meta.glob<{
	default: Component<GraphicTemplateProps, TemplateControls>;
	sponsor?: SponsorSupport;
}>('./templates/*/Graphic.svelte', { eager: true });
const templates = {
	...Object.fromEntries(
		Object.entries(modules).map(([path, module]) => [
			path.split('/')[2],
			{
				id: path.split('/')[2],
				component: module.default,
				sponsor: module.sponsor ?? noSponsor
			}
		])
	),
	test: { id: 'test', component: TestGraphic, sponsor: noSponsor }
};

export function resolveGraphicTemplate(slug: string | null | undefined) {
	return resolveTemplate(slug, templates);
}
