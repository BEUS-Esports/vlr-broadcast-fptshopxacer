# Team & Player Bundle Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import teams and players (with logos and portraits) from one zip, using an upload → preview → confirm flow that writes nothing unless every row is valid and unique.

**Architecture:** The profile rules (name keys, Riot ID format, duplicate messages) live in `src/lib/server/services/profiles.ts`, the single place that inserts teams and players. Case-insensitive unique indexes back them up. A new `src/lib/server/import/` module unzips and parses the bundle (`bundle.ts`), builds a preview with every problem located by file, row and field (`validate.ts`), and exposes two form actions (`actions.ts`). Both `/admin/teams` and `/admin/players` spread these actions in and render one shared `BundleImport.svelte`.

**Tech Stack:** SvelteKit (Svelte 5 runes), Drizzle + libSQL/SQLite, Skeleton UI, Vitest (server and browser projects), Playwright, SheetJS `xlsx` 0.20.3, `fflate` 0.8.3.

**Spec:** `docs/superpowers/specs/2026-11-18-team-player-bundle-import-design.md`

## Global Constraints

- Zip ≤ 32 MB, ≤ 500 entries, ≤ 100 MB total unpacked (declared sizes checked before inflating). Each image ≤ 10 MB.
- `BODY_SIZE_LIMIT` becomes `40M` everywhere it is documented or set.
- Sheet files: `teams.{csv,xlsx,ods}` and `players.{csv,xlsx,ods}`. At least one must be present, and at most one file per table.
- Columns: `teams`: `team_name`, `team_tag`. `players`: `display_name`, `full_name`, `riot_id`. All required as columns. Unknown columns are errors.
- Lengths (existing): team name 1–100, team tag 1–20, display name 1–100, full name ≤ 150, Riot ID ≤ 100.
- Riot ID: exactly one `#`. Game name `/^[\p{L}\p{N} ]{3,16}$/u`, tagline `/^[\p{L}\p{N}]{3,5}$/u`, each trimmed. Required in the import. Optional in the manual form, checked there only when the value changed.
- Comparison key for every name, tag, Riot ID and image filename: `value.normalize('NFC').trim().toLocaleLowerCase()`.
- Duplicates are checked against all rows, archived included.
- Image extensions `.png .jpg .jpeg .webp`, with content sniffed by `imageType` in `src/lib/server/assets.ts`.
- `xlsx` and `fflate` go in `devDependencies` (Vite bundles them into the server build, like `drizzle-orm`). `xlsx` comes from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- Never touch `tournament_entries` / `tournament_entry_players`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Excel-saved CSV:** UTF-8 BOM, CRLF line endings, and quoted fields with commas (`"VNUHCM – University of Science, HCM"`) must parse into the right cells. Test in Task 3.
2. **Leading zeros:** CSV values like tag `007` must stay `"007"`, not become the number `7`. Test in Task 3.
3. **macOS (NFD) filenames:** a zip made on macOS stores `player_images/Thắng#VN2.png` in decomposed Unicode, and it must still match riot_id `Thắng#VN2` typed in NFC. Test in Task 4.
4. **File swapped after preview:** picking a different file must disable Confirm in the browser. A commit with a hash that doesn't match must write nothing and return the new preview. Tests in Tasks 5 and 6.
5. **Clash added between preview and commit** (another operator creates the same team): commit re-validates, writes nothing, saves no images, and shows the clash. Test in Task 5.

---

### Task 1: Profile rules, unique indexes, clash finder

**Files:**

- Modify: `src/lib/server/services/profiles.ts`
- Modify: `src/lib/server/db/schema/profiles.ts`
- Create: `drizzle/0018_profile_unique_names.sql` (+ `drizzle/meta` snapshot/journal via generator)
- Create: `scripts/find-profile-duplicates.mjs`, `scripts/find-profile-duplicates.test.mjs`
- Modify: `package.json` (scripts)
- Test: `src/lib/server/services/profiles.test.ts` (new)

**Interfaces:**

