# Possible improvements, i guess?

Rough sizes: S = hours, M = a day or two, L = several days. Order at the bottom.

1. Server logging: done (TSLog + optional JSONL). One thing left (S)
    - Console still prints the event name + an object dump. Want plain text.
    - Example: `2026-03-11T15:56:36Z WARN (module): info_detail_as_plain_words` (example only, not correct).
    - Keep JSONL files as they are. Tests read the structured records, so don't change the log call shape. Only change how the console prints.

2. Authentication (L)
    - Email + password first. Discord later: needs internet + a registered redirect URL, bad for LAN-only.
    - Everything that writes is under `/admin`, so one guard in `hooks.server.ts` covers it. `/gfx`, `/assets`, `/api/*` stay public read-only.
    - Needs: users + sessions tables, first-run admin setup, a recovery script, a test login for the e2e suites, no `Secure` cookie on `http://` LAN.
    - User management route in admin comes after login works.
    - Cheap stopgap if the event is close: one shared operator password on `/admin` only (S).

3. GFX as SPA: not doing it as written
    - `ssr = false` on `/gfx` is one line, but gains almost nothing. Nothing to render until the SSE snapshot arrives anyway.
    - What i actually want is fewer connections per browser source. That is 5a.

4. Preload assets (S to M) - do this first
    - Problem: a graphic's images don't exist until Show, so the first show loads them on air.
    - Fix: preload from the latest saved data (logos, portraits, agent/map art, ability icons) in `LiveGraphic`.
    - Also: `Asset.svelte` never retries a failed image. Add retry.
    - Can't preload images that only appear from live telemetry.

5. On-air workspace: two separate things
    - 5a. One composite output route for vMix (M)
        - All 7 graphics stacked on one 1920x1080 transparent canvas, one shared SSE client.
        - Now: 7 browser sources = 7 broadcast streams + 7 live streams + 7 resource pollers. Likely the vMix lag. check: not measured.
        - Keep the per-graphic URLs. One source = one failure domain, so keep them as backup.
        - check: how the templates overlap.
    - 5b. PVW/PGM control page (L), after the event
        - Most of the model exists: Preview = latest saved, Program = capture, Hide → Show = take.
        - Hard part is the UI: merging 7 editors with draft retention + stale-save checks into one page.

6. Clearer workflow
    - 6a. Online/offline dot per GFX output (M), after 5a
        - Server can't tell which graphic is connected right now: one shared SSE stream, anonymous subscribers, admin tabs use it too.
        - Needs: outputs say which graphic they are, server counts outputs only, presence sent as its own event (not in the snapshot).
        - Dot means "connected", not "OBS is showing it". OBS "shutdown source when not visible" will show offline.
        - If 5a composite happens: one dot for the whole output, not seven.
    - 6b. Different icon per GFX link (S)
        - Sidebar uses `Monitor` for all seven. Just an icon map.
    - 6c. Simpler wording (M, ongoing)
        - Replace developer words (capture, mapping, revision, provider, raw scope values).
        - Keep broadcast words (Take, Show/Hide, Preview/Program).
        - Tests read UI text, so update tests alongside.

7. Docker (M)
    - One Node process only. Persist `DATABASE_URL`, `ASSET_DIR`, `data/settings.key`.
    - `ORIGIN` is build-time, so the image is tied to one address. check: is it even needed, asset URLs are relative.
    - Pick one Node version. README says 24 LTS, `mise.toml` says 26.13.0, and `engine-strict` is on with no `engines` field.
    - Windows host: use a named volume for SQLite, not a bind mount.
    - check: clean `pnpm install --frozen-lockfile` on Linux (README mentions a Windows adapter patch).
    - Single PC on LAN: plain Node is simpler. Docker is for online hosting / reproducible deploys.

8. Other
    - One backup command: DB + assets together (+ settings key, separately).
    - Align the Node version across README, `mise.toml`, `package.json`.


## Other gripes
9. Player Lineup: pick which team shows (M)
    - Now: one on/off for the whole graphic, and the template always draws both teams.
    - Add a live control next to Swap: Both / Team A / Team B. It acts live, no Hide → Show needed, so we can bring in one team, then the other.
    - Store it by team (A/B), not screen side, so Swap doesn't change which team is showing. Buttons show the real team names.
    - Not doing: separate on/off per team as extra graphics. Visibility is one boolean per graphic everywhere (DB, routes, publications, tests), so that is the big version for the same result.
    - Needs: new live-control field + DB column, decoder version bump (like the v2 → v3 one) so held captures don't go blank, control UI, test template.
    - check with design team: what does one team alone look like (stay on its side or centre)? The test template can't answer that.

10. Player Stats / MVP: choose which stats show (S to M)
    - Now: `StatsFields.svelte` hardcodes all 8 (Kills, Deaths, Assists, Perf. Score, Trades, First Bloods, Plants, Defuses). Always all.
    - Add a picker per graphic (Player Stats and MVP separate), saved with the content controls and applied at Show like the rest.
    - Pick only from the existing `statisticFields` list. The server checks it, at least 1.
    - Real use: importers never fill Trades (manual entry only), and Perf. Score is unavailable for series/tournament scope. They currently show "—" on air. The picker should show which fields have no data in the chosen scope.
    - Default = all 8, so nothing changes until someone picks.
    - Needs: `fields` on `playerStats` (JSON column, no migration), a new MVP field, decoder version bump (the same one as 9), template reads the list.
    - check: final designed templates may fix the slots. The template should say which fields and how many it supports, and the picker follows that.
    - Inspiration: Barracks.gg GFX Editor interface that allows selecting what is needed to display. 

    <video src=".readme/assets/controller-customized-update-slide-optm.webm" width="640" height="360" controls></video>

Order: 4 → 1 → 6b → 5a → 6a → 6c → 7 → 2 → 5b. Skip 3.