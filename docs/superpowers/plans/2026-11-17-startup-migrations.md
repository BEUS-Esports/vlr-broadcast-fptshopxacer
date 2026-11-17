# Startup Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every server start, the app backs up an existing database and applies pending Drizzle migrations by itself, or refuses to start.

**Architecture:** A new server module, `src/lib/server/db/startup-migrations.ts`, works out which migrations are pending, then calls the existing `createBackup` from `scripts/backup.mjs` and the bundled Drizzle `migrate`. `init` in `src/hooks.server.ts` awaits it before anything else starts, and exits non-zero on failure. The Docker image now ships `drizzle/`. The docs replace the manual-migrate rule.

**Tech Stack:** SvelteKit 3 `ServerInit`, `drizzle-orm/libsql/migrator`, `@libsql/client`, `node:sqlite` (via `scripts/backup.mjs`), and vitest `server` project.

**Spec:** [docs/superpowers/specs/2026-11-17-startup-migrations-design.md](../specs/2026-11-17-startup-migrations-design.md)

## Global Constraints

- Never run while `building`. Never run on any database other than the app's `db` (`DATABASE_URL`).
- **Pending** means journal entries (`<migrationsFolder>/meta/_journal.json`) whose `when` is greater than `MAX(created_at)` in `__drizzle_migrations`. This matches Drizzle's own rule. A missing table counts as nothing applied.
- **Backup:** only when something is pending **and** at least one migration is already applied. Path: `data/backups/<now().toISOString() with ':' and '.' replaced by '-'>-before-<last pending tag>/`, resolved from `process.cwd()`. Create `data/backups/` (recursive) first, call `createBackup({ output, appStopped: true })`, and if it fails, do not migrate.
- **Migrate:** `migrate(db, { migrationsFolder })`. A failure rolls back as one batch.
- **Errors:** messages name the backup path when there is one: `Database migration failed; the pre-migration backup is at <path>.` or `Database migration failed; no backup was needed.` A backup failure says `Pre-migration backup failed; no migrations were applied.` In both cases the original error is the `cause`.
- **Log events:** `db.migrations.applied` with `{ applied: <comma-joined tags>, backup: <path or null> }` on success. `db.migrations.failed` (error) before `process.exit(1)` on failure.
- `data/backups/` is gitignored and never pruned.
- Svelte files are untouched. Run `pnpm check` and lint on the changed files before each commit (`pnpm lint` has three pre-existing failures in unrelated files).

## Review Focus

1. **Bundling `scripts/backup.mjs` into the server build:** its CLI guard (`process.argv[1] === import.meta.url`) must not fire inside `build/`. Expected: `node build` starts without printing "Backup failed"/"Usage". Pinned in Task 2 Step 5 (the image smoke test checks the container log).
2. **Fresh deployment with no `broadcast.db`:** expected to create the file, apply all 17 migrations with no backup, and serve. Pinned in Task 1 (`migrates a new database without a backup`) and Task 2 Step 5.
3. **Partial failure:** a failing migration must leave the database exactly as before, and keep the backup. Pinned in Task 1 (`rolls back a failing migration and keeps the backup`).
4. **Startup ordering:** asset cleanup and live sync must not touch the database before migrations finish. Expected: `init` awaits migrations first. Pinned in Task 2's hooks test (`startAssetCleanup` is not called when migration fails).
5. **Dev server:** `vite dev` re-runs `init` on hot reload. When nothing is pending it must do no work and take no backup. Pinned in Task 1 (`does nothing when no migration is pending`).

---

### Task 1: `migrateOnStartup`

**Files:**

- Create: `src/lib/server/db/startup-migrations.ts`, `src/lib/server/db/startup-migrations.test.ts`

**Interfaces:**

- Produces: `migrateOnStartup(db: LibSQLDatabase<Record<string, unknown>>, options?: { migrationsFolder?: string; backupRoot?: string; now?: () => Date; backup?: (output: string) => Promise<unknown> }): Promise<{ applied: string[]; backup: string | null }>`.
  - `migrationsFolder` defaults to `resolve('drizzle')` and `backupRoot` to `resolve('data/backups')`.
  - `backup` defaults to `(output) => createBackup({ output, appStopped: true })`, imported from `scripts/backup.mjs` (relative import). Add a `// @ts-expect-error` or a `.d.mts` only if `pnpm check` demands one.
  - The function reads applied rows with `db.$client.execute(...)`.

- [ ] **Step 1: Write the failing tests** in `startup-migrations.test.ts`.
  - **Setup:** each test gets a `mkdtemp` directory with `app.db`, an `assets/` folder, and `process.env` `DATABASE_URL`/`ASSET_DIR`/`SETTINGS_ENCRYPTION_KEY_FILE` pointing into it (restore them in `afterEach`). Use the client and Drizzle instance the way `management-fixture.ts` does. Close clients and remove the directory with `removeTestDatabase`.
  - `"partial"` folder: a temp copy of `drizzle/` whose journal drops its last entry.
  - **Tests:**
    - `does nothing when no migration is pending`: migrate with the real folder first. The result is `{ applied: [], backup: null }`, and `backupRoot` doesn't exist.
    - `backs up existing data, then applies pending migrations`: migrate with the "partial" folder, then insert a team. With the real folder the result has `applied` equal to `[<last tag>]`, and `backup` equals `join(backupRoot, '<ts>-before-<last tag>')` with `now` fixed to `new Date('2026-11-17T01:02:03.004Z')` (`2026-11-17T01-02-03-004Z`). That directory's `manifest.json` has `complete: true`. `__drizzle_migrations` has 17 rows, and the team row still exists.
    - `migrates a new database without a backup`: on an empty file the result has 17 tags and `backup: null`.
    - `does not migrate when the backup fails`: on the "partial" DB with `backup: () => Promise.reject(new Error('disk full'))`, it rejects with `/Pre-migration backup failed; no migrations were applied/`, and there are still 16 rows.
    - `rolls back a failing migration and keeps the backup`: use a folder made of the real copy plus a journal entry `{ idx: 17, version: '6', when: <last when + 1>, tag: '9999_broken', breakpoints: true }` and `9999_broken.sql` containing `CREATE TABLE broken_one (id integer);\n--> statement-breakpoint\nCREATE TABL broken_two (id integer);`, on a fully migrated DB. It rejects with `/the pre-migration backup is at .*before-9999_broken/`. There are still 17 rows, there is no `broken_one` table, and the backup directory exists.