- Produces (from `profiles.ts`):
  - `profileKey(value: string): string`
  - `riotIdProblem(value: string): string | null`, which returns one of these messages: `'Riot ID must contain exactly one #.'`, `'Riot ID game name must be 3–16 letters, digits, or spaces.'`, `'Riot ID tagline must be 3–5 letters or digits.'`
  - `clashMessage(label: string, value: string, kind: 'team' | 'player', owner: { name: string; archivedAt: Date | null }): string` → `` `${label} "${value}" is already used by ${kind} "${owner.name}"${owner.archivedAt ? ' (archived)' : ''}.` ``
  - `PROFILE_LIMITS = { teamName: 100, teamTag: 20, displayName: 100, fullName: 150, riotId: 100 } as const`
- Produces (from `scripts/find-profile-duplicates.mjs`): `findDuplicates({ teams: Array<{id,name,tag}>, players: Array<{id,display_name,riot_id}> }): string[]`, one line per clash group.

- [ ] **Step 1: Write failing tests** in `src/lib/server/services/profiles.test.ts` using `withManagementFixture` (the fixture has teams `Team A/B/C` with tags `A/B/C` and players `Player a1…b6`):
  - `riotIdProblem`: `null` for `'USECRookieNguyen#USEC'`, `'Hide on bush#KR1'`, `'Thắng Nguyễn#VN2'`. Exact messages for `'NoHash'`, `'a#b#c'` (one-#), `'ab#USEC'`, `'Bad_Name#USEC'`, `'ABCDEFGHIJKLMNOPQ#USEC'` (game name), `'Name#AB'`, `'Name#ABCDEF'` (tagline).
  - `saveTeam({ name: 'team a', tag: 'Z' })` rejects with `SaveError` message `'Team name "team a" is already used by team "Team A".'`. Tag `' b '` rejects with `'Team tag "b" is already used by team "Team B".'`. After archiving `team-c`, `saveTeam({ name: 'TEAM C', tag: 'Q' })` message ends with `'(archived).'`.
  - Editing `team-a` with its own name and tag unchanged succeeds (excludes itself).
  - `savePlayer({ displayName: 'player A1', … })` rejects: `'Display name "player A1" is already used by player "Player a1".'` Riot ID clash: `'Riot ID "…" is already used by player "…".'`
  - `savePlayer` new with riotId `'bad'` rejects with the one-# message. Editing a player whose stored riot_id is `'legacy'` (set directly in the db) with an unchanged riotId and a new fullName succeeds. Changing it to `'stillbad'` rejects.
  - Backstop: `db.insert(teams).values({ name: 'team a', tag: 'X' })` directly throws an error containing `UNIQUE constraint failed`.

- [ ] **Step 2: Run** `pnpm vitest run --project server src/lib/server/services/profiles.test.ts`. Expected: FAIL (missing exports, no clash errors).

- [ ] **Step 3: Implement in `profiles.ts`.** `required` / `optional` also apply `.normalize('NFC')`. `saveTeam` / `savePlayer` load the other rows (`id, name, tag, archivedAt` / `id, displayName, riotId, archivedAt`, excluding `input.id`) and compare with `profileKey` in JS. SQLite `lower()` folds only ASCII, and the catalogs hold hundreds of rows at most. Throw `SaveError('invalid', clashMessage(...))` for the first clash. `savePlayer` runs `riotIdProblem` when riotId is non-empty and (new player, or the trimmed value differs from the stored one). Map `UNIQUE constraint failed` from the insert/update to `SaveError('invalid', 'Another operator saved a matching profile. Reload and try again.')`. Use `PROFILE_LIMITS` in place of the literal lengths.

- [ ] **Step 4: Add unique indexes** to `schema/profiles.ts` (keep the existing plain indexes):

  ```ts
  (uniqueIndex('teams_name_unique_ci').on(sql`lower(${table.name})`),
  	uniqueIndex('teams_tag_unique_ci').on(sql`lower(${table.tag})`),
  	uniqueIndex('players_display_name_unique_ci').on(sql`lower(${table.displayName})`),
  	uniqueIndex('players_riot_id_unique_ci').on(sql`lower(${table.riotId})`));
  ```

  Generate: `DATABASE_URL=file:/tmp/unused.db pnpm db:generate --name profile_unique_names`. Expected: `drizzle/0018_profile_unique_names.sql` containing four `CREATE UNIQUE INDEX … (lower(…))` statements and nothing else.

- [ ] **Step 5: Run** the profiles test (PASS), then the whole server project, `pnpm vitest run --project server`. Expected: PASS. If any existing fixture inserts names that now clash case-insensitively, rename the fixture value, not the rule.

- [ ] **Step 6: Clash finder.** Write `scripts/find-profile-duplicates.test.mjs` (`node:test`): `findDuplicates` on teams `[{id:'1',name:'Alpha',tag:'ALP'},{id:'2',name:'alpha',tag:'X'}]` returns one line containing `Alpha` and `alpha`, and NFD/NFC variants of `Thắng` clash. Then implement `scripts/find-profile-duplicates.mjs`: it reads `DATABASE_URL` the same way `scripts/seed.mjs` does, uses the same key as `profileKey`, prints each clash group, and exits 1 if any exist, else prints `No duplicate profiles.` and exits 0. Add `"db:duplicates": "node --env-file-if-exists=.env scripts/find-profile-duplicates.mjs"` and change `"test"` to `npm run test:seed && node --test scripts/find-profile-duplicates.test.mjs && npm run test:unit -- --run && npm run test:e2e`. Run: `node --test scripts/find-profile-duplicates.test.mjs`. Expected: PASS.

- [ ] **Step 7: Commit** `feat(profiles): unique team/player names and Riot ID format`.

### Task 2: Dependencies and shared import types

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/lib/import/types.ts`
- Modify: `src/lib/server/assets.ts` (export `imageType`, `saveBytes`)

**Interfaces:**

- Produces `src/lib/import/types.ts` (client-safe, no server imports):
  ```ts
  export type ImportProblem = {
  	level: 'error' | 'warning';
  	file: string;
  	row: number | null;
  	field: string | null;
  	message: string;
  };
  export type LogoVariant = 'normal' | 'white' | 'black';
  export type ImportTeamRow = {
  	row: number;
  	name: string;
  	tag: string;
  	logos: Record<LogoVariant, string | null>;
  }; // zip entry paths
  export type ImportPlayerRow = {
  	row: number;
  	displayName: string;
  	fullName: string | null;
  	riotId: string;
  	portrait: string | null;
  };
  export type ImportPreview = {
  	hash: string;
  	teams: ImportTeamRow[];
  	players: ImportPlayerRow[];
  	imageCount: number;
  	problems: ImportProblem[];
  };
  export type ImportResult = {
  	importPreview?: ImportPreview;
  	imported?: { teams: number; players: number };
  	importError?: string;
  };
  ```
- Produces: `imageType(bytes: Uint8Array): { extension; mime }` and `saveBytes(bytes: Uint8Array): Promise<string>`, both now exported unchanged.

- [ ] **Step 1:** `pnpm add -D https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz fflate@0.8.3`. Expected: both appear under `devDependencies`, and the lockfile records the tarball's integrity.
- [ ] **Step 2:** Create `types.ts` and add the two `export` keywords.
- [ ] **Step 3:** Run `pnpm check`. Expected: 0 errors.
- [ ] **Step 4: Commit** `chore(import): add SheetJS and fflate, shared import types`.

### Task 3: Bundle reader

**Files:**

- Create: `src/lib/server/import/bundle.ts`
- Test: `src/lib/server/import/bundle.test.ts`

**Interfaces:**

- Consumes: `ImportProblem`, `LogoVariant` (Task 2).
- Produces:

  ```ts
  export const BUNDLE_LIMITS = {
  	zipBytes: 32 * 1024 * 1024,
  	entries: 500,
  	expandedBytes: 100 * 1024 * 1024,
  	imageBytes: 10 * 1024 * 1024
  } as const;
  export type SheetRow = { row: number; cells: Record<string, string> }; // row = spreadsheet row, header = 1
  export type Sheet = { file: string; header: string[]; rows: SheetRow[] };
  export type BundleImage = { path: string; key: string; bytes: Uint8Array }; // key = profileKey(basename without extension)
  export type ParsedBundle = {
  	teams: Sheet | null;
  	players: Sheet | null;
  	logos: Record<LogoVariant, BundleImage[]>;
  	portraits: BundleImage[];
  	problems: ImportProblem[];
  };
  export function readBundle(bytes: Uint8Array): ParsedBundle; // bundle-level failures throw SaveError('invalid', message)
  ```

- [ ] **Step 1: Write failing tests.** Build zips with `fflate.zipSync` and workbooks with `XLSX.write(book, { type: 'buffer', bookType: 'xlsx' | 'ods' })`. Cases:
  - CSV with BOM + CRLF + quoted comma: `﻿team_name,team_tag\r\n"VNUHCM – University of Science, HCM",007\r\n` gives `teams.rows[0]` = `{ row: 2, cells: { team_name: 'VNUHCM – University of Science, HCM', team_tag: '007' } }`.
  - `players.xlsx` and `players.ods` yield the same cells as the CSV equivalent. Only the first sheet is read. Fully blank rows are skipped, with row numbers kept true to the sheet.
  - All files inside one top-level folder `bundle/…` parse the same as at the root. Files at both root and `bundle/` throw `'Put the bundle files either at the top of the zip or inside one folder, not both.'` `__MACOSX/…` and `.DS_Store` are ignored.
  - `players.csv` + `players.xlsx` together throw `'Use only one players file (found players.csv and players.xlsx).'` No sheet at all throws `'The bundle needs a teams or players spreadsheet.'`
  - More than 500 entries throws `'The bundle has more than 500 files.'` A 101 MB zero-filled entry throws `'The bundle unpacks to more than 100 MB.'` Entry `../evil.png` throws `'The bundle contains an unsafe path: ../evil.png'`. Non-zip bytes throw `'This file is not a valid zip.'`
  - `team_logos/white/USEC.png` lands in `logos.white` with `key: 'usec'`. `player_images/USECRookieNguyen#USEC.JPG` lands in `portraits`. `player_images/x.gif` adds an error problem `'Use a PNG, JPEG, or WebP image.'` with `file` = its path.
- [ ] **Step 2: Run** `pnpm vitest run --project server src/lib/server/import/bundle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `readBundle`.** Unzip with `unzipSync(bytes, { filter })`: count entries and sum `file.originalSize` in the filter, throwing past the limits before anything inflates. Wrap fflate errors as the not-a-zip message. Parse CSV as `XLSX.read(new TextDecoder().decode(bytes), { type: 'string', raw: true })` (TextDecoder strips the BOM, and `raw` keeps `007`). Parse workbooks with `XLSX.read(bytes, { type: 'buffer' })`. Get rows from `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true })` so row numbers stay true, then drop blank rows. Trim the header cells and the values.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): read team/player zip bundles`.

