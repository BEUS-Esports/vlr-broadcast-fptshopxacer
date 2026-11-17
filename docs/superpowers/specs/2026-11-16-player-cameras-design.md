# Player Cameras — admin page design

Date: 2026-11-16 · Branch: `feat/player-cameras` · Status: approved design, pending plan

## Intent

Bring VDO.Ninja player cameras into the app. This first step is the operator page at
`/admin/player-cameras`: it hands out one permanent push link per booth seat, previews all ten
feeds cheaply, and records which team sits at which booth so later graphics (the HUD first) can
find any player's camera.

References: [VDO.Ninja camera notes](../../vdo.ninja-cameras-tips-lol.md) (keep-warm, bitrate
roles, subscription budget), [VDO.Ninja docs index](../../docs.vdo.ninja.llms.txt), the LoL
roadshow `PlayerCameraControl.vue` / `vdoNinja.ts`, and the Figma "Manage Player Cameras" frame
(`l1KORcqfHPnzhtWW1HDwnX`, node `4:2`).

## Goals

- Ten **fixed seats**, `BOOTH1_S1`…`BOOTH1_S5` and `BOOTH2_S1`…`BOOTH2_S5`. A booth PC opens its
  seat's push link once and keeps it for the whole event.
- **Seating comes from the game lineup editor**: Team X's lineup slot N sits at seat N of the
  booth Team X occupies. The camera page has no player pickers.
- A live **Swap booths** control. Booth 1 holds Team A unless swapped. Teams change booths
  between maps; the operator flips it.
- Per-seat preview tile with player label, Connected / Not connected, and Copy link.
- Room setup: room name, password, Copy all player links, Open director room.

## Glossary

### Team A/Team B

Refers to the map veto order of teams. Team A will always be the first to take action in a map veto, Team B the second.

### Booth

Where the team physically sits in the competing venue. 

Note: Not all teams will sit at the expected position even if they selected Team A/B, therefore swapping "booths" do not swap Map Veto Order (Team A/B).

## Non-goals (this step)

- HUD camera output, the Figma "Overlay outputs" panel, pregame intro, Solo View.
- Per-tile bitrate / FPS / resolution stats (VDO.Ninja's `getStats` payload fields are
  undocumented; revisit with a live spike).
- Per-seat remote-control codes, camera PTZ, audio.
- Per-game booth history. Only one match runs at a time.

## Anti-goals

