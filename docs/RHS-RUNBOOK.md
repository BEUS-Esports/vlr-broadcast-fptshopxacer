# RHS operation and recovery

Use Node **26.13.0**, pnpm **12.16.1**, and one application process. Keep the accepted source/build, `pnpm-lock.yaml`, and `drizzle/` with each release. A clean Windows frozen install and production build passed with this pair on 2026-11-03; no adapter patch is applied by the current lockfile. Linux acceptance remains separate from this Windows verification.

## Back up a stopped show

1. In the terminal that owns the Node server, press **Ctrl+C** and wait for shutdown. The backup command does not stop the app or detect another operator's process; `--app-stopped` is your acknowledgement.
2. From the application directory, run `pnpm backup -- --output "D:\RHS backups\before-upgrade-2026-11-03" --app-stopped`. The parent directory must exist and the destination must be new. `.env` supplies the same `DATABASE_URL` and `ASSET_DIR` used by the app.
3. Check `manifest.json`: `complete` must be true. It records schema/migrations, Node/package-manager versions, commit and working-tree state, build/lock hashes and file hashes. The `INCOMPLETE` notice is deliberately retained and tells you that only the completed manifest certifies a finished copy. A failed command must not be treated as a backup.
4. Protect the encryption root **separately**. If `SETTINGS_ENCRYPTION_KEY` is set, retain that exact secret in your protected credential storage. Otherwise retain `SETTINGS_ENCRYPTION_KEY_FILE`, or the default `data/settings.key`. The manifest records the source and availability, never the key. A missing key prevents decryption of existing encrypted settings; generating a new key does not recover them.
5. Restart the accepted build with `node --env-file=.env build` when no upgrade is planned.

`database.db` is copied through SQLite's backup API, including committed WAL records. `assets/` contains the complete asset store. The command rejects missing stores, existing destinations, destinations inside the store, links in the store, and encryption-key files inside the store. It leaves event data unchanged. Never use `db:push` on event data.

## Restore rehearsal in a fresh directory

1. Use a fresh application checkout with the **matching accepted build**, lockfile and migrations. Check the manifest's file hashes before copying its `database.db` and complete `assets/` store into fresh locations. Preserve the original backup.
2. Restore the separately held key, and configure `DATABASE_URL=file:<absolute-restored-db-path>`, `ASSET_DIR=<absolute-restored-assets-path>` and the matching key setting. Keep secrets out of command output and Git. Restore the original build environment, including its origin and upload limit.
3. For a different rehearsal address, rebuild with that exact `ORIGIN`. Example PowerShell: `$env:ORIGIN = 'http://127.0.0.1:4180'`, then `pnpm build`; set `$env:HOST = '127.0.0.1'` and `$env:PORT = '4180'`, then `node --env-file=.env build`. Run one process per restored database.
4. Open `/admin/graphics`, confirm the selected game and saved edits, then open the previously shown graphic URL. Its shown version must survive, including artwork, while newer saved edits remain in Preview. Check Settings can read the restored encrypted configuration without exposing credentials. Test all seven individual outputs before returning to air.
5. Stop the rehearsal process with **Ctrl+C**. Record the elapsed stop-to-working-output time and build/backup identities. Replacing production data requires operator confirmation; preserve newer event edits before any restore.

Automated disposable rehearsal on 2026-11-03: `pnpm exec vitest run --project server src/lib/server/backup-restore.test.ts` passed (1 test; 1.37 seconds runner time). It created a populated event and held graphic, saved later edits, encrypted a synthetic credential, closed the source, backed up, reopened the copy with a separately restored key, and verified held/saved data, decryption and the application's asset HTTP handler. This is application-service/route evidence; the timed production-process/LAN rehearsal remains pending.

## Before a release

Run check, tests, build and browser checks sequentially because they share generated files. Use disposable databases for migration tests. Refresh output/admin browser documents after a snapshot-format upgrade. Keep the old binary with its matching pre-upgrade database/assets/key backup: a Git revert alone cannot undo a newer capture format.

Reserve three hours with the operator and vMix PC: 60 minutes for cold outputs and every graphic, 60 minutes for performance/provider loss/recovery/restart, and 60 minutes for restore/source fallback/operator checks. Real provider sessions, final artwork and vMix measurements remain physical acceptance work.

Management access stays on the trusted operator LAN for the first RHS, as confirmed on 2026-11-03. The shared-password gate is deferred. Full accounts, Docker and the combined Preview/Program workspace remain separate later projects.

## Implementation checkpoint — 2026-11-03

Image preparation/retries, plain-text logs, sidebar icons, runtime metadata and backup tooling are implemented. The shared output owner and `/gfx/live/composite` route are a partial B1 checkpoint: browser-route acceptance, output links, composition and vMix measurements remain pending. C controls are paused before implementation; their unfinished test is retained outside the active source tree.

Pre-commit verification: Svelte/TypeScript reports zero errors or warnings; ESLint and formatting of changed files pass. All seven backup/seed script tests pass. The complete Vitest run reports 441 passed, two skipped and one failure: `PlayerCard.svelte.test.ts` expects “Powered by ValoSpectra” while the unchanged component renders “Powered by Spectra”. The same failure was reproduced in the clean pre-change checkout. Existing Vitest/Svelte integration warnings also appeared. Global formatting still flags the unchanged `POSSIBLE_IMPROVEMENTS.md`.

At that checkpoint, production Playwright journeys were unverified: the earlier elevated launch was rejected, and the sandbox build failed with `spawn EPERM`. That checkpoint was for source control, not production-release acceptance.

## Composite rehearsal — 2026-11-03

Global Setup links to `/gfx/live/composite` for rehearsal. Production-build Playwright checks passed for all seven individual graphics against the composite, Show/Hide, reloading held graphics, concurrent Player Lineup and Map Veto, and one connection to each stream with one initial resource request. These checks do not establish visual compatibility or vMix performance.

The full Playwright suite passed on 2026-11-03 (28 tests, Chrome). The image tests now restore their lineup and portrait fixtures so later journeys start with the expected data. The full Vitest suite still has the previously documented attribution-text failure.

1. On the vMix PC, record the build identity, fixture, resolution, frame rate and duration. With seven individual browser sources, record active connections, vMix frame/render performance and any dropped frames for 30 minutes.
2. Without changing the PC, fixture, scene settings or duration, replace them with the composite and record the same measurements for 30 minutes. Inspect transparency and each intended combination on the actual output.
3. Check the proposed back-to-front order: In-Game, Map Veto, Player Lineup, Agent Select, Post-Game, Player Stats, MVP. Record which simultaneous combinations are acceptable; full-screen graphics may overlap. Confirm native/external HUD switching, attribution, provider loss, reconnect and restart.
4. Compare the measurements numerically. Use the composite on air only after the operator accepts the composition and performance does not regress. Rehearse switching back to the seven individual URLs; one composite browser failure affects every layer.
