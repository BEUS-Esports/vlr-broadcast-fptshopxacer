# Broadcast operation and production

## Controller

- The sidebar has **Preparation** (Teams, Players, Game Resources, Tournaments) and **GFX Control** (Global Settings plus the seven graphics).
- `/admin/graphics` is Global Settings. Each `/admin/graphics/<graphic>` page shares Global Setup and edits the same preparation data as normal management.
- Choose Tournament → Match → Game, then **Take game live**. Partial selector drafts and browsing in management don't change the live game.
- Hide every shown graphic before changing or clearing the live game. The server enforces this across controllers.

## Preview and Show

- Each page has an embedded 16:9 Preview and a **Large Preview** dialog. Both use the real output renderer.
- Preview always follows the latest saved data, including while the graphic is hidden.
- **Show** publishes a persisted capture of the graphic's saved preparation and content controls. Later saves update only Preview, and program keeps its capture. Pressing Show again keeps the capture; **Hide → Show** publishes the latest saved version.
- Explicit presentation and current-side changes apply live.
- An editor with unsaved changes keeps its original record and revision across a refresh or a remote selection change.
- Player Stats offers Single and Head-to-Head, scoped to a game, match or tournament. MVP uses the operator's saved pick.
- Missing preparation is shown as unavailable.

## Presentation

- Team A/B is competition order. **Swap Left/Right** changes only screen presentation.
- Current attackers/defenders set the blue/red colors without moving teams.
- Unknown tournament slugs use the generic test templates. A slug `<template>-<anything>` uses that template, so `predator-roadshow-val-dong-nai` uses `predator-roadshow-val`.
- The Phase 5/5.1 native In-Game fallback passed real Valorant/OBS composition testing. The Phase 5/5.1 native/test package is the accepted fallback baseline; external-provider HUD acceptance is recorded separately.

## OBS URLs

Read-only, on a transparent 1920×1080 canvas:

| Graphic       | Route                     |
| ------------- | ------------------------- |
| Player Lineup | `/gfx/live/player-lineup` |
| Player Stats  | `/gfx/live/player-stats`  |
| Map Veto      | `/gfx/live/map-veto`      |
| Agent Select  | `/gfx/live/agent-select`  |
| In-Game       | `/gfx/live/in-game`       |
| Post-Game     | `/gfx/live/post-game`     |
| MVP           | `/gfx/live/mvp`           |

For rehearsal, `/gfx/live/composite` combines all seven in one output with shared connections. Layers from back to front: In-Game, Map Veto, Player Lineup, Agent Select, Post-Game, Player Stats, MVP. Shown graphics can overlap, so check the combinations you plan to use and compare vMix performance before going on air with it. Keep the individual URLs as a rehearsed fallback.

## Predator Roadshow VALORANT

- Give each stop's tournament a slug starting with `predator-roadshow-val-`, for example `predator-roadshow-val-dong-nai`, `-da-nang` or `-ha-noi`.
- Pages stay transparent. Put the package background loop (`MAIN.mp4`) in OBS as its own layer below the full-screen graphics (Lineup, Map Veto, Player Stats, Post-Game, MVP). Do not put it behind In-Game or Agent Select.
- **Map Winner** is on the Player Lineup page. Press **Map winner**, check the result line beside it (game, map, winner and score), then **Show Player Lineup**. Forfeits and walkovers show `13–0`. Choosing another game resets the mode to both lineups.
- Long names shrink so every name in a group shares one size. On the In-Game scorebar, team names wrap to two lines instead.
- The data-source placeholder appears only on In-Game.

## Production deployment

Use Node 26.13.0, pnpm 12.16.1 and `pnpm install --frozen-lockfile`. A clean Windows install and production build passed on 2026-11-03; the current lockfile needs no adapter patch.

Set `ORIGIN` to the exact address that controllers and OBS use when starting the server. adapter-node reads it at startup, so changing the address needs a restart, not a rebuild. In PowerShell:

```powershell
pnpm build
$env:ORIGIN = 'http://192.168.1.10:3000' # replace with the server LAN address
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
node --env-file=.env build
```

At runtime:

