# Startup Migrations Design

**Why:** an upgrade should be `git pull` plus `docker compose up -d --build`, with no separate `pnpm db:migrate` step that someone can forget. Without migrations, new code runs on the old schema and fails with SQL errors when a page touches what changed, possibly mid-show.

## Approaches

- **A. Migrate in the app's startup hook (chosen).** It works wherever `node build` runs (Docker, Windows, `vite dev`), and uses the Drizzle migrator already bundled in the build.
- **B. A container entry script before `node build`.** Rejected: it only covers Docker, and Drizzle would have to move into runtime dependencies.

## Behaviour

On server start (never while `building`), in `src/hooks.server.ts` `init`, before the first request is served:

1. Read the bundled migration journal (`drizzle/meta/_journal.json`) and the applied rows in `__drizzle_migrations`.
2. **Nothing pending:** continue as today.
3. **Pending, and the database already has applied migrations:**
   - Take a full backup with the existing `createBackup` from `scripts/backup.mjs` (`appStopped: true`; nothing is serving yet).
   - The backup goes to `data/backups/<UTC timestamp>-before-<last pending tag>/`. Create `data/backups/` if it's missing.
   - If the backup fails, do not migrate.
4. **Pending on a new or empty database:** migrate without a backup, because there is nothing to protect.
5. **Apply:** `migrate(db, { migrationsFolder: 'drizzle' })`. This is one transaction, so a failure rolls back completely.
6. **Logging:**
   - Success: one `logEvent` with the applied tags and the backup path.
   - Failure (backup or migrate): log the error with the backup path if there is one, then exit non-zero. The server never serves on a half-known schema, and Docker's restart loop keeps the error visible in `docker compose logs app`.

## Constraints

- **Image:** the Dockerfile copies `drizzle/` into the runtime image next to `build/`. `data/backups/` stays inside the `./data` bind mount and is gitignored.
- **Contents of each backup:** the database and assets, exactly as `pnpm backup` makes them today. The encryption key is not copied; it stays in `data/settings.key`.
- **Retention:** no automatic pruning of old backups. Deleting them is a deliberate operator action.
- **`db:push`:** still never used on event data.

## Rule change (docs)

The old rule was "back up, rehearse `pnpm db:migrate` on a copy, then apply during a planned event upgrade". The new rule:

- Upgrades happen between shows, never during one.
- Startup backs up and migrates automatically. Restore from `data/backups/…` with the [RHS runbook](../../RHS-RUNBOOK.md) if the result is wrong.
- **Optional rehearsal:** start the new build against a copy of the database to preview on-air effects (such as 0007 hiding shown graphics).

Update the Docker section and "Upgrading an existing installation" in `docs/BROADCAST-OPERATIONS.md`, the schema rule in `README.md`, and the "The app does not migrate on startup" line.

## Non-goals

- Downgrade or rollback migrations.
- Pruning old backups.
- Migrating any database other than `DATABASE_URL`.

## Left to the builder

- Exact log event names.
- How `scripts/backup.mjs` is imported into the server bundle.
- Test layout. Tests must cover: nothing pending (no backup), pending with existing data (backup, then migrate), backup failure (no migration, non-zero exit), and migrate failure (rollback, backup kept).
