import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	test: {
		// Keep browser and native database integration tests within the same machine's capacity.
		maxWorkers: 2,
		expect: { requireAssertions: true },
		coverage: {
			include: ['src/**/*.{ts,tsx,svelte}'],
			// Schema callbacks never run in tests, test helpers are not product code, and the
			// beus-graph-test templates are throwaway test artwork with no tests.
			exclude: [
				'src/lib/server/db/schema/**',
				'src/lib/server/testing/**',
				'src/lib/broadcast/templates/beus-graph-test/**'
			],
			provider: 'istanbul',
			thresholds: {
				// Regression floors a few points under the 2026-11-16 baseline (docs/QA-BASELINE.md).
				// Raise them as coverage improves; the component floor is separate so strong .ts
				// coverage cannot hide an untested .svelte file.
				statements: 71,
				branches: 67,
				functions: 74,
				lines: 70,
				'src/**/*.svelte': { statements: 61, branches: 45, functions: 65, lines: 51 },
				'src/lib/broadcast/**': { statements: 90, branches: 88, functions: 90, lines: 90 },
				'src/lib/server/services/**': { statements: 86, branches: 84, functions: 88, lines: 86 },
				'src/lib/server/post-game/**': { statements: 88, branches: 85, functions: 90, lines: 88 },
				'src/lib/server/live/**': { statements: 82, branches: 75, functions: 82, lines: 84 }
			}
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright({ launchOptions: { channel: process.env.PLAYWRIGHT_CHANNEL } }),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					pool: 'forks',
					globalSetup: ['./src/lib/server/testing/database-cleanup.ts'],
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