- A camera shown under the wrong player without the page making the booth assignment obvious.
- Previews that load the operator PC like HUD feeds (violates the notes' preview/HUD split).
- Any change to match Team A/B, lineups, scores, or the left/right `swapped` override.

## Approaches considered

1. **Live `boothsSwapped` flag in `broadcast_state`** — chosen. Same pattern as `swapped`; graphics
   already receive broadcast state over SSE, so the HUD needs no new plumbing. Trade-off: one
   current value; forgetting to flip between maps mislabels cameras until noticed.
2. Per-game `games.booth1EntryId` — remembers each map, but adds a revision-locked column feeding
   prepared broadcast data for one boolean while only one match runs.
3. Page-only state — rejected; the HUD can't see it.

## Design

### Data

- `broadcast_state.booths_swapped` — boolean, not null, default false; migration `0015_*` via
  drizzle-kit. Written through `updateBroadcastState` (`BroadcastUpdate.boothsSwapped`), guarded by
  `controlRevision` like other controls. **Not reset on game change** and **not blocked by visible
  graphics** — it records a physical fact (builder call, mirrors `swapped`).
- Snapshot gains `booths: { booth1EntryId, booth2EntryId }`, derived like `presentation`
  (Team A / Team B, flipped when swapped; nulls when nothing is selected). Add to
  `src/lib/broadcast/types.ts` and its decoder schema, and to `liveControls` alongside `swapped`.
- New singleton `camera_settings` (id = 1, `revision`, `room` text not null default `''`,
  `password_encrypted` text, timestamps; singleton and revision checks like `provider_settings`).
- Move `encryptSecret` / `decryptSecret` (and the key loader) out of
  `src/lib/server/settings/providers.ts` into a shared server module; providers and cameras both
  import it. Purpose string `'vdo-camera-password'`.

### Server

- `src/lib/server/settings/cameras.ts`: load (initialize the row on first read; generate a random
  password then), save with expected revision, public shape for the page. Room and password are
  required and restricted to VDO.Ninja-safe characters (`[A-Za-z0-9_]`, length limits — builder
  picks bounds). A password is required so the generic seat IDs are salted per event.
- `src/routes/admin/player-cameras/+page.server.ts`:
  - `load`: camera settings, current broadcast selection, both teams' names/tags, the selected
    game's lineup (entry, slot, player display name), and `boothsSwapped` + `controlRevision`.
  - actions `room` (save room/password) and `booths` (flip `boothsSwapped`). Use the existing
    `readPayload` / `formError` / `ManagementForm` conventions.

### URL helpers

Browser-safe module, e.g. `src/lib/cameras/vdo-ninja.ts`, pure functions:

- `seatIds` and `seatId(booth: 1 | 2, seat: 1..5)`.
- `pushUrl(seatId, room, password)` — `push`, `room`, `password`, `label=<seatId>`, `ad=0`,
  `novideo`, `noaudio`, capture **1280×720 @ 30** as the default per the notes (constants, easy to
  change after the live test).
- `previewUrl(seatId, room, password)` — `view`, `room`, `password`, `scene=0`, `cleanoutput`,
  `disablehotkeys`, `noaudio`, `codec=h264`, `vb=200`, `scale=25`.
- `directorUrl(room, password)`.
- All values via `URLSearchParams`. Nothing is hardcoded.

### Page

Layout follows the Figma, adapted to Valorant (no roles):

```
Manage Player Cameras                                       7/10 feeds connected
Booth 1 · Team A · Demo Bravo     3/5 connected                     [Swap booths]
┌ S1 · BRV_Player ┐ … ┌ S5 · BRV_Player ┐
│ preview iframe   │   │ preview iframe   │
│ ● Connected      │   │ ○ Not connected  │
│ [Copy link]      │   │ [Copy link]      │
Booth 2 · Team B · Demo Charlie   (same)
Room setup: room · password · [Copy all player links] [Open director room]
Fixed-slot help: "push=BOOTH1_S1 — keep the push parameter unchanged"
```

- Tile label: `TAG · Player name` from the lineup when assigned; otherwise the seat ID and
  "Empty seat". With no selected game the page still works (labels fall back to seat IDs) so links
  can be handed out before the match exists.
- The booth header always names the team and its Team A/B role, so the assignment is visible at a
  glance.
- Preview component (`PlayerCameraPreview.svelte`): one iframe per seat with a stable `src`
  (changes only when room/password change). It listens to `message` events, accepts only those
  whose `source` is its own iframe's `contentWindow` and whose origin is `https://vdo.ninja`, and
  treats `{ action: 'view-connection', value }` as connected/disconnected. Keyed by seat ID so
  swapping booths never remounts iframes — only labels move.
- Changing room or password asks for confirmation ("Every handed-out player link stops working").
- Copy uses the Clipboard API with a toast (existing `toaster.ts`).

## Verification

- Unit (vitest): URL helpers (exact params, encoding, no audio, preview bitrate); camera settings
  normalization/validation; `updateBroadcastState` flips `boothsSwapped`, keeps it across game
  change, rejects stale revision; snapshot `booths` derivation and decoder round-trip.
- Component: preview ignores messages from other windows/origins; maps `view-connection`.
- E2E (playwright): page renders ten tiles with lineup labels for the selected game; Swap booths
  moves Team B to Booth 1 without touching match Team A/B; Copy link yields the expected seat URL.
  Tests must not depend on reaching vdo.ninja.
- **Manual live spike** (required before relying on the badge): one or two real senders with
  room + password; confirm `view-connection` fires for `&view=` iframes and record actual preview
  bitrate/resolution in the VDO.Ninja stats panel.

## Left to the builder

- Exact validation bounds for room/password; migration naming; where the shared crypto module lives.
- Visual details within the existing admin styling (Skeleton UI) — the Figma is layout reference,
  not the app's theme.
- Whether to stagger iframe mounting (notes §3.5) if the live spike shows startup jank.

## Calls made without explicit sign-off

- Seat IDs `BOOTHn_Sm`; booth flag not reset on game change and not locked by visible graphics.
- Separate `camera_settings` table rather than columns on `provider_settings` (keeps camera saves out
  of the live-provider reconnect path).
- Random password generated on first load; password required.
- Sender default 720p30; preview `vb=200&scale=25` with `codec=h264`.
- Stats line from the Figma omitted for now.
