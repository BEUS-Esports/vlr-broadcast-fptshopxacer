import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Share the disposable paths with workers and the separately launched app.
process.env.VLR_E2E_DIR ??= mkdtempSync(join(tmpdir(), 'vlr-e2e-'));
process.env.DATABASE_URL = `file:${join(process.env.VLR_E2E_DIR, 'app.db')}`;
process.env.ASSET_DIR = join(process.env.VLR_E2E_DIR, 'assets');

export default defineConfig({
	// ponytail: one shared live selection; isolate apps per worker if suite speed matters.
	workers: 1,
	globalSetup: './tests/setup.ts',
	use: {
		baseURL: 'http://localhost:4173',
		channel: process.env.PLAYWRIGHT_CHANNEL,
		actionTimeout: 10_000,
		navigationTimeout: 15_000,
		trace: 'retain-on-failure'
	},
	testMatch: '**/*.e2e.{ts,js}'
});
