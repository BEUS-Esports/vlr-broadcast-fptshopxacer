# Team & Player Bundle Import Design

**Why:** before an event, operators enter dozens of teams and players by hand on `/admin/teams` and `/admin/players`, one form at a time. A zip bundle (spreadsheets plus images) turns that into one upload. Players are asked to fix clashing names before the event, so the import must point at every clash clearly instead of silently merging or skipping.

## Goals

- Import teams (name, tag, three logo variants) and players (display name, full name, Riot ID, portrait) from one zip.
- **Preview before writing.** The operator sees every row, its matched images, and every problem with its location before anything is saved.
- **All or nothing.** If any row has an error, nothing is imported.
- Duplicates are blocked everywhere, not just in the import: team name, team tag, player display name, player Riot ID.

## Non-goals

- Tournament rosters or entries. The import never touches `tournament_entries` / `tournament_entry_players`. Rosters stay manual, using the roster picker (separate design).
- Updating or merging existing teams/players. A re-import of the same bundle fails on duplicates, by design.
- Exporting a bundle.
- Players' team membership. Players have no team column. Membership is tournament-scoped.

## Anti-goals

- A partial import that leaves some rows in and some out.
- A clash that the preview doesn't show, which then fails only at confirm with a vague error.

## Bundle format

```text
bundle.zip
├── teams.csv | teams.xlsx | teams.ods        (optional)
├── players.csv | players.xlsx | players.ods  (optional)
├── team_logos/normal/<tag>.<ext>
├── team_logos/white/<tag>.<ext>
├── team_logos/black/<tag>.<ext>
└── player_images/<riot_id>.<ext>
```

- At least one of `teams.*` / `players.*` must be present. More than one file for the same table (e.g. `players.csv` and `players.xlsx`) is an error.
- Files may sit at the zip root or inside one top-level folder (zipping a folder in a file manager does this), not both. Anything else, such as `__MACOSX/` or `.DS_Store`, is ignored.
- A bundle is imported whole from either page, whichever tables it contains.
- **Spreadsheets:** first row is the header. For `.xlsx` / `.ods`, only the first sheet is read. Cells are read as text and trimmed. Fully empty rows are skipped. CSV is decoded as UTF-8 with any BOM stripped.
  - `teams`: `team_name` (required), `team_tag` (required).
  - `players`: `display_name` (required), `full_name` (optional value, column required), `riot_id` (required).
  - A missing required column is an error. Unknown columns are an error too, to catch typos like `riotid`.
- **Images:** `.png`, `.jpg`, `.jpeg`, `.webp`. The file name without extension must equal the tag or Riot ID, ignoring case. Content is sniffed by the existing `imageType` check in `src/lib/server/assets.ts`, so a mislabelled file is an error. Max 10 MB each (existing limit). Images are optional per row. Two images resolving to the same slot (same name ignoring case, or same name with different extensions) are an error.
- **Limits:** zip ≤ 32 MB. A 32 MB file plus multipart overhead exceeds the current `BODY_SIZE_LIMIT=32M`, so raise it to `40M` in `.env.example`, `docs/MANAGEMENT.md`, `docs/BROADCAST-OPERATIONS.md`, and the operator's `.env`. Also ≤ 500 entries, ≤ 100 MB total unpacked. Entries are checked by their declared size before inflating (fflate `unzipSync` `filter`). Paths containing `..` or starting with `/` are rejected.

## Validation rules

Applied to every row. Each problem is reported with its file, row number (spreadsheet row, header = row 1), and field.

- **Lengths:** the existing ones from `src/lib/server/services/profiles.ts`: team name 1–100, team tag 1–20, display name 1–100, full name ≤ 150, Riot ID ≤ 100.
- **Riot ID:** exactly one `#`. Game name is 3–16 characters of letters, digits, or spaces in any script (`/^[\p{L}\p{N} ]{3,16}$/u`, trimmed). Tagline is 3–5 letters or digits (`/^[\p{L}\p{N}]{3,5}$/u`). Riot's FAQ says "alphanumeric", but real IDs such as `Hide on bush#KR1` contain spaces and non-Latin letters. The same rule applies to the manual player form when a Riot ID is entered (still optional there). On edit, it runs only if the Riot ID changed from the stored value, so legacy IDs don't block saving other fields (my call).
- **Duplicates:** compared case-insensitively after trimming (`toLocaleLowerCase()`).
  - Within the bundle: "Row 7 `riot_id` duplicates row 3".
  - Against the database, including archived rows: "Row 7 `team_tag` `USEC` is already used by team *VNUHCM – University of Science Esports Club* (archived)".
