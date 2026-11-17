export function resolveTemplate<T>(
	slug: string | null | undefined,
	templates: Record<string, T> & { test: T }
): T {
	if (!slug) return templates.test;
	if (Object.hasOwn(templates, slug)) return templates[slug];
	// Multi-stop events: `event-stop` slugs share the `event` template; the longest prefix wins.
	const prefix = Object.keys(templates)
		.filter((key) => key !== 'test' && slug.startsWith(`${key}-`))
		.sort((a, b) => b.length - a.length)[0];
	return prefix ? templates[prefix] : templates.test;
}
