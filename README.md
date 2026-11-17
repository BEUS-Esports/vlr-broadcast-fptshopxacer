> "Work expands so as to fill the time available for its completion" - Parkinson's Law
>
> Actually, work always expands to my personal life =))))))

# FPT Shop x Acer - VLR Graphics Controller

Valorant broadcast graphics controller: SvelteKit 3, Svelte 5, Skeleton UI.

Manages teams, players, tournaments → matches → games and game resources, and drives seven graphics: Player Lineup, Player Stats, Map Veto, Agent Select, In-Game, Post-Game and MVP.

## Setup

Node 26.13.0 and pnpm 12.16.1 (`mise.toml`). Copy `.env.example` to `.env`, then:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed   # optional: 3 fictional teams, 18 players
pnpm dev
```

## Rules

- Change the schema only with reviewed migrations. Never `db:push` event data.
- Run `pnpm check`, `pnpm build` and E2E one after another; they share generated files. Use `PLAYWRIGHT_CHANNEL=chrome` for installed Chrome.
- Run one Node process. SSE and the live-provider session are process-local.
- Management routes have no sign-in (trusted LAN only). `/gfx/live/*` output pages have no controls.
- Keep provider keys and group codes out of public env vars, fixtures, OBS URLs, SSE, form responses and client data.
- Log server operations with `logEvent` and safe metadata only. Pass known credentials as the last argument so they are redacted:
  `logEvent('warn', 'example.failed', { provider }, cause, [accessKey, groupCode])`
- `ORIGIN` is read at startup: set it before `node build`, and restart when it changes. No rebuild.
- Back up the database, `ASSET_DIR` and the encryption key together.
- Team A/B is competition order. Swap Left/Right changes only presentation.
- Preview follows saved data. A shown graphic keeps its capture until Hide → Show.

## Docs

- [Management](./docs/MANAGEMENT.md): tournaments, game preparation, assets, resource sync
- [Broadcast operations](./docs/BROADCAST-OPERATIONS.md): GFX control, OBS URLs, deployment (including HTTPS with Docker + Caddy), migrations, backups
- [Live providers](./docs/LIVE-PROVIDERS.md): Spectra, GStack, external HUD, connection diagnostics
- [Post-game imports](./docs/POST-GAME-IMPORTS.md): HenrikDev, Spectra
- [Logging](./docs/LOGGING.md) · [Testing](./docs/TESTING.md) · [Recovery runbook](./docs/RHS-RUNBOOK.md) · [Spec](./docs/TECH-SPEC.md)

## Integrations

- Live data: [ValoSpectra](https://www.valospectra.com/) ([server](https://github.com/ValoSpectra/Spectra-Server), Overwolf) and [GStack](https://gstack.app) ([VHUD API](https://gstack.app/API/VHUD.html), OCR/machine vision). Direct Riot integration is out of scope.
- Game resources: [VALORANT-API](https://valorant-api.com/) maps, agents and weapons, downloaded locally on sync.

## Inspiration

- VCT broadcast graphics; post-match cards from <stats.bumpfull.com> and [val-image-generator](https://github.com/ranamerp/val-image-generator); the [Barracks.gg](https://barracks.gg) controller.
- Earlier work: [TFT, FPT Shop Uni Tour 2026](https://github.com/Rookie001MC/tft-broadcast) and [MLBB Road to Asiad 2026](https://github.com/BEUS-Esports/mlbb-hud-road-to-asiad-2026) (private repo).