### Task 4: Preview builder

**Files:**

- Create: `src/lib/server/import/validate.ts`
- Test: `src/lib/server/import/validate.test.ts`

**Interfaces:**

- Consumes: `ParsedBundle` (Task 3), `profileKey`, `riotIdProblem`, `clashMessage`, `PROFILE_LIMITS` (Task 1), `imageType` (Task 2), `BUNDLE_LIMITS.imageBytes`.
- Produces:

  ```ts
  export type ExistingProfiles = {
  	teams: Array<{ name: string; tag: string; archivedAt: Date | null }>;
  	players: Array<{ displayName: string; riotId: string | null; archivedAt: Date | null }>;
  };
  export function buildPreview(
  	bundle: ParsedBundle,
  	existing: ExistingProfiles,
  	hash: string
  ): ImportPreview;
  ```

  The preview's `problems` start with `bundle.problems`. Rows carry NFC-normalized, trimmed values. `fullName` is empty → `null`. `imageCount` counts matched images.

- [ ] **Step 1: Write failing tests** (pure, with hand-built `ParsedBundle` objects; build image bytes from the PNG signature used in `upload-lifecycle.test.ts`). Each row problem asserts `{ level, file, row, field, message }`:
  - Missing column `riot_id` → error `{ file: 'players.csv', row: 1, field: 'riot_id', message: 'Missing column riot_id.' }`. Unknown `riotid` → `'Unknown column riotid.'`
  - Empty `team_name` → `'Team name must be 1–100 characters.'`. A 21-character tag → `'Team tag must be 1–20 characters.'`. Empty `riot_id` → `'Riot ID is required.'`. Bad Riot ID → the `riotIdProblem` message.
  - In-bundle duplicates (case and whitespace): row 3 tag `usec` vs row 2 `USEC` → error on row 3, field `team_tag`, `'Duplicates row 2.'`. The same goes for team_name, display_name and riot_id.
  - Existing clash (archived): existing team `{ name: 'Old', tag: 'USEC', archivedAt: new Date() }` → `'Team tag "USEC" is already used by team "Old" (archived).'`
  - **NFD filename:** portrait whose key is `profileKey('Thắng#VN2'.normalize('NFD'))` matches the player with riot_id `'Thắng#VN2'` (NFC). `portrait` is set to its path.
  - Logos match by tag per variant. An unmatched image → warning `'Matched no player.'` / `'Matched no team.'` with `row: null`. Two images with the same key in one slot (`USEC.png` + `usec.jpg`) → error on both paths `'Another image fills the same slot.'`
  - Image bytes failing `imageType` (e.g. a `.png` holding text) → error on that path `'Use a PNG, JPEG, or WebP image.'`. More than 10 MB → `'Images must be 10 MB or smaller.'`
  - A clean bundle → zero problems, rows and logos filled, `hash` passed through.