- [ ] **Step 2: Run `pnpm exec vitest run --project server src/lib/server/db/startup-migrations.test.ts`.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement `migrateOnStartup`** in `startup-migrations.ts` as specified.
- [ ] **Step 4: Re-run the same command.** Expected: 5 passed.
- [ ] **Step 5: Commit:** `feat(db): apply pending migrations with a backup first`

### Task 2: Run it at startup and ship the migrations

**Files:**

- Modify: `src/hooks.server.ts` (`init` becomes `async`), `src/hooks.server.test.ts`, `Dockerfile` (runtime stage: `COPY drizzle ./drizzle`), `.gitignore` (`/data/backups/`)

**Interfaces:**

- Consumes: `migrateOnStartup(db)` from Task 1, and `db` from `#lib/server/db/index.ts`.
- `init` order: log level → file logging → `await migrateOnStartup(db)` (log `db.migrations.applied` only when `applied.length`) → `startAssetCleanup()` → shutdown wiring → `server.started`. On a throw: `logEvent('error', 'db.migrations.failed', {}, error)`, `await logger.flush()`, `process.exit(1)`.

- [ ] **Step 1: Write failing hooks tests.** Mock `#lib/server/db/startup-migrations.ts` (and `#lib/server/db/index.ts` with `{ db: {} }`).
  - Existing test: still passes with the mock resolving `{ applied: [], backup: null }`.
  - New `stops before serving when migrations fail`: the mock rejects, and `process.exit` is spied with an implementation that does nothing. Expect `process.exit` to have been called with `1`, a `db.migrations.failed` record at level `ERROR`, and `startAssetCleanup` not called during that `init`.
- [ ] **Step 2: Run `pnpm exec vitest run --project server src/hooks.server.test.ts`.** Expected: the new test FAILS.
- [ ] **Step 3: Implement the `init` change, the Dockerfile `COPY drizzle ./drizzle`, and the `.gitignore` line.**
- [ ] **Step 4: Re-run the Step 2 command.** Expected: all pass. Then run `pnpm check`. Expected: 0 errors.
- [ ] **Step 5: Image smoke test on a fresh data dir.** Build the image. Run it as in the HTTPS plan's Task 2 smoke, with an **empty** `$D` holding only `assets/` (no `broadcast.db`) and `LOG_DIR=./data/logs`. Expected:
  - `/admin` returns 200, and `sqlite3 "$D/broadcast.db" 'select count(*) from __drizzle_migrations'` prints 17.
  - The container log contains `db.migrations.applied`-style text ("Db migrations applied" in TSLog output) and no `Backup failed` or `Usage:` line. `$D/backups` doesn't exist.
- [ ] **Step 6: Commit:** `feat: migrate the database on startup`

### Task 3: Rule and runbook

**Files:**

- Modify: `docs/BROADCAST-OPERATIONS.md` (Docker one-time setup step 7, "Backups and upgrades", "Upgrading an existing installation"), `README.md:24`

- [ ] **Step 1: Rewrite the docs to the spec's rule.**
  - **Step 7:** the app creates and migrates a new database itself. Remove "The app does not migrate on startup" and the manual `db:migrate` line, but keep `mkdir -p data/assets` and the `.backup` copy option.
  - **Upgrade:** `git pull`, then `docker compose up -d --build`. On start the app backs up to `data/backups/<time>-before-<migration>/` and migrates. If it fails, it stays stopped and `docker compose logs app` names the backup. Restore with the [RHS runbook](./RHS-RUNBOOK.md).
  - Upgrades happen between shows, never during one. Rehearsing the new build against a database copy is optional, to preview on-air effects such as 0007.
  - "Upgrading an existing installation" steps 1–4 get the same rule. Keep the migration table and the 0007/0010 notes.
  - **`README.md:24`:** "Change the schema only with reviewed migrations; the app applies them on startup after an automatic backup. Never `db:push` event data."
  - Expected: Prettier is clean on both files.
- [ ] **Step 2: Redeploy the live stack.** Run `docker compose up -d --build`. Expected: the HTTPS probe passes (`/admin` 200, redirect, SSE). `docker compose logs app` shows `Server started` and no migration line, because nothing is pending. `data/backups/` isn't created.
- [ ] **Step 3: Run the full `pnpm test`.** Expected: unit and e2e all pass. Revert e2e-generated screenshot changes under `docs/phase-*-screenshots/` afterwards.
- [ ] **Step 4: Commit** with `docs: migrations apply on startup after an automatic backup`, then `git push` (this updates PR #8).
