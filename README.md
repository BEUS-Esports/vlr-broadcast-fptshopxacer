<!-- markdownlint-disable MD041 -->

> "Work expands so as to fill the time available for its completion" - Parkinson's Law
>
> Actually, work always expands to my personal life =))))))

# FPT Shop x Acer - VLR Graphics Controller

Upcoming project for the FPT Shop x Acer Valorant Broadcast Graphics Controller.

Built with SvelteKit 3 and Svelte 5, with admin UI from Skeleton UI.

## Local development

Copy `.env.example` to `.env`, install dependencies with `pnpm install`, then run `pnpm db:migrate` and `pnpm dev`. The default `file:local.db` database is persistent and ignored by Git. Use migrations for schema changes; keep `db:push` away from event data.

Run `pnpm db:seed` after migration to add three fictional teams and 18 players for local preparation. Re-running it preserves existing records and edits. The player profiles are not assigned to tournament rosters; those are managed separately.

`/admin/tournaments` manages event details, team entries, player availability, map pools, matches, individual games, lineups, and match-wide vetoes. Reusable profiles and resources live at `/admin/teams`, `/admin/players`, and `/admin/resources`. `ASSET_DIR` stores uploaded logos/portraits and imported game art outside the build; back it up together with the database. Asset URLs are relative to the app origin, so the same images load from another PC through the server's LAN address. Set `BODY_SIZE_LIMIT=32M` for three team logos of up to 10 MB each when using the Node adapter.

Management tabs support deep links and retain unsaved drafts. Each section saves separately; stale saves keep the submitted draft until you explicitly reload it. Editing requires JavaScript. Reopen terminal games before changing their map, sides, or lineup; normal score corrections recalculate the series directly. Removing a player from a current roster preserves their saved historical lineups.

Run the management browser journeys with `pnpm exec playwright test tests/phase3-management.e2e.ts tests/phase3-conflicts.e2e.ts`. The runner migrates a temporary database, uses a temporary asset directory, builds and starts its own app, and removes the test data after shutdown. For installed Google Chrome, set `PLAYWRIGHT_CHANNEL=chrome` before running Playwright or client Vitest tests. Rebuild with your normal environment before running the app after a browser test build.

The Game Resources page syncs tactical maps, playable agents, and weapons from [VALORANT-API](https://valorant-api.com/). The server needs internet access only during refresh; saved records and downloaded images remain available locally afterward. The management routes currently have no sign-in gate, so keep the app on a trusted network until the planned account and session work is implemented.

## Expected features includes

- CRUD tasks and management features for:
  - Reusable teams and players
  - Tournaments -> Matches -> Games
  - Game Resources
- Graphics:
  - Player Lineup
  - Player Stats
  - Map Veto
  - Agent Select
  - In-Game
  - Post-Game
  - MVP

## Inspiration

- Valorant Champions Tour broadcast graphics.
- Post Match from <stats.bumpfull.com> or <https://github.com/ranamerp/val-image-generator> etc...
- [Barracks.gg](https://barracks.gg) Graphics Controller, works well with Riot Games' Partner Tournaments as it has live data.
- [Previous work with TFT for the FPT Shop Uni Tour 2026](https://github.com/Rookie001MC/tft-broadcast)
  - Features CRUD actions, Winner GFX, Post-Game GFX, Ranking GFX.
- [Previous work with the MLBB Road to Asiad 2026 Aichi-Nagoya](https://github.com/BEUS-Esports/mlbb-hud-road-to-asiad-2026) (GitHub is private, source code [here](./examples/mlbb-hud-road-to-asiad-2026/))

## Expected integrations

### Live Game Data:

- [ValoSpectra](https://www.valospectra.com/), server here: <https://github.com/ValoSpectra/Spectra-Server>, uses Overwolf under the hood.
- [GStack](https://gstack.app), GStack-Client API schema here: <https://gstack.app/API/VHUD.html>, uses OCR and Machine Vision.
- Direct Riot match-data and account integrations are outside the current scope; see [the specification](./docs/TECH-SPEC.md).

### Game Resources

- [VALORANT-API](https://valorant-api.com/) supplies the implemented map, agent, and weapon catalogues. Images are downloaded locally during deliberate per-resource syncs.