- Keep `DATABASE_URL` and `ASSET_DIR` on persistent storage, and set `BODY_SIZE_LIMIT=40M` for uploads. Compose reads the operator's `.env`, so raise `BODY_SIZE_LIMIT` to `40M` there too.
- Before upgrading to the version with bundle import, run `pnpm db:duplicates`. It lists team and player names, tags and Riot IDs that differ only by case or by spaces around `#`. The startup migration adds unique indexes and refuses to apply over such duplicates, so fix them first. The script reads `DATABASE_URL` from the host's `.env` (`file:local.db`), not the compose database, so for the compose deployment run `DATABASE_URL=file:data/broadcast.db pnpm db:duplicates` from the repo on the host, with the app stopped (or against a backup copy).
- Run **one Node process**. SSE delivery is process-local, so several workers or replicas would need shared pub/sub.
- Prepared graphic captures are stored in the database and survive restarts.
- Authentication is deferred for trusted-LAN operation. Output pages have no controls, but anyone who can reach the management routes can write.

## Linux HTTPS deployment (Docker + Caddy)

VDO.Ninja camera iframes load only in a secure context, so OBS and vMix on other PCs need HTTPS. `compose.yaml` runs the app behind Caddy at `https://valorant-gfx.noibo.beusesports.vn`. Caddy gets a Let's Encrypt certificate through the Cloudflare DNS-01 challenge, so the server never needs to be reachable from the internet. It has its own certificate and token, independent of the shared internal web server.

Always open the app by hostname. `https://<IP>` gives a certificate error, and the app's own port is not published.

### One-time setup

1. Run `sudo systemctl enable --now docker.service`. With only `docker.socket` enabled, Docker starts on the first `docker` command, not at boot, so after a reboot the outputs would stay blank until someone ran one.
2. Reserve the server's LAN IP in DHCP. The reservation is per network interface: Wi-Fi and Ethernet have different MAC addresses, so reserve the one used on show day.
3. In Cloudflare, add an A record `valorant-gfx.noibo` → that IP, **DNS-only** (grey cloud). Cloudflare's proxy cannot reach a private IP. Add the same name → IP to every local DNS override that answers for it (AdGuard, MikroTik).
4. Create an API token with **Zone → DNS → Edit** for `beusesports.vn` only. Cloudflare scopes tokens per zone, so this token can edit any record in it. Keep it only on this machine.
5. `cp deploy/caddy/caddy.env.example deploy/caddy/caddy.env`, `chmod 600 deploy/caddy/caddy.env`, and paste the token. The file is gitignored, and the app container never sees it.
6. Keep `.env` as for any production run. Compose overrides `ORIGIN` and pins `DATABASE_URL=file:data/broadcast.db`, `ASSET_DIR=./data/assets` and `SETTINGS_ENCRYPTION_KEY_FILE=./data/settings.key`, so every data path stays inside the `./data` bind mount.
7. Prepare `./data` as your own user before the first start. The container runs as uid 1000, so `id -u` must print `1000`. If Docker has to create the directory itself, it is owned by root and the app cannot write to it.
   - Run `mkdir -p data/assets`.
   - To keep existing data, copy the database with `sqlite3 local.db ".backup data/broadcast.db"`. This is safe even while a dev server has `local.db` open.
   - For a new event database, leave `data/broadcast.db` absent. The app creates it and applies every migration on first start.

### Start, stop and logs

```bash
docker compose up -d --build
docker compose logs caddy | grep -i 'certificate obtained'   # first start only
docker compose logs -f app
docker compose down
```

Both services restart with Docker unless they were stopped. Before the show, check that `docker compose ps` lists `app` and `caddy` as running. The certificate and ACME account live in the `caddy_data` volume. Renewal needs internet roughly every 60 days, so start the stack once before travelling to an offline venue.

### Backups and upgrades

The database, assets and key stay in `./data`, so the host-side scripts work. Host commands read `.env`, and `.env` may still point at `local.db` for development. Always pass the event paths explicitly; the prefix wins over `.env`. Stop the app first:

```bash
export DATABASE_URL=file:data/broadcast.db ASSET_DIR=data/assets SETTINGS_ENCRYPTION_KEY_FILE=data/settings.key
docker compose stop app
pnpm backup -- --output <new-directory> --app-stopped
docker compose start app
```

To upgrade, between shows and never during one:

```bash
git rev-parse --short HEAD   # note the running version, for rolling back
git pull
docker compose up -d --build
docker compose logs app | grep -i migrations   # empty when nothing was pending
```

