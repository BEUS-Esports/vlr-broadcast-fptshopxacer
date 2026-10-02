export function resolveTemplate<T>(
	slug: string | null | undefined,
	templates: Record<string, T> & { test: T }
): T {
	return slug && Object.hasOwn(templates, slug) ? templates[slug] : templates.test;
}
