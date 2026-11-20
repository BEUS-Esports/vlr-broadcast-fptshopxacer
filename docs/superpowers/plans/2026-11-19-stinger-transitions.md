# Stinger Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload WebM/WebP/AVIF stingers and play the active one over composite layer 1 swaps, cutting graphics at the cut point.

**Architecture:** Stinger files stream to `ASSET_DIR` through a raw POST endpoint and are served with HTTP Range. A `stingers` table plus a `stinger_settings` singleton pick the active stinger, which rides the broadcast snapshot. On `/gfx/live/composite`, a `StingerPlayer` above all layers runs the stinger; layer 1's sequencer gains a `transition` step that does `stop()` → stinger → cut (swap mount) → `play()`, falling back to plain exit/enter.

**Tech Stack:** SvelteKit 3, Svelte 5, Drizzle (SQLite), Vitest (server + Chromium browser projects), Playwright, Skeleton UI.

**Spec:** [docs/superpowers/specs/2026-11-19-stinger-transitions-design.md](../specs/2026-11-19-stinger-transitions-design.md)

## Global Constraints

- Formats: WebM (`1A 45 DF A3`), WebP (`RIFF` + `WEBP` at bytes 8–11), AVIF (`ftyp` at bytes 4–7, brand `avif`/`avis` at 8–11). No MOV, no transcoding.
- Upload cap **1 GB** (`STINGER_MAX_BYTES = 1024 ** 3`); bodies are streamed to disk, never buffered.
- `BODY_SIZE_LIMIT` must be ≥ 1 GB everywhere the app runs (`.env.example`, `compose.yaml`/Dockerfile env, docs).
- Duration and cut point in **milliseconds**; `durationMs` integer 1–60000, `cutPointMs` integer 0–`durationMs`.
- Stingers only on `/gfx/live/composite`, layer 1 (`graphicLayers` value of the fullscreen graphics). Never on standalone outputs, layer 0, layer 2, or Update Live (refresh).
- A stinger must never block or lose a graphic change; failure falls back to plain exit → enter.
- First snapshot after the composite page loads/reconnects mounts without a stinger.
- Schema changes only via a reviewed migration (`pnpm db:generate`, then hand-edit). Never `db:push`.
- Run `pnpm check`, `pnpm build` and E2E one after another (they share generated files).
- Log server operations with `logEvent` and safe metadata only.

## Review Focus

1. Operator takes another graphic while a stinger is mid-play → the current transition finishes, then the layer settles on the latest target (test in Task 4).
2. Upload connection drops or exceeds 1 GB mid-stream → no partial file is left in `ASSET_DIR`, no row is created (test in Task 1/3).
3. Active stinger deleted or changed while composite is open → the next transition uses the new value or none; no crash on `stinger: null` (test in Task 5).
4. `cutPointMs` = 0 or = `durationMs` → cut fires once, at start / at end, and the step still resolves (test in Task 5).
5. Range request beyond file size or malformed `Range` header → `416` / full `200`, never a server error (test in Task 1).

---

### Task 1: Stinger file storage and Range serving

**Files:**
- Modify: `src/lib/server/assets.ts`
- Modify: `src/routes/assets/[name]/+server.ts`
- Create: `src/lib/server/stinger-files.test.ts`

**Interfaces:**
- Produces:
  - `STINGER_MAX_BYTES: number` (`1024 ** 3`)
  - `stingerType(head: Uint8Array): { extension: 'webm' | 'webp' | 'avif'; mime: string; kind: 'video' | 'image' }` — throws `SaveError('invalid', 'Use a WebM, WebP or AVIF stinger.')`
  - `saveStingerStream(body: ReadableStream<Uint8Array>, maxBytes = STINGER_MAX_BYTES): Promise<{ path: string; kind: 'video' | 'image' }>` — path `/assets/<uuid>.<ext>`
  - `openAsset(name: string, range: string | null): Promise<{ body: ReadableStream; mime: string; size: number; start: number; end: number; partial: boolean }>` — throws `SaveError('not-found')` for bad names, `SaveError('range')` for unsatisfiable ranges.
  - `filenamePattern` accepts `png|jpg|webp|webm|avif`; mime map adds `video/webm`, `image/avif`.

