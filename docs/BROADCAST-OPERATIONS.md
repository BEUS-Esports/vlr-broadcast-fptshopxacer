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

Set `ORIGIN` to the exact address that controllers and OBS use **before building**. SvelteKit 3's `paths.origin` is a build setting, so setting it only at runtime has no effect. Rebuild whenever the address changes. In PowerShell:

```powershell
$env:ORIGIN = 'http://192.168.1.10:3000' # replace with the server LAN address
pnpm build
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
node --env-file=.env build
```

At runtime:

- Keep `DATABASE_URL` and `ASSET_DIR` on persistent storage, and set `BODY_SIZE_LIMIT=32M` for uploads.
- Run **one Node process**. SSE delivery is process-local, so several workers or replicas would need shared pub/sub.
- Prepared graphic captures are stored in the database and survive restarts.
- Authentication is deferred for trusted-LAN operation. Output pages have no controls, but anyone who can reach the management routes can write.

## Backups

Stopped-app backup: `pnpm backup -- --output <new-directory> --app-stopped`. Protect the encryption key separately. Follow the [RHS recovery runbook](./RHS-RUNBOOK.md) before event upgrades.

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

1. Back up the database and assets together.
2. Stop the app and confirm `DATABASE_URL`.
3. Rehearse `pnpm db:migrate` on a disposable copy.
4. Apply the reviewed migrations during a planned event upgrade. Never use `db:push` on event data.

Verification runs on disposable databases; the local/event database has not been migrated by this phase.
