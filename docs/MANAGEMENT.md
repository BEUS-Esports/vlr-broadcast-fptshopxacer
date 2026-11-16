# Management and preparation

## Routes

- `/admin/tournaments`: event details, team entries, player availability, map pools, matches, games, lineups and match-wide vetoes.
- `/admin/teams`, `/admin/players`, `/admin/resources`: reusable profiles and game resources.

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

## Assets

- `ASSET_DIR` holds uploaded logos and portraits plus imported game art, outside the build. Back it up with the database.
- Asset URLs are relative to the app origin, so other PCs load them through the server's LAN address.
- With the Node adapter, set `BODY_SIZE_LIMIT=32M` to allow three team logos of up to 10 MB each.
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
- Repaired artwork gets new asset URLs, so republish held graphics with **Hide → Show**.
- Open graphics and previews refresh live-provider artwork from the local server every 30 s. A failed request retries after 5 s and keeps the last good artwork.
- The server needs internet only while syncing. Saved records and downloaded images keep working offline.
