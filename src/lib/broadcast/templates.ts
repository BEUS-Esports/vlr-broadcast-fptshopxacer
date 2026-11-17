import type { Component } from 'svelte';
import type { GraphicId } from './controls';
import type { BroadcastSnapshot } from './types';
import type { SponsorSupport } from './sponsor';
import { resolveTemplate } from './template-resolution';
import TestGraphic from './templates/test/Graphic.svelte';

export type GraphicTemplateProps = { snapshot: BroadcastSnapshot; graphic: GraphicId };

// Add templates/<tournament-slug>/Graphic.svelte with the same typed props. A template opts in to
// sponsor elements by exporting `sponsor` (SponsorSupport) from a `<script module>` block.
const noSponsor: SponsorSupport = { banners: false, loop: false };
const modules = import.meta.glob<{
	default: Component<GraphicTemplateProps>;
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