- **Images:** an image whose name matches no row is a **warning** ("`player_images/Foo#BAR.png` matched no player"). Warnings don't block the import. Errors do.

## Flow (chosen: upload → preview → confirm)

1. On `/admin/teams` or `/admin/players`, the operator opens **Import bundle** and picks a zip. The form posts to a shared `?/importPreview` action. Both pages use the same component and the same server service.
2. The server parses and validates and returns a preview. Nothing is written.
   - Summary: *N teams, M players, K images, E errors, W warnings*.
   - Teams table: row #, name, tag, logo matches (normal / white / black: file name or "—"), problems inline.
   - Players table: row #, display name, full name, Riot ID, portrait match, problems inline.
   - Errors also listed together at the top, each linking to its row.
3. **Confirm import** is enabled only with zero errors. Confirm re-submits the same file (still held in the browser's file input) to `?/importCommit`, with the SHA-256 the server computed and returned in the preview. The server computes it because browser `crypto.subtle` needs a secure context.
4. Commit re-runs the full validation. The database may have changed since the preview. If the hash differs from the previewed one, or anything now fails, nothing is written and the new preview is shown instead.
5. On success: images are saved through `saveBytes` (new UUID file names), then all team and player rows are inserted in one transaction. The page shows "Imported N teams and M players".

Holding the upload in the browser instead of on the server means no temp files, no expiry, and no server state between steps (my call).

**Commit failure:** if the transaction fails, the images written for this import are deleted with `removeAsset`, the same pattern the team and player save actions use. The 14-day asset cleanup remains the backstop if the process dies mid-commit. Teams and players are inserted only in `profiles.ts`, so the duplicate checks have one entry point.

## Database change

New migration adding case-insensitive unique indexes:

- `teams`: `lower(name)`, `lower(tag)`
- `players`: `lower(display_name)`, `lower(riot_id)` (nulls allowed, many players may have no Riot ID)

SQLite `lower()` folds only ASCII, so Vietnamese or other non-ASCII case differences (e.g. `Đ`/`đ`) pass the index. The app check (`toLocaleLowerCase`) is the real gate. The index is the backstop against races.

- **Existing data:** if the current database already holds duplicates, the migration would fail at startup (which backs up first, then refuses to serve). Before shipping, the plan includes a `pnpm` script or documented SQL query that lists clashes so they can be fixed beforehand.
- `saveTeam` / `savePlayer` gain the same duplicate check (named clash message) and map a `UNIQUE constraint failed` error to a `SaveError('invalid', …)`, like `saveTournament` does for slugs.

## Dependencies

- **SheetJS `xlsx` 0.20.3**, from the official CDN tarball URL in `package.json` (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). The lockfile pins its integrity. The npm-registry `xlsx` is stale and unpatched. The tarball saved under `docs/` can't be used by the Docker build (`docs/` is docker-ignored, and `pnpm install` runs before the source is copied). Reads CSV, XLSX and ODS. Server-only.
- **fflate**, added as a direct dependency (already present transitively at 0.8.3). Used for unzipping with size checks. SheetJS's bundled CFB unzip inflates everything with no size limit.

## Approaches considered

- **A. One-step import:** upload, validate, write or show errors. Rejected: the operator wants to see and re-check every row and clash before committing.
- **B. Upload → preview → confirm (chosen).** Shows exactly where duplicates are, and lets the operator recheck the data before writing.
- **C. Parse in the browser.** Rejected: the server must validate anyway, and every browser would download ~1 MB of SheetJS.

## Left to the builder

- Exact component layout and styling. Follow the existing management page patterns (`ManagementForm`, Skeleton presets).
- Where the import service lives (suggest `src/lib/server/import/`) and how it splits into parse / validate / commit.
- Tests: unit tests for parsing (CSV/XLSX/ODS fixtures), Riot ID rule, duplicate detection (in-bundle, against DB, archived, case), zip limits and path rejection; one e2e for preview → confirm.