- [ ] **Step 2: Run** `pnpm vitest run --project server src/lib/server/import/validate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `buildPreview`.** Rows only become `ImportTeamRow` / `ImportPlayerRow` if their sheet has the right columns. Otherwise only the column errors are reported for that sheet.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): build bundle preview with located problems`.

### Task 5: Import actions

**Files:**

- Create: `src/lib/server/import/actions.ts`
- Modify: `src/routes/admin/teams/+page.server.ts`, `src/routes/admin/players/+page.server.ts` (spread `...bundleImportActions` into `actions`)
- Test: `src/lib/server/import/actions.test.ts`

**Interfaces:**

- Consumes: `readBundle`, `BUNDLE_LIMITS` (Task 3), `buildPreview` (Task 4), `saveBytes`, `removeAsset`, `ImportResult` (Task 2).
- Produces: `export const bundleImportActions: { importPreview: Action; importCommit: Action }`. The form fields are `bundle` (File) and `hash` (string, commit only). Return values:
  - preview OK → `{ importPreview }`
  - commit OK → `{ imported: { teams, players } }`
  - commit refused → `fail(400, { importPreview, importError })`, where `importError` is `'The file changed since the preview. Review the new preview before importing.'` (hash mismatch) or `'Nothing was imported. Fix the errors below and preview again.'` (problems with `level: 'error'`).
  - a file-level `SaveError` → `fail(400, { importError: cause.message })`. Never use `formError`: its `values` would open the page's team/player editor. Missing file → `'Choose a zip bundle.'`. Over 32 MB → `'The bundle must be 32 MB or smaller.'`
  - a `UNIQUE constraint failed` during commit → `fail(409, { importError: 'Another operator added a matching team or player. Preview again.' })`.

