# Stinger Transitions — Design

Source request: [docs/feature-description/stinger.md](../../feature-description/stinger.md)

## Intent

Fullscreen graphics change on air with a plain out → in today. Operators want vMix-style stinger transitions: a
full-screen animation plays over the output, and the graphic change happens hidden behind it at a set **cut point**.
The stinger is the swap between fullscreen graphics, so it plays on the composite output where those swaps happen.

## Current state (what this touches)

- `/gfx/live/composite` renders layers through [LiveOutput.svelte](../../../src/lib/broadcast/LiveOutput.svelte) →
  [ProgramLayer.svelte](../../../src/lib/broadcast/ProgramLayer.svelte). Each layer's
  [sequencer.ts](../../../src/lib/broadcast/sequencer.ts) orders `exit` (renderer `stop()` + unmount) → `enter` (mount +
  `play()`) → `refresh` (Update Live, in place).
- Layers ([controls.ts](../../../src/lib/broadcast/controls.ts) `graphicLayers`): 0 In-Game; **1 Player Lineup, Player
  Stats, Map Veto, Post-Game, MVP (the fullscreen graphics)**; 2 Agent Select.
- Uploads ([assets.ts](../../../src/lib/server/assets.ts)) accept PNG/JPEG/WebP ≤ 10 MB, buffered fully in memory, named
  `/assets/<uuid>.<ext>`. [/assets/[name]](../../../src/routes/assets/[name]/+server.ts) returns the whole file, no
  Range support. `BODY_SIZE_LIMIT=160M` (`.env.example`).
- [asset-cleanup.ts](../../../src/lib/server/asset-cleanup.ts) deletes `/assets/*` files not referenced by a fixed list
  of tables after 14 days.
- Global config reaches outputs on the broadcast snapshot (see `sponsor` in
  [snapshot.ts](../../../src/lib/server/broadcast/snapshot.ts)); outputs validate the snapshot strictly
  (`snapshotCheck` in [types.ts](../../../src/lib/broadcast/types.ts)).

## Goals

1. Upload stinger files: **WebM (VP9 with alpha), animated WebP, animated AVIF**. Files of 250 MB+ must upload without
   being held in memory.
2. Each stinger has a **name**, **duration (ms)** and **cut point (ms)**. Operators pick one **active** stinger, or
   **None**.
3. On the composite, layer 1 changes play the active stinger:
   - **Swap** (fullscreen A on air → take B): A `stop()` → stinger starts → at cut point A unmounts, B mounts and
     `play()` runs → stinger finishes and clears.
   - **Show from empty:** stinger starts → at cut point B mounts and `play()` runs.
   - **Hide to empty:** A `stop()` → stinger starts → at cut point A unmounts.
4. The cut lands on the configured millisecond within a frame or two; the stinger never stutters on its first play.

## Non-goals

