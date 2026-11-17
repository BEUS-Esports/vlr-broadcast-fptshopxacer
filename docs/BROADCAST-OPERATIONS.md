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
- Unknown tournament slugs use the generic test templates. Final supplied artwork is a later phase.
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

- Keep `DATABASE_URL` and `ASSET_DIR` on persistent storage, and set `BODY_SIZE_LIMIT=32M` for uploads.
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
git pull
docker compose up -d --build
docker compose logs app | grep -i migrations   # empty when nothing was pending
```

On start the app applies pending migrations by itself. If the database already has data, it first backs up the database and assets to `data/backups/<time>-before-<migration>/` (the log shows it as `/app/data/backups/…`). If the backup or a migration fails, nothing is applied, the app exits and Docker keeps restarting it, and `docker compose logs app` names the backup. Restore with the [RHS runbook](./RHS-RUNBOOK.md). These backups are never pruned; delete old ones yourself. The encryption key is not copied into them; it stays in `data/settings.key`.

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
3. Start the new build. It backs up existing data to `data/backups/<time>-before-<migration>/`, then applies the reviewed migrations. If either step fails, it applies nothing and exits; the log names the backup.
4. Optionally, start the new build against a copy of the database first to preview on-air effects. Never use `db:push` on event data.

Verification runs on disposable databases; the local/event database has not been migrated by this phase.