- [ ] **Step 1: Write failing tests** with `withManagementFixture` and `vi.stubEnv('ASSET_DIR', …)`, as in `upload-lifecycle.test.ts`. Call `bundleImportActions.importPreview` / `importCommit` with a `Request` carrying `FormData`. Cases:
  - Preview of a clean bundle (1 team with a normal logo, 1 player with a portrait) → `importPreview.problems` empty, a 64-hex `hash`, and team and player row counts in the db unchanged, with no files in the asset dir.
  - Commit with that hash → `{ imported: { teams: 1, players: 1 } }`. Rows exist with `logoPath` / `portraitPath` pointing at existing files. Re-running preview on the same file now shows `'Team name "…" is already used by team "…".'`
  - Commit with `hash: 'x'.repeat(64)` → status 400, the file-changed `importError`, and nothing written.
  - **Clash after preview:** preview, then insert a team with the bundle's tag directly, then commit → 400 with the problem listed. No new rows, and the asset dir is empty.
  - Commit failure cleanup: make the second insert fail (e.g. `vi.spyOn` the transaction to throw after images are saved) → no image files remain.
  - Neither action ever writes to `tournament_entries` or `tournament_entry_players` (counts unchanged).
- [ ] **Step 2: Run** `pnpm vitest run --project server src/lib/server/import/actions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The hash is `createHash('sha256')` from `node:crypto` over the file bytes. Existing profiles are loaded with one select per table. Commit = read → preview → refuse if hash or errors → `saveBytes` each matched image (collecting paths) → one `db.transaction` inserting all teams then all players → on any throw, `removeAsset` every collected path and rethrow or map.
- [ ] **Step 4: Run** the test, then `pnpm vitest run --project server`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): preview and commit actions for bundle import`.