- [ ] **Step 1: Generate fixtures** (committed, small):

```bash
ffmpeg -f lavfi -i "color=c=red@0.5:s=320x180:d=1,format=yuva420p" -c:v libvpx-vp9 -pix_fmt yuva420p src/lib/broadcast/fixtures/stinger.webm
ffmpeg -f lavfi -i "color=c=red@0.5:s=320x180:d=1,format=rgba" -loop 0 src/lib/broadcast/fixtures/stinger.webp
```

- [ ] **Step 2: Write failing tests** in `src/lib/server/stinger-files.test.ts` (set `ASSET_DIR` to a temp dir like existing upload tests):
  - `stingerType` accepts the two fixtures and a synthetic AVIF header (`00 00 00 1C 'ftyp' 'avif'`), rejects PNG and MOV (`'ftypqt  '`).
  - `saveStingerStream` writes the WebM fixture; `listAssetPaths()` includes the returned path; `kind === 'video'`.
  - `saveStingerStream(stream, 100)` with a 200-byte stream rejects and the asset dir contains no new file (also no temp file).
  - A stream that errors mid-way rejects and leaves no file.
  - `openAsset(name, 'bytes=0-9')` → `partial: true`, `start 0`, `end 9`, body 10 bytes; `null` → `partial: false`, full size; `'bytes=999999999-'` → throws `SaveError` code `range`; `'garbage'` → full body.
- [ ] **Step 3: Run** `pnpm vitest run --project server src/lib/server/stinger-files.test.ts` — Expected: FAIL.
- [ ] **Step 4: Implement** in `assets.ts`. Write to `<uuid>.part` with `{ flag: 'wx' }` via `fs.createWriteStream` + `stream/promises.pipeline`, counting bytes in a transform; on any error or over-cap, `rm` the part file and rethrow (`SaveError('invalid', 'Stingers must be 1 GB or smaller.')` for size). After success read the first 16 bytes, run `stingerType`, rename to `<uuid>.<ext>`. `openAsset` uses `stat` + `createReadStream({ start, end })` → `Readable.toWeb`. Keep `readAsset` unchanged.
- [ ] **Step 5: Route** — `GET /assets/[name]` uses `openAsset(params.name, request.headers.get('range'))`; responds `206` with `content-range: bytes start-end/size` when partial, else `200`; always `accept-ranges: bytes`, `content-length`, existing cache and nosniff headers; `SaveError` `range` → `416` with `content-range: bytes */size`; not-found as today.
- [ ] **Step 6: Run** tests → PASS; `pnpm check` → 0 errors.
- [ ] **Step 7: Commit** `feat(assets): stream stinger uploads and serve assets with Range`.

### Task 2: Stinger data, settings service, snapshot field

**Files:**
- Create: `src/lib/server/db/schema/stingers.ts`; export from `src/lib/server/db/schema/index.ts`
- Create: `drizzle/0020_stingers.sql` (+ drizzle meta from `pnpm db:generate`)
- Create: `src/lib/broadcast/stinger.ts`
- Create: `src/lib/server/settings/stingers.ts`, `src/lib/server/settings/stingers.test.ts`
- Modify: `src/lib/server/broadcast/snapshot.ts`, `src/lib/broadcast/types.ts`, `src/lib/server/asset-cleanup.ts`, `src/lib/server/broadcast/mutations.ts`
- Modify: every snapshot fixture builder that must now include `stinger: null` (e.g. `src/lib/broadcast/templates/test-snapshot.ts`, `src/lib/broadcast/LiveOutput.svelte.test.ts` — `pnpm check` lists them)

