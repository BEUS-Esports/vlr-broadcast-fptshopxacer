import type { Component } from 'svelte';
import type { GraphicId } from './controls';
import type { BroadcastSnapshot } from './types';
import { resolveTemplate } from './template-resolution';
import TestGraphic from './templates/test/Graphic.svelte';

export type GraphicTemplateProps = { snapshot: BroadcastSnapshot; graphic: GraphicId };

// Add templates/<tournament-slug>/Graphic.svelte with the same typed props.
const modules = import.meta.glob<{ default: Component<GraphicTemplateProps> }>(
	'./templates/*/Graphic.svelte',
	{ eager: true }
);
const templates = {
	...Object.fromEntries(
		Object.entries(modules).map(([path, module]) => [
			path.split('/')[2],
			{ id: path.split('/')[2], component: module.default }
		])
	),
	test: { id: 'test', component: TestGraphic }
};

export function resolveGraphicTemplate(slug: string | null | undefined) {
	return resolveTemplate(slug, templates);
}
