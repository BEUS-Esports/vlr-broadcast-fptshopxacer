# QA baseline — 2026-11-16

Automated quality baseline taken before the first tournament use. It records what was run, what passed, what the coverage numbers do and do not prove, and what is still unverified. Re-run the commands in [How to reproduce](#how-to-reproduce) and compare against this page after any change.

| Item     | Value                                                                                        |
| -------- | -------------------------------------------------------------------------------------------- |
| Commit   | `6e464aa` plus two uncommitted changes: the Finding 1 test fix and the coverage config below |
| Platform | Linux 7.3.4 (CachyOS), Node 26.13.0, pnpm 12.16.1                                            |
| Browser  | Playwright bundled Chromium, headless (`PLAYWRIGHT_CHANNEL` unset)                           |
| Data     | Disposable databases and asset directories only                                              |

The local/event database (`local.db`) was not read, migrated or written. Nothing here was run on Windows, in OBS/vMix, or against a real Spectra, GStack or HenrikDev service.

## Verdict

**The automated baseline is green: every automated check passes except one Prettier warning on a Markdown file.** The first run had one failing browser journey, caused by a timing fault in the test itself; it is fixed (see [Finding 1](#1-two-operator-conflict-journey-failed-test-race-fixed)). Coverage clears the global, `.svelte` and per-directory floors (see [Coverage](#coverage)).

Passing automation is not the same as broadcast-ready. The items under [Not covered by this baseline](#not-covered-by-this-baseline) need a rehearsal on the event machine before going on air.

## Results

| Check               | Command                             | Result                                                 |
| ------------------- | ----------------------------------- | ------------------------------------------------------ |
| Formatting          | `pnpm exec prettier --check .`      | **Fails**: 1 file (`POSSIBLE_IMPROVEMENTS.md`)         |
| Lint                | `pnpm exec eslint .`                | Pass, no output                                        |
| Types               | `pnpm check`                        | Pass: 0 errors, 0 warnings, 6137 files                 |
| Seed script         | `pnpm test:seed`                    | Pass: 1/1                                              |
| Backup script       | `pnpm test:backup`                  | Pass: 6/6                                              |
| Unit and component  | `pnpm test:unit`                    | Pass: 78 files, 450 passed, 2 skipped, 31 s            |
| Coverage thresholds | (same run)                          | Pass: global, `.svelte` and per-directory floors       |
| Production build    | `vite build` (run by the E2E setup) | Pass                                                   |
| Browser journeys    | `pnpm exec playwright test`         | Pass: 31/31, 3.6 min (first run: 30/31, see Finding 1) |
| Dependency audit    | `pnpm audit` / `pnpm audit --prod`  | 2 advisories in dev tooling only; production: none     |

`pnpm lint` as a whole exits non-zero because of the one formatting warning. ESLint itself is clean.

The two skipped unit tests are expected. `management-reopen.test.ts` re-runs itself in writer/reader child processes and uses `it.skipIf` so each process runs only its own role.

## Coverage

Istanbul, configured in `vite.config.ts`. The figures below are from the final configuration:

- `include: ['src/**/*.{ts,tsx,svelte}']`
- `exclude`: `src/lib/server/db/schema/**` (Drizzle relation/index callbacks never run in tests), `src/lib/server/testing/**` (test helpers, not product code) and `src/lib/broadcast/templates/beus-graph-test/**` (throwaway test artwork with no tests)
- Global floors: 71 / 67 / 74 / 70 % (statements / branches / functions / lines)

`.svelte` files were first added to the measurement after the original `.ts`-only baseline (83.05 / 83.52 / 87.53 / 84.04 %, floor 80 %), which dropped the global figure and required lowering the floors to the values below.

| Metric     | Covered / total | Percent | Threshold | Margin |
| ---------- | --------------- | ------- | --------- | ------ |
| Statements | 6047 / 8124     | 74.43 % | 71 %      | +3.43  |
| Branches   | 4223 / 5994     | 70.45 % | 67 %      | +3.45  |
| Functions  | 1551 / 1999     | 77.58 % | 74 %      | +3.58  |
| Lines      | 4519 / 6159     | 73.37 % | 70 %      | +3.37  |

By file type: 80 `.ts` files measure 83.1 / 83.5 / 87.5 / 84.0 %; 59 `.svelte` files measure 64.2 / 48.2 / 68.5 / 54.1 %. The `.svelte` figure has its own floor (`src/**/*.svelte`: 61 / 45 / 65 / 51 %) so strong `.ts` coverage cannot hide untested components. The weakest are the admin route pages (`src/routes/admin/**`, 0 %, covered only by Playwright) and `components/admin/graphics` (about 50 % statements).

### Per-directory floors

The global figure lets a well-tested area hide a weak one, so the areas that matter on air also have their own floors. They sit a few points under the measured values: their job is to catch regressions, not to force new tests. A deliberately raised floor was confirmed to fail the run, so they are enforced.

| Area                          | Floor (stmts / branch / funcs / lines) | Measured (stmts / branch / funcs) |
| ----------------------------- | -------------------------------------- | --------------------------------- |
| `src/lib/broadcast/**`        | 90 / 88 / 90 / 90                      | 96.3 / 88.8 / 97.4                |
| `src/lib/server/services/**`  | 86 / 84 / 88 / 86                      | 90.0 / 88.4 / 93.3                |
| `src/lib/server/post-game/**` | 88 / 85 / 90 / 88                      | 93.4 / 89.9 / 100.0               |
| `src/lib/server/live/**`      | 82 / 75 / 82 / 84                      | 85.8 / 78.9 / 86.8                |

The live-provider branch floor is 75 % because that area measures 78.9 %. Raise it as reconnect and error-path tests are added. Route files stay in the global figure with no floor: they are low because Playwright covers them and Vitest does not, and excluding them would hide that.

### What the number does not include

- **Route pages count at 0 %.** The `+page.svelte` files under `src/routes/admin/**` and `src/routes/gfx/**` are in the figure but only Playwright exercises them.
- **Playwright journeys do not count.** Coverage comes only from Vitest. Code reached solely by E2E shows as uncovered.
- **Floors are per area, not per file.** A single untested file inside a passing area is not flagged.
- Before the exclusions, 92 of 100 non-test `.ts` files appeared in the report. The other eight are type-only or re-export files, plus `admin/graphics/+layout.server.ts` and `admin/graphics/+page.server.ts`, which contain no measured statements.

### By area

| Area                       | Files | Statements | Stmts %  | Branch % | Funcs % |
| -------------------------- | ----- | ---------- | -------- | -------- | ------- |
| `src/lib/broadcast`        | 9     | 309        | 96.8     | 92.3     | 97.8    |
| `src/lib/live`             | 5     | 180        | 93.3     | 92.5     | 96.4    |
| `src/lib/server/post-game` | 7     | 503        | 93.4     | 89.9     | 100.0   |
| `src/lib/server/broadcast` | 3     | 158        | 93.7     | 90.4     | 93.8    |
| `src/lib/server/*` (top)   | 5     | 267        | 92.9     | 86.3     | 94.0    |
| `src/lib/server/services`  | 19    | 1265       | 90.0     | 88.4     | 93.3    |
| `src/lib/server/live`      | 10    | 1116       | 85.8     | 78.9     | 86.8    |
| `src/lib/server/settings`  | 1     | 108        | 78.7     | 78.8     | 100.0   |
| `src/routes/admin`         | 11    | 435        | **23.0** | 25.3     | 20.3    |
| `src/routes/api`           | 3     | 11         | **0.0**  | —        | 0.0     |

Area figures are from the first run. `src/lib/server/db/schema` and `src/lib/server/testing` are now excluded.

### Real gaps

The domain and service layers are well covered. The weak spot is the **route layer**: the form actions and endpoints that sit between the operator's browser and the services.

| File                                                          | Statements | Covered                 | Reached by E2E?                   |
| ------------------------------------------------------------- | ---------- | ----------------------- | --------------------------------- |
| `src/routes/admin/games/[gameId]/+page.server.ts`             | 135        | 36.3 %                  | Yes (phase 3, 5.1, 7 journeys)    |
| `src/routes/admin/matches/[matchId]/+page.server.ts`          | 77         | 0 %                     | Yes (phase 3, 5.1 journeys)       |
| `src/routes/admin/tournaments/[tournamentId]/+page.server.ts` | 71         | 0 %                     | Yes (phase 3 journeys)            |
| `src/routes/admin/resources/+page.server.ts`                  | 35         | 22.9 %                  | Partly (profile save/reopen)      |
| `src/routes/admin/live/+server.ts`                            | 23         | 0 %                     | Yes (phase 6 journey)             |
| `src/routes/admin/settings/+page.server.ts`                   | 15         | 0 %                     | Not confirmed                     |
| `src/routes/api/**` (3 SSE/resource endpoints)                | 11         | 0 %                     | Yes (broadcast and live journeys) |
| `src/lib/server/services/graphics-control.ts`                 | 49         | 53.1 %                  | Yes (phase 5 journeys)            |
| `src/lib/server/live/runtime.ts`                              | 94         | 66.0 %                  | Partly (fixture provider only)    |
| `src/lib/live/client.ts`                                      | 28         | 64.3 %, branches 14.3 % | Partly                            |

"Reached by E2E" is judged from the journey titles and routes hit in the E2E server log, not from measured coverage. Most of these files are thin wrappers that the browser journeys do exercise, so the practical risk is lower than the percentages suggest. The two that deserve direct attention are below, because their failure paths only occur with a real provider:

- `src/lib/server/live/runtime.ts` (branches 58 %) and `src/lib/server/live/providers/spectra.ts` (branches 59 %): reconnect, resync and error branches of the live provider session.
- `src/lib/server/live/publisher.ts` (branches 60 %) and `src/lib/live/client.ts` (branches 14 %): the path that delivers live data to the output pages and its retry handling.

## Browser journeys

31 journeys across 20 files, run serially against the real adapter-node build with a migrated temporary database and local provider fixtures. All seven graphics, the composite output, Show/Hide capture behaviour, stale-draft protection, duplication, live-provider fallback, and both post-game import providers have at least one passing journey.

| Result | Journey                                                                                 |
| ------ | --------------------------------------------------------------------------------------- |
| Pass   | All 31, including `phase3-conflicts.e2e.ts:75` (failed in the first run, see Finding 1) |

## Findings

### 1. Two-operator conflict journey failed (test race) — fixed

In the first run `tests/phase3-conflicts.e2e.ts:75` failed every time, both in the full run and alone, with a timeout waiting for the `Alpha slot 1` combobox.

Cause: the test clicked the **Lineup** tab and immediately opened the second operator's page with `other.goto(page.url())`. Tab changes go through SvelteKit `goto()` (`ManagementWorkspace.svelte:18`), which updates the URL asynchronously. The trace showed the second page was sent to `/admin/games/<id>` without `?tab=lineup`, so it opened on **Info**, where the lineup controls do not exist. This was a fault in the test, not in the application.

Fix: wait for the URL before reading it.

```ts
await expect(page).toHaveURL(/[?&]tab=lineup/);
```

With that line the full suite passes 31/31. Earlier phase records list this journey as passing, so the timing changed at some point (dependency updates are the likely reason; not investigated).

### 2. A full E2E run modifies tracked documentation

`phase5-controller`, `phase5.1-visuals` and the phase 6.1 journey write screenshots into `docs/`. After a full run, six tracked PNGs in `docs/phase-6.1-screenshots/` were modified and two untracked directories (`docs/phase-5-screenshots/`, `docs/phase-5.1-screenshots/`) were created. Expect a dirty tree after every full run, and do not commit those changes by accident.

### 3. README links to moved documents

Four verification links in `README.md` point at `./docs/2026-10-0x-….md`. Those files now live in `docs/superpowers/plans/`:

- `2026-10-01-phase-5-verification.md`
- `2026-10-02-phase-5.1-verification.md`
- `2026-10-03-phase-6-live-providers-external-hud.md`
- `2026-10-05-phase-7-verification.md`

### 4. `pnpm lint` fails on one Markdown file

Prettier flags `POSSIBLE_IMPROVEMENTS.md`. No source file is affected.

### 5. Noise in the unit run

The Vitest browser project prints `TypeError: Cannot read properties of undefined (reading 'wrapDynamicImport')` four times at start-up and one Svelte `derived_inert` warning. The same `derived_inert` warning appears in the browser console during the E2E game-creation flow. No test fails because of either. The `derived_inert` warning means a derived value was read after its owner was destroyed, which can yield a stale value; its source was not traced.

### 6. Dependency advisories

Both are in development tooling and are not in the production dependency tree (`pnpm audit --prod` reports none).

| Severity | Package     | Path                               | Fix available |
| -------- | ----------- | ---------------------------------- | ------------- |
| Moderate | `minimatch` | via `typescript-eslint`            | `>=11.0.1`    |
| Low      | `deepmerge` | via `@sveltejs/vite-plugin-svelte` | None yet      |

### 7. Test script details

- `pnpm test` chains with `npm run` and stops at the first failure, so it never reaches E2E if the unit stage fails, and it does not include `test:backup`.
- `test:e2e` runs `playwright install` first, which downloads browsers on a machine that lacks them. An offline event machine needs them installed beforehand or `PLAYWRIGHT_CHANNEL=chrome`.

## Not covered by this baseline

None of the following is proven by any automated check here. Several are already called out as open in the README.

- **Real providers.** Spectra live data, Spectra hosted statistics, GStack and HenrikDev custom/event matches were exercised only through local fixtures.
- **The event machine.** No run on Windows, with the production `ORIGIN`, or from a second PC over the LAN.
- **OBS/vMix.** Rendering, transparency, composite performance and the seven individual browser sources.
- **The event database.** Migrations 0004–0013 against a copy of the real data, and backup/restore per `docs/RHS-RUNBOOK.md`.
- **Endurance.** Hours-long SSE connections, server restart during a match, and log rotation under load.
- **Access control.** Management routes have no sign-in; safety depends on the network.
- **Final artwork.** Only the generic Test GFX v2 templates are checked.
- **Visual regression.** Screenshots are produced but never compared against a reference.

## How to reproduce

Run sequentially; check, build and E2E share generated files.

```sh
pnpm install --frozen-lockfile
pnpm exec prettier --check .
pnpm exec eslint .
pnpm check
pnpm test:seed
pnpm test:backup
pnpm test:unit            # prints the coverage table; fails below the configured floors
pnpm exec playwright test # builds, starts its own app on port 4173
git status --short        # expect screenshot changes under docs/ (Finding 2)
```

For per-file coverage, add `--coverage.reporter=html` to the Vitest command and open `coverage/index.html`.
