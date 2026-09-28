<!-- markdownlint-disable MD041 -->

> "Work expands so as to fill the time available for its completion" - Parkinson's Law
>
> Actually, work always expands to my personal life =))))))

# FPT Shop x Acer - VLR Graphics Controller

Upcoming project for the FPT Shop x Acer Valorant Broadcast Graphics Controller.

Built with SvelteKit 3 and Svelte 5, with admin UI from Skeleton UI.

## Local development

Copy `.env.example` to `.env`, install dependencies with `pnpm install`, then run `pnpm db:migrate` and `pnpm dev`. The default `file:local.db` database is persistent and ignored by Git. Use migrations for schema changes; keep `db:push` away from event data.

`/admin/teams`, `/admin/players`, and `/admin/resources` provide the current preparation screens. `ASSET_DIR` stores uploaded logos/portraits and imported game art outside the build; back it up together with the database. Asset URLs are relative to the app origin, so the same images load from another PC through the server's LAN address. Set `BODY_SIZE_LIMIT=32M` for three team logos of up to 10 MB each when using the Node adapter.

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