**Interfaces:**
- Consumes: Task 1 `stinger` asset paths.
- Produces:
  - `src/lib/broadcast/stinger.ts`: `type StingerKind = 'video' | 'image'`; `type BroadcastStinger = { path: string; kind: StingerKind; durationMs: number; cutPointMs: number }`; `STINGER_DURATION_MAX_MS = 60000`; `STINGER_START_TIMEOUT_MS = 1500`; `STINGER_END_MARGIN_MS = 1000`.
  - Schema `stingers` (`id` text uuid PK, `name`, `path`, `kind`, `durationMs`, `cutPointMs`, `revision`, timestamps; checks `duration_ms between 1 and 60000`, `cut_point_ms between 0 and duration_ms`) and `stingerSettings` (`id = 1`, `revision`, `activeStingerId` → `stingers.id` `on delete set null`).
  - Service: `listStingers(): Promise<Stinger[]>`; `createStinger(input: { name: string; path: string; kind: StingerKind; durationMs: number; cutPointMs: number }): Promise<Stinger>`; `updateStinger(id: string, input: { name: string; durationMs: number; cutPointMs: number }, expectedRevision: number): Promise<Stinger>`; `deleteStinger(id: string): Promise<void>` (deletes the row only; the file is left to the cleanup job's 14-day queue so an on-air play keeps it); `loadStingerSettings(conn?): Promise<{ activeStingerId: string | null; revision: number }>`; `setActiveStinger(id: string | null, expectedRevision: number)`; `loadActiveStinger(conn?): Promise<BroadcastStinger | null>`. Validation errors are `SaveError('invalid', …)`; stale revisions `SaveError('stale', …)`; name trimmed 1–80 chars.
  - `BroadcastSnapshot.stinger: BroadcastStinger | null`.

- [ ] **Step 1: Write failing tests** (`stingers.test.ts`, using `withManagementFixture`):
  - create → list returns it; `durationMs: 0`, `60001`, `cutPointMs > durationMs`, empty name each reject `invalid`.
  - `updateStinger` with stale revision rejects `stale`.
  - `setActiveStinger(id)` then `buildBroadcastSnapshot()` has `stinger` equal to `{ path, kind, durationMs, cutPointMs }`; `deleteStinger(id)` → snapshot `stinger === null` and `loadStingerSettings().activeStingerId === null`.
  - saving stinger settings bumps `broadcastState.dataRevision` (trigger).
  - `collectUnusedAssets` does not queue a path referenced by `stingers`.
  - `decodeBroadcastSnapshot` accepts `stinger: null` and a valid stinger, rejects `kind: 'mov'`.
  - `isBroadcastMutation(POST, '/admin/stingers')` is true.
- [ ] **Step 2: Run** `pnpm vitest run --project server src/lib/server/settings/stingers.test.ts` → FAIL.
- [ ] **Step 3: Schema + migration.** `pnpm db:generate --name stingers`, then hand-add to the SQL, mirroring `0017_sponsor_settings.sql`: `INSERT INTO stinger_settings (id) VALUES (1);` and `AFTER INSERT/UPDATE/DELETE ON stingers` and `AFTER UPDATE ON stinger_settings` triggers bumping `broadcast_state.revision`.
- [ ] **Step 4: Implement** the service, snapshot field (read inside the existing `buildBroadcastSnapshot` transaction), `snapshotCheck` entry `stinger: nullable(object({ path: string, kind: oneOf('video', 'image'), durationMs: integer, cutPointMs: integer }))`, `s.stingers` in the cleanup table list, `stingers` in the `isBroadcastMutation` regex. Add `stinger: null` to fixture builders.
- [ ] **Step 5: Run** the new tests and `pnpm vitest run --project server` → PASS; `pnpm check` → 0 errors.
- [ ] **Step 6: Commit** `feat(stinger): stinger records, active setting and snapshot field`.

### Task 3: Stingers admin page and upload endpoint

**Files:**
- Create: `src/routes/admin/stingers/+page.server.ts`, `+page.svelte`, `upload/+server.ts`
- Modify: `src/routes/admin/+layout.svelte` (sidebar item after Sponsors, Skeleton/lucide icon like the others)
- Modify: `.env.example` (`BODY_SIZE_LIMIT=1G`), `compose.yaml` / `Dockerfile` env, `docs/BROADCAST-OPERATIONS.md` (Stingers section: formats, ffmpeg export hint `-c:v libvpx-vp9 -pix_fmt yuva420p`, composite-only, refresh OBS after deploy, Caddy has no body limit), `docs/MANAGEMENT.md` if it lists admin pages
- Create: `tests/stingers.e2e.ts`

**Interfaces:**
- Consumes: Task 1 `saveStingerStream`, `removeAsset`; Task 2 service.
- Produces: `POST /admin/stingers/upload?name=<>&durationMs=<>&cutPointMs=<>` with raw file body → `201 { id }`; `400 { error }` on invalid input (file removed). Page actions `?/update` (`id`, `name`, `durationMs`, `cutPointMs`, `revision`), `?/remove` (`id`), `?/activate` (`id` or empty for None, `revision`), using `formError` like Sponsors.

- [ ] **Step 1: Write failing E2E** `tests/stingers.e2e.ts` (follow `tests/sponsors.e2e.ts` setup):
  - upload `src/lib/broadcast/fixtures/stinger.webm` named "Main" → row appears with duration pre-filled from the video (≈1000 ms, editable); set cut point 500; save.
  - activate "Main" → `/gfx/live/composite` page has a stinger video element with the asset `src`.
  - upload a PNG renamed `.webm` → error message shown, no row added.
  - select None → stinger element gone.
- [ ] **Step 2: Run** `pnpm test:e2e tests/stingers.e2e.ts` → FAIL. (The composite assertion completes in Task 5; mark it `test.fixme` until then.)
- [ ] **Step 3: Implement endpoint.** Validate query fields before streaming; `saveStingerStream(request.body)`; `createStinger`; on any failure after save, `removeAsset(path)`; log `stinger.upload.failed` via `logEvent` with `{ reason }` only.
- [ ] **Step 4: Implement page.** Upload via `XMLHttpRequest` (for `upload.onprogress`), showing a progress bar; read duration from a hidden `<video>` `loadedmetadata` on file select for WebM; WebP/AVIF require manual duration. List with inline edit, delete (confirm), and an active radio group including None. Run `svelte-autofixer` until clean.
- [ ] **Step 5: Config + docs** edits listed above.
- [ ] **Step 6: Run** E2E (non-fixme) → PASS; `pnpm check`; `pnpm lint`.
- [ ] **Step 7: Commit** `feat(stinger): stingers admin page and streaming upload`.

### Task 4: Sequencer transition step

**Files:**
- Modify: `src/lib/broadcast/sequencer.ts`, `src/lib/broadcast/sequencer.test.ts`

**Interfaces:**
- Produces: `Steps.transition?: (from: LayerTarget | null, to: LayerTarget | null) => Promise<boolean>`. Called whenever the layer's **graphic** changes (including to/from null). `true` = it fully handled the change (current becomes `to`); `false` = not applicable, sequencer runs existing exit/enter. Same-graphic revision changes still use `refresh`. A throwing `transition` counts as handled (existing `run()` rule) — `current` becomes `to`.

- [ ] **Step 1: Write failing tests** (extend `setup` with an optional `transition` that logs `transition:<from>-><to>` and returns a configured boolean / awaits a gate):
  - swap post-game → mvp with `transition` returning true → log `['transition:post-game->mvp']`, no exit/enter.
  - show from empty → `transition:null->mvp`; hide → `transition:mvp->null`.
  - `transition` returning false → `['exit:post-game', 'enter:mvp']`.
  - set(mvp) then set(post-game) while a transition to mvp is gated → after release, log ends with `transition:mvp->post-game` and `idle()` resolves.
  - revision change on same graphic → `refresh`, never `transition`.
- [ ] **Step 2: Run** `pnpm vitest run --project server src/lib/broadcast/sequencer.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `loop()`: before the exit branch, when `current?.graphic !== desired?.graphic` and `steps.transition` exists, capture `from = current, to = desired`, `await run(...)` capturing the boolean (thrown → `true`), and if handled set `current = to` and `continue`.
- [ ] **Step 4: Run** → PASS (existing tests unchanged).
- [ ] **Step 5: Commit** `feat(sequencer): optional transition step for layer changes`.

### Task 5: StingerPlayer and composite wiring

**Files:**
- Create: `src/lib/broadcast/StingerPlayer.svelte`, `src/lib/broadcast/StingerPlayer.svelte.test.ts`
- Modify: `src/lib/broadcast/LiveOutput.svelte`, `src/lib/broadcast/ProgramLayer.svelte`, `src/lib/broadcast/controls.ts`, `src/lib/broadcast/LiveOutput.svelte.test.ts`
- Modify: `tests/stingers.e2e.ts` (un-fixme the composite assertion; add a take/swap check), `tests/gfx-composite.e2e.ts` only if it breaks

**Interfaces:**
- Consumes: Task 2 `BroadcastStinger`, timing constants; Task 4 `Steps.transition`.
- Produces:
  - `controls.ts`: `export const fullscreenLayer = 1;`
  - `StingerPlayer` props `{ stinger: BroadcastStinger | null }`, export `run(onCut: () => Promise<void>): Promise<boolean>`: resolves `false` (without calling `onCut`) if there is no stinger or playback hasn't started within `STINGER_START_TIMEOUT_MS`; otherwise calls `onCut` exactly once at `cutPointMs` after playback start and resolves `true` once the stinger has ended (video `ended`, or `durationMs` for images, capped at `durationMs + STINGER_END_MARGIN_MS`) **and** `onCut` has settled. Hidden (not painted) when idle.
  - `ProgramLayer` new prop `stinger?: StingerPlayer | null` (only passed for the composite fullscreen layer).

- [ ] **Step 1: Write failing component tests** (`StingerPlayer.svelte.test.ts`, browser project, fixtures via `?url` imports):
  - WebM fixture, `cutPointMs: 500` → `onCut` called once, ~500 ms after `playing` (±100 ms), `run` resolves `true` after `ended`.
  - `cutPointMs: 0` and `cutPointMs: durationMs` → `onCut` once, `run` resolves.
  - path to a missing file → resolves `false` within `STINGER_START_TIMEOUT_MS + 200`, `onCut` not called.
  - `stinger: null` → resolves `false` immediately.
  - WebP fixture run twice → second run also reaches `onCut` (animation restarts from frame 0; use a fresh object URL from a preloaded Blob per run).
  - `onCut` that hangs past the end cap → `run` still resolves (cap).
- [ ] **Step 2: Write failing `LiveOutput` tests** (stub renderer hooks + a stub/real stinger fixture):
  - composite with active stinger: swap post-game → mvp records order `stop:post-game`, stinger start, `mount:mvp`, `play:mvp`.
  - first snapshot with mvp already on air → no stinger played.
  - standalone output and layer 0/2 changes → no stinger element / not used.
  - `snapshot.stinger` changes to `null` → next swap is plain exit/enter.
- [ ] **Step 3: Run** `pnpm vitest run --project client src/lib/broadcast/StingerPlayer.svelte.test.ts src/lib/broadcast/LiveOutput.svelte.test.ts` → FAIL.
- [ ] **Step 4: Implement `StingerPlayer`.** Video: `<video muted playsinline preload="auto">` kept loaded while `stinger` is set; `run` rewinds `currentTime = 0`, `play()`, starts the cut timer on `playing`. Image: `fetch` the file into a Blob when `stinger` changes; per run, set a new object URL on an `<img>` and start the timer on `load`; revoke after. Absolutely positioned 1920×1080 above all layers.
- [ ] **Step 5: Wire.** `LiveOutput` renders `<StingerPlayer bind:this={player} stinger={snapshot?.stinger ?? null} />` after the layers only when `output === 'composite'` (z-index above the highest layer), and passes `stinger={player}` to the `ProgramLayer` whose `number === fullscreenLayer`. Add the stinger path to the asset preloader list when composite. `ProgramLayer` provides `transition(from, to)`:
  1. return `false` if no `stinger` prop, no `snapshot?.stinger`, or this is the first non-null snapshot this page has seen;
  2. if `from`: `await renderer?.stop()`;
  3. `const cut = async () => { mounted = null; await tick(); if (to && snapshot) { mounted = { graphic: to.graphic, snapshot }; await tick(); await renderer?.play(); } }` — the null tick forces a fresh `GraphicRenderer` (program wrapper starts at opacity 0); nothing awaited between the second `tick()` and `play()`;
  4. `if (!(await stinger.run(cut))) await cut();` then `return true`.
- [ ] **Step 6: Run** component tests → PASS; un-fixme E2E, add: take Player Lineup then MVP on composite with an active stinger → stinger video plays and `[data-live-layer="1"]` ends with MVP. Run `pnpm check`, `pnpm build`, then `pnpm test:e2e tests/stingers.e2e.ts tests/gfx-composite.e2e.ts` → PASS.
- [ ] **Step 7: Commit** `feat(stinger): play active stinger on composite fullscreen swaps`.