- Stingers on standalone `/gfx/live/[graphic]` URLs (separate OBS sources can't share one stinger). They keep out → in.
- Stingers on layer 0 (In-Game) or layer 2 (Agent Select).
- Stinger on **Update Live** (in-place refresh) — no stinger.
- MOV / ProRes / HEVC-alpha. Operators convert to WebM locally.
- Server-side transcoding, ffmpeg, thumbnails.
- Duration in frames (WebM frame rate isn't exposed in the browser).
- Per-graphic or per-pair stinger choice; audio mixing controls.
- An admin "rehearse the cut point" preview tool.

## Anti-goals (failure even if it "works")

- **A stinger must never block or lose a graphic change.** If the file fails to load, decode or play, the layer falls
  back to today's out → in and logs a warning.
- A 250 MB upload must not buffer in server memory or freeze other requests.
- The cleanup job must not delete a stinger file that a stinger row references.

## Approaches

| Option | Trade-off | Decision |
| --- | --- | --- |
| **A. Stinger inside the composite page** — one stinger player above all layers; layer 1's sequencer gains a transition step | One page, one clock: cut is frame-accurate. Reuses the existing exit/enter ordering. | **Chosen** |
| B. Separate `/gfx/live/stinger` OBS source on the same SSE | Two browser sources receive SSE tens of ms apart; cut drifts off the covered frame. | Rejected |
| C. Server delays publishing the new graphic until the cut | Cut timing depends on network latency; server learns animation timing. | Rejected |

File format: **A. WebM/WebP/AVIF only** (chosen; operator converts locally). Rejected: server ffmpeg transcoding
(large dependency + slow jobs) and raw MOV (alpha MOV doesn't play in Chromium/OBS CEF).

## Design

### Data

- New table `stingers`: `id`, `name`, `path` (`/assets/<uuid>.<webm|webp|avif>`), `kind` (`video` | `image`),
  `durationMs`, `cutPointMs`, `revision`, timestamps. Checks: `durationMs > 0`, `0 ≤ cutPointMs ≤ durationMs`.
- New singleton `stinger_settings` (`id = 1`, `activeStingerId` FK → `stingers.id`, `on delete set null`, `revision`),
  following `sponsor_settings`. Reviewed migration, seeding the row.
- Add `stingers` to the cleanup job's referenced tables. Deleting a stinger leaves its file to the normal 14-day queue,
  so an in-flight play on air never loses its file.

### Upload and serving

- New streaming endpoint (a `+server.ts` POST under the Stingers admin route) that pipes `request.body` straight to a
  temp file in `ASSET_DIR`, counting bytes. Cap **1 GB**; over the cap aborts and removes the temp file. After writing,
  check magic bytes (WebM `1A 45 DF A3`; WebP `RIFF….WEBP`; AVIF `ftyp` with `avif`/`avis` brand), then rename to
  `<uuid>.<ext>`. Any failure removes the partial file.
- `BODY_SIZE_LIMIT` must allow 1 GB (adapter-node rejects larger bodies before the handler). Raise it in
  `.env.example`, `compose.yaml` / Dockerfile env and the deployment doc. Trade-off: the limit is global, so form
  actions could also accept larger bodies; acceptable on the trusted LAN, and image actions keep their own 10 MB check.
  Management routes have no sign-in (trusted LAN, per README), so the endpoint needs no extra auth. The deployment doc
  confirms the Caddy proxy has no body-size limit or short timeout that would cut a 1 GB upload.
- Extend the asset filename pattern / mime map with `webm` (`video/webm`) and `avif` (`image/avif`). Serve stinger
  files by **streaming with HTTP Range** (`206`, `Accept-Ranges`, `Content-Range`) so video can seek and preload without
  loading the file into memory. Existing image responses may keep their behavior.
- The upload form reads the video duration in the browser (`<video>` `loadedmetadata`) and pre-fills duration; the
  operator can edit it. For WebP/AVIF the operator enters it.

### Admin

- New **Stingers** page in the GFX Control sidebar (next to Sponsors): upload with progress, list (name, kind, duration,
  cut point), edit name/duration/cut point, delete, and pick the active one (or None). Saves use the existing revision /
  stale-write pattern.

### Snapshot

- Add `stinger: { path, kind, durationMs, cutPointMs } | null` (the active one) to `BroadcastSnapshot`, built in
  `buildBroadcastSnapshot`, validated in `snapshotCheck`. Saving stinger settings publishes a new snapshot like sponsor
  saves do. Deploy note: refresh OBS sources (snapshot shape changes).

### Composite playback

- `LiveOutput` (composite only) renders one `StingerPlayer` above every layer (highest z-index), fed
  `snapshot.stinger`. It keeps the active file **preloaded** (`<video preload="auto" muted? playsinline>` / decoded
  image) whenever the stinger changes, and exposes `play(onCut): Promise<void>` that resolves when the stinger ends and
  calls `onCut` at `cutPointMs`.
- Layer 1's `ProgramLayer` gets the stinger when `output === 'composite'` and a stinger is active. Its sequencer runs a
  **transition** in place of the separate exit/enter for any change of the layer's graphic (swap, show from empty,
  hide to empty):
  1. if a graphic is mounted: `await renderer.stop()`;
  2. start the stinger; at the cut point: unmount the old graphic, mount the new one (if any), `await tick()`, call
     `play()` in the same task (existing rule: nothing awaited between mount and `play()`);
  3. the step resolves when both the stinger and `play()` have finished.
  Refresh (same graphic, new revision) stays as today.
- Cut timing is measured from actual playback start (video `playing` event / image first frame), not from the request.
- Fallback: if the stinger hasn't started within a short timeout (measured from stinger start, after `stop()`) or
  errors, run the normal exit → enter.
- **End of stinger** (designer's call): video ends on its `ended` event, images on a `durationMs` timer. A safety cap of
  `durationMs` + margin always ends the step, so a wrong duration never hangs a graphic change.
- **First snapshot** (designer's call): when the composite page loads or reconnects with a graphic already on air, it
  mounts without a stinger, as today. Only changes after the first snapshot play a stinger.
- If the operator retakes during a transition, the sequencer's existing "re-read desired after every await" loop
  settles to the latest target after the current transition finishes.

### Tests

- Sequencer: transition ordering (stop → stinger → cut → mount → play) for swap / show / hide; fallback on stinger
  failure; retake during transition.
- Upload: magic-byte acceptance/rejection, size cap aborts and leaves no file, partial-file cleanup.
- Serving: Range requests return correct `206` bodies.
- Cleanup keeps files referenced by `stingers`.
- Snapshot validation accepts `stinger: null` and a valid stinger.

## Left to the builder

- Exact file/component names, route path for the Stingers page and upload endpoint.
- How animated WebP/AVIF restarts from frame 0 on each play (Chrome shares animation state per URL; e.g. a fresh
  object URL from a preloaded Blob per play, or `ImageDecoder` + canvas).
- Whether stinger video audio plays (default: muted; OBS captures page audio only if configured).
- Fallback timeout value; upload progress UI details.
