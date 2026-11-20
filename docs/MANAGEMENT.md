# Management and preparation

## Routes

- `/admin/tournaments`: event details, team entries, player availability, map pools, matches, games, lineups and match-wide vetoes.
- `/admin/teams`, `/admin/players`, `/admin/resources`: reusable profiles and game resources.
- `/admin/sponsors`: sponsor banner art and the scorebar logo loop.
- `/admin/stingers`: transition stingers for the Composite output. See [Stingers](./BROADCAST-OPERATIONS.md#stingers).

## Local data

- The default `file:local.db` database is persistent and ignored by Git.
- `pnpm db:seed` adds three fictional teams and 18 players. Re-running keeps existing records and edits. Seeded players are not on any tournament roster; rosters are managed separately. `pnpm test:seed` checks this against a temporary database and runs first in `pnpm test`.

## Editing

- Editing requires JavaScript. Tabs support deep links and keep unsaved drafts.
- Each section saves separately. A stale save keeps your submitted draft until you explicitly reload.
- Reopen a finished game before changing its map, sides or lineup. Score corrections recalculate the series directly.
- Removing a player from a current roster keeps their saved historical lineups.

## Game preparation

Order: **Info → Lineup → Map Veto → Agent Select → Post-Game Report**.

- Agent Select owns the saved player-to-agent mapping. Post-Game Report shows it read-only.
- **Duplicate Game** (Match → Games) takes an unused target number and a label derived from it. It copies the lineup and, optionally, agents (off by default), and derives map and starting sides from the target veto. Scores, results, statistics, MVP and import metadata stay empty. The source game and the tournament roster are unchanged.

## Importing teams and players

On **Teams** or **Players**, open **Import bundle**, choose a `.zip`, then **Preview import**. Nothing is saved until **Confirm import**, and it stays disabled while the preview has errors or after the file is changed. The import is all or nothing: one error blocks every row. It never changes tournament rosters, and re-importing a bundle fails on duplicates. Before upgrading an existing install, run `pnpm db:duplicates` (see `docs/BROADCAST-OPERATIONS.md`; for compose use `DATABASE_URL=file:data/broadcast.db pnpm db:duplicates` with the app stopped) to find profiles that already clash.

```text
bundle.zip
├── teams.csv | teams.xlsx | teams.ods        (optional)
├── players.csv | players.xlsx | players.ods  (optional)
├── team_logos/normal/<tag or team name>.<ext>
├── team_logos/white/<tag or team name>.<ext>
├── team_logos/black/<tag or team name>.<ext>
└── player_images/<riot_id, display name or full name>.<ext>
```

- At least one of `teams.*` or `players.*` is required, one file per table. Files may sit at the zip root or inside one folder. Either page imports whatever the bundle contains.
- First row is the header (first sheet only for `.xlsx` / `.ods`; CSV is UTF-8). Teams: `team_name`, `team_tag`. Players: `display_name`, `full_name` (column required, value optional), `riot_id` (column and value both optional; players without one just have no Riot ID). Missing or unknown columns are errors.
- Images are `.png`, `.jpg`, `.jpeg` or `.webp` up to 10 MB, named after the team tag or team name (logos) or the Riot ID, display name or full name (player images), ignoring case. Images are optional. An image that matches no row is only a warning. It is an error when one image matches several rows (full names are not unique) or one row matches several images.
- A Riot ID, when given, needs exactly one `#`: a 3-16 character game name (letters, digits, spaces) and a 3-5 character alphanumeric tagline.
- Team name, team tag, display name and Riot ID must be unique, ignoring case, within the bundle and against existing profiles including archived ones. The preview names the clash and its row.
- Limits: zip up to 150 MB, up to 500 entries, up to 500 MB unpacked.

## Assets

- `ASSET_DIR` holds uploaded logos and portraits plus imported game art, outside the build. Back it up with the database.
- Asset URLs are relative to the app origin, so other PCs load them through the server's LAN address.
- With the Node adapter, set `BODY_SIZE_LIMIT=1G` (also in the `.env` that compose reads). Stingers can be up to 1 GB; the same limit also covers three team logos of up to 10 MB each and the 150 MB bundle import (a 150 MB zip plus form overhead exceeds `150M`).
- Stinger files (WebM, WebP, AVIF) stream straight to `ASSET_DIR` and are served with HTTP Range, so browsers can seek them. Cleanup treats them like any other asset.
- A failed team or player save deletes the uploads it just completed.

### Cleanup

At startup and then hourly, cleanup checks saved profiles, catalogue records (including ability icons) and persisted graphic captures.

- An unreferenced image is marked in the database and deleted 14 days after the first scan that found it unused.
- A later scan that finds a reference cancels the mark. Every deletion rechecks references under a database write lock.
- Held graphics, archived profiles and inactive catalogue records keep their images.
- Marks survive restarts and failed deletions retry. Files that don't match the app's generated image names are ignored.
- A deleted image can only be recovered from backup.

## Game Resources sync

Syncs tactical maps, playable agents and weapons from [VALORANT-API](https://valorant-api.com/).

- Refreshes names, roles and categories. Resource IDs, keys and active status are kept, including key/status edits saved during a sync.
- Missing local artwork is downloaded again when the catalogue has an image URL. Existing files are reused.
- Repaired artwork gets new asset URLs, so recapture held graphics with **Update** (or **Update Live** on the composite).
- Open graphics and previews refresh live-provider artwork from the local server every 30 s. A failed request retries after 5 s and keeps the last good artwork.
- The server needs internet only while syncing. Saved records and downloaded images keep working offline.