### Task 6: Import UI, e2e, docs

**Files:**

- Create: `src/lib/components/admin/BundleImport.svelte`, `src/lib/components/admin/BundleImport.svelte.test.ts`
- Modify: `src/routes/admin/teams/+page.svelte` (replace the `Import coming soon` badge), `src/routes/admin/players/+page.svelte`
- Create: `tests/bundle-import.e2e.ts`
- Modify: `.env.example`, `docs/MANAGEMENT.md`, `docs/BROADCAST-OPERATIONS.md` (`BODY_SIZE_LIMIT=40M`, bundle format, `pnpm db:duplicates` before upgrading)

**Interfaces:**

- Consumes: `ImportResult`, `ImportPreview` (Task 2). Action names `?/importPreview`, `?/importCommit`, and fields `bundle`, `hash` (Task 5).
- Produces: `<BundleImport result={form} />`, where `result: ImportResult | null | undefined`.

Behaviour: a `<details>` labelled **Import bundle** below the page header, open whenever `result` has any import key. One `multipart/form-data` form with `use:enhance` that calls `update({ reset: false })`, so the chosen file survives the preview. It contains a file input (label `Bundle (.zip)`, `accept=".zip"`), a hidden `hash` set from `result.importPreview.hash`, a **Preview import** button (`formaction="?/importPreview"`) and a **Confirm import** button (`formaction="?/importCommit"`). Confirm is enabled only when a preview exists, it has zero `error` problems, and the file input hasn't changed since that preview (a local flag reset on `change`). The panel shows `importError` in a `role="alert"`. On preview it shows the summary `N teams, M players, K images, E errors, W warnings`, an error/warning list where each item links to `#import-<file>-<row>`, and teams and players tables with that row id and problems inline. Logo/portrait cells show the matched path or `—`. After success it shows `role="status"` text `Imported N teams and M players.` Run `svelte-autofixer` on the component until clean.

- [ ] **Step 1: Write the failing component test** (`vitest-browser-svelte`): render with a preview containing one error → Confirm is disabled, the error text is visible, and the row has the error inline. Render with a clean preview → Confirm enabled, and after `userEvent.upload` of a new file on the input Confirm is disabled again. Render with `{ imported: { teams: 2, players: 5 } }` → status `Imported 2 teams and 5 players.`
- [ ] **Step 2: Run** `pnpm vitest run --project client src/lib/components/admin/BundleImport.svelte.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the component and add it to both pages.
- [ ] **Step 4: Run** the component test. Expected: PASS.
- [ ] **Step 5: Write `tests/bundle-import.e2e.ts`.** Build zips in the test with `fflate.zipSync` and upload via `setInputFiles({ name, mimeType: 'application/zip', buffer })`.
  - On `/admin/teams`, a bundle with team tag `alp` (clashes with seeded `Alpha`/`Alp`) → preview shows `Team tag "alp" is already used by team "Alpha".` and Confirm is disabled.
  - A fixed bundle (`Import Test Esports`/`ITE` with a normal logo, plus player `ImportPlayer`/`ImportPlayer#TEST`) → Preview → Confirm → `Imported 1 teams and 1 players.`, and the team appears in the Teams table with its logo.
  - On `/admin/players` the player is listed. Preview of the same bundle again shows duplicate errors.
  - Run: `pnpm exec playwright test tests/bundle-import.e2e.ts`. Expected: PASS.
- [ ] **Step 6: Docs.** Update `BODY_SIZE_LIMIT` to `40M` in the three files. Add a short "Importing teams and players" section to `docs/MANAGEMENT.md` with the bundle tree, columns, image naming, limits, and the all-or-nothing rule. In `docs/BROADCAST-OPERATIONS.md`, note to run `pnpm db:duplicates` before upgrading to this version, because the startup migration refuses to apply over duplicates.
- [ ] **Step 7: Full gate.** Run `pnpm check && pnpm lint && pnpm test:unit && pnpm exec playwright test`. Expected: all pass, coverage thresholds met.
- [ ] **Step 8: Commit** `feat(import): bundle import UI on teams and players pages`.