On start the app applies pending migrations by itself. If the database already has data, it first backs up the database and assets to `data/backups/<time>-before-<migration>/` (the log shows it as `/app/data/backups/…`). These backups are never pruned; delete old ones yourself. The encryption key is not copied into them; it stays in `data/settings.key`.

If the backup or a migration fails, nothing is applied and the app exits. It writes what failed, the backup path and the error to `data/backups/MIGRATION-FAILED`. Docker keeps restarting the app, but while that file exists, a start with pending migrations neither backs up nor migrates: it logs the failure and exits again, so one failure makes at most one backup. The data is untouched, so roll back only the code: `git checkout <noted version>`, then `docker compose up -d --build`. The old version has nothing pending and starts normally. Delete `data/backups/MIGRATION-FAILED` only when you want the next start to try the upgrade again with a fresh backup.

If the migration succeeded but the result is wrong, roll back the code **and** the data. Restoring only the data does not help: the new build would migrate it again on start. Check that the backup's `manifest.json` has `"complete": true`, then:

```bash
docker compose stop app
git checkout <noted version>
B=data/backups/<time>-before-<migration>
mv data/broadcast.db data/broadcast.db.rejected && mv data/assets data/assets.rejected
cp "$B/database.db" data/broadcast.db && cp -r "$B/assets" data/assets
docker compose up -d --build
```

Edits made after the upgrade are only in the `.rejected` copies. The [RHS runbook](./RHS-RUNBOOK.md) covers checking the restored outputs before going back on air.

Optional rehearsal: to preview what a migration changes on air (such as 0007 hiding shown graphics), copy the database with `sqlite3 data/broadcast.db ".backup <copy>.db"` and start the new build against the copy first.

### Network checks

- **IP changed:** update the Cloudflare A record **and** every local DNS override (AdGuard, MikroTik). A local override answers first, so leaving it behind keeps the dead address. Then run `ipconfig /flushdns` on each graphics PC and reload its browser sources. Nothing needs rebuilding.
- **Before the show,** run `nslookup valorant-gfx.noibo.beusesports.vn` on each graphics PC and compare the answer with the server's LAN interface address (`ip -4 addr show wlan0` or the Ethernet interface; ignore the 172.x Docker bridges). If the name does not resolve, the router may block DNS answers that point to private IPs. Add a DNS override on the router, or a hosts-file entry on that PC.
- **GStack:** inside the container, `localhost` is the container itself. Set the GStack URL in Settings to the GStack PC's LAN IP.

## Backups

Stopped-app backup: `pnpm backup -- --output <new-directory> --app-stopped`. For the Docker deployment, use the commands in [Backups and upgrades](#backups-and-upgrades), which target `data/broadcast.db`. Protect the encryption key separately. Upgrades back up automatically before migrating; restore with the [RHS recovery runbook](./RHS-RUNBOOK.md).

## Upgrading an existing installation

Reviewed forward migrations:

| Migration | Adds                                              |
| --------- | ------------------------------------------------- |
| 0004      | Broadcast state                                   |
| 0005      | Prepared-data broadcast invalidation              |
| 0006      | Independent broadcast-control revision            |
| 0007      | Persisted graphic captures                        |
| 0008      | Agent ability artwork metadata                    |
| 0009      | In-game match controls                            |
| 0010      | Post-game import provenance and report uniqueness |
| 0011      | Encrypted provider settings                       |
| 0012      | Separate Spectra post-game group code             |
| 0013      | Delayed asset cleanup                             |

- 0007 hides previously shown graphics because no reviewed capture exists for them yet. Show them again after reviewing preparation.
- 0010 protects legacy imported agents whose manual-edit history is unavailable. Review differing agent proposals on the first reimport.

To upgrade:

For the Docker deployment, follow [Backups and upgrades](#backups-and-upgrades). `.env` may still point at the development `local.db`.

1. Upgrade between shows, never during one.
2. Confirm `DATABASE_URL` points at the event database.
3. Start the new build. It backs up existing data to `data/backups/<time>-before-<migration>/`, then applies the reviewed migrations. If either step fails, it applies nothing, records the failure in `data/backups/MIGRATION-FAILED` and exits. It won't retry until you delete that file.
4. Optionally, start the new build against a copy of the database first to preview on-air effects. Never use `db:push` on event data.

Verification runs on disposable databases; the local/event database has not been migrated by this phase.
