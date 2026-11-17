# Player Cameras Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/admin/player-cameras`: ten fixed VDO.Ninja push links, cheap per-seat previews with a connection badge, room/password setup, and a live `boothsSwapped` flag that graphics receive in the broadcast snapshot.

**Architecture:** The booth flag lives on `broadcast_state` and flows through the existing `updateBroadcastState` → snapshot → SSE path. The snapshot goes to `version: 5` with a `booths` block and a v4 upgrade path for saved captures. Room and password live in a new singleton table, with the password encrypted by a crypto module shared with provider settings. URL building is a pure browser-safe module. The page derives booth tiles from the snapshot through a pure helper.

**Tech Stack:** SvelteKit 3 / Svelte 5 runes, Skeleton UI, Drizzle + libSQL (SQLite), vitest (`server` node project + `client` browser project), Playwright.

**Spec:** [docs/superpowers/specs/2026-11-16-player-cameras-design.md](../specs/2026-11-16-player-cameras-design.md)

## Global Constraints

- Seat IDs are exactly `BOOTH1_S1`…`BOOTH1_S5`, `BOOTH2_S1`…`BOOTH2_S5`. Booth N seat M shows lineup slot M of the entry in booth N.
- Booth 1 holds Team A (`match.teamAEntryId`) unless `boothsSwapped`. The booth flag never changes `swapped`, Team A/B, lineups, or scores.
- `boothsSwapped` is guarded by `controlRevision`, **not reset on game change**, and **not blocked by visible graphics**.
- Room and password: `[A-Za-z0-9_]` only. Room 1–32 chars; password 8–32 chars. Both are required on save. On first load, room is `''` and the password is generated (`randomBytes(12).toString('hex')`).
- Password purpose string: `'vdo-camera-password'`. The AAD format `provider-settings:${purpose}:v1` stays byte-identical so existing provider ciphertexts still decrypt.
- Sender: 1280×720 @ 30, `ad=0`, `novideo`, `noaudio`. Preview: `scene=0`, `cleanoutput`, `disablehotkeys`, `noaudio`, `codec=h264`, `vb=200`, `scale=25`. All query strings go through `URLSearchParams`; flags are set to `''`.
- Origin accepted for preview messages: `https://vdo.ninja`, and only from the tile's own iframe `contentWindow`.
- Tests never reach vdo.ninja. Playwright routes `https://vdo.ninja/**` to an empty page; component tests use `about:blank`.
- Svelte files pass the Svelte MCP `svelte-autofixer` with no issues (AGENTS.md).
- Run `pnpm check` and `pnpm lint` before each commit that touches TS/Svelte.

## Review Focus

1. **Room not set yet (fresh install)**: the page renders all ten tiles with labels, mounts no iframes, disables Copy/Open director, and asks for a room. Pinned in Task 7's e2e.
2. **Saved v4 program captures after deploy**: `publications` written before this change must upgrade to v5, not silently become `null`. Pinned in Task 3.
3. **Partial or missing lineup / no selected game**: tiles fall back to seat ID + "Empty seat"; booth header shows no team. Pinned in Task 6 (`boothViews`).
4. **Booth swap while graphics are shown or across a game change**: swap succeeds and persists. A stale revision from a second operator tab is rejected. Pinned in Task 2.
5. **Swap reaches graphics**: a POST to `/admin/player-cameras` must trigger the broadcast publish hook, or the HUD never sees the flip. Pinned in Task 2 (`isBroadcastMutation`).

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/lib/server/settings/secrets.ts` (new) | Encryption key loader + `encryptSecret`/`decryptSecret` (moved from providers.ts) |
| `src/lib/server/settings/providers.ts` | Imports secrets instead of owning them |
| `src/lib/server/db/schema/broadcast.ts` | `boothsSwapped` column + check |
| `src/lib/server/db/schema/settings.ts` | `cameraSettings` singleton table |
| `drizzle/0015_*.sql`, `drizzle/0016_*.sql` | Generated migrations |
| `src/lib/server/services/broadcast.ts` | `BroadcastUpdate.boothsSwapped` |
| `src/lib/server/broadcast/mutations.ts` | Publish after `/admin/player-cameras` POSTs |
| `src/lib/broadcast/types.ts` | Snapshot v5 type, decoder, v4→v5 upgrade |
| `src/lib/server/broadcast/snapshot.ts` | `booths` + `liveControls.boothsSwapped` derivation |
| `src/lib/server/settings/cameras.ts` (new) | Load/init/validate/save camera settings |
| `src/lib/cameras/vdo-ninja.ts` (new) | Seat IDs, URL builders, origin constant |
| `src/lib/cameras/booths.ts` (new) | `boothViews(snapshot)` (booth → role, team, seat labels) |
| `src/lib/components/admin/cameras/PlayerCameraPreview.svelte` (new) | One iframe + connection badge |
| `src/routes/admin/player-cameras/+page.server.ts` (new), `+page.svelte` | Page load, `room` and `booths` actions, UI |
| `src/routes/admin/+layout.svelte` | Nav entry (already edited, uncommitted) |
| `tests/fixtures.ts`, `tests/player-cameras.e2e.ts` (new) | Reset `booths_swapped`; page e2e |

---

### Task 1: Shared secrets module

**Files:**
- Create: `src/lib/server/settings/secrets.ts`, `src/lib/server/settings/secrets.test.ts`
- Modify: `src/lib/server/settings/providers.ts` (remove `parseEncryptionKey`, `getEncryptionKey`, `encryptSecret`, `decryptSecret`; import from `./secrets`)

**Interfaces:**
- Produces: `encryptSecret(value: string, purpose: string): Promise<string | null>` (`null` for `''`) and `decryptSecret(value: string | null, purpose: string): Promise<string>` (`''` for null/empty). The bodies move verbatim; only the decrypt error text becomes `'Could not decrypt saved settings. Check the server encryption key.'`

- [ ] **Step 1: Write failing tests** in `secrets.test.ts` (set `process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')`, delete it in `afterEach`):
  - `round-trips a secret and binds it to its purpose`: `decryptSecret(await encryptSecret('pw', 'a'), 'a')` → `'pw'`; the same ciphertext with purpose `'b'` rejects with `/Could not decrypt saved settings/`.
  - `keeps the provider AAD format`: a ciphertext produced by `createCipheriv` with AAD `provider-settings:spectra-access-key:v1` (build it in the test) decrypts with purpose `'spectra-access-key'`.
  - `encryptSecret('', 'a')` → `null`; `decryptSecret(null, 'a')` → `''`.
- [ ] **Step 2:** `pnpm vitest run --project server src/lib/server/settings/secrets.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Move the four functions into `secrets.ts` and export the two. Update `providers.ts` imports. In `providers.test.ts`, change the `'Could not decrypt provider settings'` expectation to `'Could not decrypt saved settings'`.
- [ ] **Step 4:** `pnpm vitest run --project server src/lib/server/settings/`. Expected: PASS (secrets + providers).
- [ ] **Step 5:** Commit `refactor: share settings secret encryption`.

---

### Task 2: `boothsSwapped` broadcast control

**Files:**
- Modify: `src/lib/server/db/schema/broadcast.ts`, `src/lib/server/services/broadcast.ts:29-40,125-165`, `src/lib/server/broadcast/mutations.ts`, `tests/fixtures.ts:13`
- Create: `drizzle/0015_<generated>.sql` (+ meta)
- Test: `src/lib/server/services/broadcast.test.ts`, `src/lib/server/broadcast/mutations.test.ts`

**Interfaces:**
- Produces: `broadcastState.boothsSwapped` (`integer('booths_swapped', { mode: 'boolean' }).notNull().default(false)`, check `broadcast_booths_swapped_check` `in (0, 1)`); `BroadcastUpdate.boothsSwapped?: boolean`; `getBroadcastState()` / `updateBroadcastState()` results carry `boothsSwapped`.

- [ ] **Step 1: Write failing tests** in `broadcast.test.ts` (reuse the fixture style of the existing swap test, `withTwoConnections`, games `g1`/`g2` in one match):
  - `flips booths independently of presentation and keeps it across game changes`: select `g1`; set `visibility: { 'player-stats': true }`; `updateBroadcastState({ expectedRevision, boothsSwapped: true })` succeeds while that graphic is shown → `boothsSwapped: true, swapped: false`. Hide, select `g2` → `boothsSwapped` still `true`.
  - `rejects stale and non-boolean booth flips`: the old revision → `{ code: 'stale' }`; `boothsSwapped: 'yes'` → `{ code: 'invalid' }`; the state is unchanged after each.
  - In `mutations.test.ts`, add `'/admin/player-cameras'` to the accepted-routes list and `'/admin/player-cameras-extra'` to the rejected list.
- [ ] **Step 2:** Run both files with `--project server`. Expected: FAIL.
- [ ] **Step 3:** Add the column + check. Run `DATABASE_URL=file:/tmp/claude-drizzle.db pnpm drizzle-kit generate --name booths_swapped`, then inspect the SQL (one `ALTER TABLE … ADD booths_swapped integer DEFAULT false NOT NULL`; drizzle may rebuild the table to add the check, which is acceptable). In `updateBroadcastState`: throw `SaveError('invalid', 'Choose whether the booths are swapped.')` when `boothsSwapped` is defined and not boolean; set `boothsSwapped: input.boothsSwapped ?? current.boothsSwapped` next to `swapped`. Add `player-cameras` to the `isBroadcastMutation` route alternation. Add `booths_swapped = 0,` to the e2e reset SQL in `tests/fixtures.ts`.
- [ ] **Step 4:** Rerun. Expected: PASS. Also run `pnpm vitest run --project server src/lib/server/services/in-game-controls.test.ts` (the in-game combination guard still rejects mixed keys).
- [ ] **Step 5:** Commit `feat: add live booth swap control`.

---

### Task 3: Snapshot v5 with `booths`

**Files:**
- Modify: `src/lib/broadcast/types.ts:60-133,233-383`, `src/lib/server/broadcast/snapshot.ts:58-75,204-208`
- Modify fixtures (`version: 4` → `5`, add `booths` and `liveControls.boothsSwapped: false`): `src/lib/broadcast/GraphicRenderer.svelte.test.ts`, `primitives/Primitives.svelte.test.ts`, `in-game/CenterMatchBanner.svelte.test.ts`, `templates/test/Pregame.svelte.test.ts`, `templates/test/Statistics.svelte.test.ts`, `preload.test.ts`, `src/lib/components/admin/graphics/InGameMatchControls.svelte.test.ts`
- Test: `src/lib/server/broadcast/snapshot.test.ts`

**Interfaces:**
- Consumes: `broadcastState.boothsSwapped` (Task 2).
- Produces: `BroadcastPreparedSnapshot.version: 5`; `liveControls.boothsSwapped: boolean`; `booths: { booth1EntryId: string | null; booth2EntryId: string | null }`.

- [ ] **Step 1: Write failing tests** in `snapshot.test.ts`:
  - `derives booths from Team A/B and the booth flag only`: with a selected game, unswapped → `booths` equals `{ booth1EntryId: teamA, booth2EntryId: teamB }`. After `updateBroadcastState({ boothsSwapped: true })` → reversed, while `competition` and `presentation` are unchanged. The existing empty-snapshot test expects `booths: { booth1EntryId: null, booth2EntryId: null }` and `liveControls.boothsSwapped: false`.
  - `upgrades saved v4 captures to v5 instead of dropping them`: take a built, selected snapshot (without `publications`), delete `booths` and `liveControls.boothsSwapped`, and set `version: 4`. `validatedPublications({ 'in-game': v4 })['in-game']` toEqual the original with `booths` = Team A/B order and `boothsSwapped: false`.
- [ ] **Step 2:** `pnpm vitest run --project server src/lib/server/broadcast/snapshot.test.ts`. Expected: FAIL.
- [ ] **Step 3:** In `types.ts`, add the fields to the type and to `preparedFields` (`version: oneOf(5)`, `booths: object({ booth1EntryId: text, booth2EntryId: text })`, `boothsSwapped: boolean` in `liveControls`). Introduce `legacyFields` = `preparedFields` without `booths` and with the v4 `liveControls` shape. Add `legacyPreparedV4Check` (`version: oneOf(4)`) and rebase the V2/V3 checks on `legacyFields`. In `persistedPublication`, every legacy version upgrades to `version: 5` with `boothsSwapped: false` and `booths: { booth1EntryId: competition.teamAEntryId, booth2EntryId: competition.teamBEntryId }`, and keeps the existing V2/V3 extras. In `snapshot.ts`, set `liveControls.boothsSwapped`, the empty `booths`, and `booths` next to `presentation` using `state.boothsSwapped`. Update the seven fixtures.
- [ ] **Step 4:** `pnpm vitest run` (both projects) and `pnpm check`. Expected: PASS, no type errors.
- [ ] **Step 5:** Commit `feat: expose booth assignment in broadcast snapshot`.

---

### Task 4: Camera settings storage

**Files:**
- Modify: `src/lib/server/db/schema/settings.ts`
- Create: `drizzle/0016_<generated>.sql`, `src/lib/server/settings/cameras.ts`, `src/lib/server/settings/cameras.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` (Task 1).
- Produces:
  - `cameraSettings` table `camera_settings`: `id` (pk default 1), `revision: revisionColumn()`, `room: text('room').notNull().default('')`, `passwordEncrypted: text('password_encrypted')`, timestamps, checks `camera_settings_singleton_check` (`id = 1`) and `camera_settings_revision_check` (`revision > 0`).
  - `type CameraSettings = { revision: number; room: string; password: string }`
  - `loadCameraSettings(): Promise<CameraSettings>`: insert-on-conflict-do-nothing with a generated password, then select. Two concurrent first loads end with one row and one password.
  - `saveCameraSettings(input: { room: unknown; password: unknown }, expectedRevision: number): Promise<CameraSettings>`: trims; throws `SaveError('invalid', 'Room: 1–32 letters, digits or underscores.')` / `SaveError('invalid', 'Password: 8–32 letters, digits or underscores.')`; throws `SaveError('stale', 'Camera settings changed. Reload before saving.')` on a revision mismatch; bumps the revision.
  - No separate "public" projection: the page needs the plaintext password to build links, so `CameraSettings` is the page shape.

- [ ] **Step 1: Write failing tests** (`withManagementFixture`, `SETTINGS_ENCRYPTION_KEY` as in providers.test):
  - `initializes once with an empty room and a generated password`: two parallel `loadCameraSettings()` calls return equal values; `room === ''`; `password` matches `/^[0-9a-f]{24}$/`; the DB `password_encrypted` matches `/^v1:/` and does not contain the password.
  - `saves a valid room and password and rejects stale revisions`: save `{ room: ' event_1 ', password: 'abcd1234' }` → `{ room: 'event_1', revision: 2 }`; reload equals it; saving again with revision 1 → `{ code: 'stale' }`.
  - `rejects unsafe room and password values`: `it.each` over rooms `''`, `'a b'`, `'a&b'`, `'x'.repeat(33)` and passwords `'short'`, `'has space1'`, `'x'.repeat(33)`, `42` → `{ code: 'invalid' }`; the row is unchanged.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Add the table, then `DATABASE_URL=file:/tmp/claude-drizzle.db pnpm drizzle-kit generate --name camera_settings`, then implement `cameras.ts` following the `loadProviderSettings`/`saveProviderSettings` pattern (conditional `update … where revision = expected` with `.returning()`).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: store player camera room settings`.

---

### Task 5: VDO.Ninja URL helpers

**Files:**
- Create: `src/lib/cameras/vdo-ninja.ts`, `src/lib/cameras/vdo-ninja.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const VDO_NINJA_ORIGIN = 'https://vdo.ninja';
  export type Booth = 1 | 2;
  export type Seat = 1 | 2 | 3 | 4 | 5;
  export type SeatId = `BOOTH${Booth}_S${Seat}`;
  export const seats: readonly Seat[];          // [1,2,3,4,5]
  export const seatIds: readonly SeatId[];      // BOOTH1_S1…S5, BOOTH2_S1…S5
  export function seatId(booth: Booth, seat: Seat): SeatId;
  export const pushCapture = { width: 1280, height: 720, fps: 30 } as const;
  export const previewQuality = { codec: 'h264', vb: 200, scale: 25 } as const;
  export function pushUrl(seat: SeatId, room: string, password: string): string;
  export function previewUrl(seat: SeatId, room: string, password: string): string;
  export function directorUrl(room: string, password: string): string;
  ```

- [ ] **Step 1: Write failing tests** asserting `[...new URL(x).searchParams]` exactly, in order, and `new URL(x).origin === VDO_NINJA_ORIGIN`, path `/`:
  - push → `[['push','BOOTH1_S1'],['room','r'],['password','p'],['label','BOOTH1_S1'],['ad','0'],['novideo',''],['noaudio',''],['width','1280'],['height','720'],['fps','30']]`
  - preview → `[['view','BOOTH2_S5'],['room','r'],['password','p'],['scene','0'],['cleanoutput',''],['disablehotkeys',''],['noaudio',''],['codec','h264'],['vb','200'],['scale','25']]`
  - director → `[['director','r'],['password','p']]`
  - `seatIds` has length 10 in the order above; `seatId(2, 3) === 'BOOTH2_S3'`.
  - Encoding: `pushUrl('BOOTH1_S1', 'a b&c', 'p')` yields `searchParams.get('room') === 'a b&c'` (no injected params).
- [ ] **Step 2:** `pnpm vitest run --project server src/lib/cameras/vdo-ninja.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with `new URL(VDO_NINJA_ORIGIN + '/')` + `url.search = new URLSearchParams([...]).toString()`. No server imports.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add VDO.Ninja seat link helpers`.

---

### Task 6: Booth view helper and preview component

**Files:**
- Create: `src/lib/cameras/booths.ts`, `src/lib/cameras/booths.test.ts`, `src/lib/components/admin/cameras/PlayerCameraPreview.svelte`, `src/lib/components/admin/cameras/PlayerCameraPreview.svelte.test.ts`

**Interfaces:**
- Consumes: snapshot v5 (Task 3), `SeatId`/`seatId`/`seats`/`VDO_NINJA_ORIGIN` (Task 5).
- Produces:
  ```ts
  export type BoothView = {
    booth: Booth;
    role: 'Team A' | 'Team B' | null;
    team: { name: string; tag: string } | null;
    seats: Array<{ id: SeatId; player: string | null }>; // seat 1..5
  };
  export function boothViews(
    snapshot: Pick<BroadcastPreparedSnapshot, 'booths' | 'competition' | 'teams' | 'lineups'>
  ): [BoothView, BoothView];
  ```
  `PlayerCameraPreview` props: `{ src: string | null; title: string; connected?: boolean /* $bindable, default false */ }`.

- [ ] **Step 1: Write failing tests.**
  - `booths.test.ts`:
    - `no selection` → both roles/teams `null`, every `player` `null`, seat IDs in order.
    - `assigns Team A to booth 1 and maps slot N to seat N`: lineup entries for A slots 1–5 and B slots 1–5 → booth 1 `role: 'Team A'`, `seats[2].player` = A's slot-3 display name.
    - `booths swapped` (`booths` reversed) → booth 1 `role: 'Team B'` with B's players.
    - `partial lineup` (A slot 2 missing, A slot 4 with `player: null`) → those seats `player: null`, the others filled.
  - `PlayerCameraPreview.svelte.test.ts` (`render` from `vitest-browser-svelte`, `src: 'about:blank'`; dispatch `new MessageEvent('message', { data, origin, source })` on `window`):
    - `{ action: 'view-connection', value: true }` from the iframe's `contentWindow` with origin `https://vdo.ninja` → badge text `Connected`; then `value: false` → `Not connected`.
    - The same data from `source: window` or origin `https://evil.example` → stays `Not connected`.
    - `src: null` → no `iframe`, badge `Not connected`.
- [ ] **Step 2:** `pnpm vitest run src/lib/cameras/booths.test.ts src/lib/components/admin/cameras/`. Expected: FAIL.
- [ ] **Step 3:** Implement `boothViews`. `booths.booth1EntryId === competition.teamAEntryId` → `'Team A'`, `=== teamBEntryId` → `'Team B'`; team from `teams` by `entryId`; seats from `lineups` by `(entryId, slot)` → `player?.displayName ?? null`. Implement the component: `<svelte:window onmessage>` with the source/origin guard, an `$effect` that resets `connected = false` whenever `src` changes, `<iframe {src} {title} allow="autoplay" class="aspect-video w-full">`, and a badge (`● Connected` / `○ Not connected`). Run `svelte-autofixer` until clean.
- [ ] **Step 4:** Rerun. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add booth view helper and camera preview tile`.

---

### Task 7: Player Cameras page

**Files:**
- Create: `src/routes/admin/player-cameras/+page.server.ts`, `tests/player-cameras.e2e.ts`
- Modify: `src/routes/admin/player-cameras/+page.svelte` (currently empty), `src/routes/admin/+layout.svelte` (nav entry already present; let prettier fix the trailing comma)

**Interfaces:**
- Consumes: `loadCameraSettings`, `saveCameraSettings` (Task 4); `buildBroadcastSnapshot`; `updateBroadcastState` (Task 2); `boothViews` (Task 6); URL helpers (Task 5); `ManagementForm`, `readPayload`, `formError`, `toaster`.
- Produces: `load` → `{ cameras: CameraSettings; controlRevision: number; boothsSwapped: boolean; booths: [BoothView, BoothView] }` (do not ship the whole snapshot). Actions: `room` (payload `{ expectedRevision, room, password }`) and `booths` (payload `{ expectedRevision, boothsSwapped }`), each `readPayload` → service → `{ saved: true }`, with `formError` on failure.

- [ ] **Step 1: Write the failing e2e** `tests/player-cameras.e2e.ts` (import `test` from `./fixtures`; `page.route('https://vdo.ninja/**', r => r.fulfill({ body: '<!doctype html>' }))`; `context.grantPermissions(['clipboard-read','clipboard-write'])`):
  - `hands out seat links and swaps booths without touching Team A/B`:
    1. Go to `/admin/player-cameras` with no selection. Ten tiles are labelled `BOOTH1_S1`…`BOOTH2_S5` with "Empty seat". The "Set a room name to enable links" notice is visible, Copy link buttons are disabled, and there are 0 `iframe`s.
    2. Fill Room `e2e_room`, keep the generated password, and save. Now 10 iframes, each `src` starting `https://vdo.ninja/?view=`.
    3. Click Copy link on `BOOTH1_S1` → clipboard parsed as URL has `push=BOOTH1_S1`, `room=e2e_room`, `password=<input value>`.
    4. Take `pg-event / pg-match / pg-henrik` live on `/admin/graphics/player-lineup` (as in `gfx-controls.e2e.ts`), then return. Booth 1 header contains `Team A · Alpha`; the first tile contains `ALP · Player 0`.
    5. Click `Swap booths` → Booth 1 header contains `Team B · Bravo`, the first tile `BRA · Player 5`, and Booth 2 `Team A · Alpha`. Reload; the state persists.
    6. Change the room again → the confirmation dialog text contains `Every handed-out player link stops working` (accept via `page.once('dialog')`).
- [ ] **Step 2:** `pnpm build && pnpm playwright test tests/player-cameras.e2e.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Server: `load` runs `Promise.all([loadCameraSettings(), buildBroadcastSnapshot()])` and returns the shape above.
  - Page, top to bottom (layout per the spec's sketch and the Figma frame, using the app's Skeleton styling):
    - Header `Manage Player Cameras` + `{n}/10 feeds connected`.
    - Per booth (`{#each booths as b (b.booth)}`):
      - Header `Booth {b.booth} · {b.role} · {b.team.name}` (just `Booth N` when unassigned), `{k}/5 connected`, and `Swap booths` next to Booth 1 only. The swap is a `ManagementForm action="?/booths" recordDraft={false} initial={{ expectedRevision: controlRevision, boothsSwapped: !boothsSwapped }}`.
      - Tiles `{#each b.seats as s (s.id)}`: label `{b.team.tag} · {s.player}` or `{s.id}` + `Empty seat`; `<PlayerCameraPreview src={room ? previewUrl(...) : null} title="Camera preview {s.id}" bind:connected={connected[s.id]} />`; `Copy link` (disabled without a room).
    - Room setup: a `ManagementForm action="?/room"` with Room and Password inputs and `confirmMessage` = `'Every handed-out player link stops working. Change the room or password?'` only when a room is already saved. Then `Copy all player links` (ten lines `SEAT_ID  url`), `Open director room` (`<a target="_blank" rel="noopener">`, inert without a room), and the help text `push=BOOTH1_S1 — keep the push parameter unchanged`.
    - `connected` is `$state<Partial<Record<SeatId, boolean>>>({})`.
    - Copy uses `navigator.clipboard.writeText`, then `toaster.success({ title: 'Link copied' })`, or `toaster.error({ title: 'Could not copy link' })` on rejection.
    - Run `svelte-autofixer` until clean.
- [ ] **Step 4:** Rerun the e2e (Expected: PASS), then `pnpm check && pnpm lint && pnpm test:unit -- --run`.
- [ ] **Step 5:** Commit `feat: add player cameras admin page` (include the layout nav change).

---

### Task 8: Manual live spike (not automatable; required before trusting the badge)

- [ ] Run the app, set a room, and open two seat push links on real devices.
- [ ] Confirm the `view-connection` true/false events arrive for the `&view=` iframes. If they don't, record the event names actually received (temporary `console.log` in the component, not committed) and update `PlayerCameraPreview` + its test.
- [ ] In the VDO.Ninja stats panel, record the preview's actual bitrate/resolution and the sender capture. Confirm flag params serialized as `cleanoutput=` behave as bare flags.
- [ ] Note the results in `docs/vdo.ninja-cameras-tips-lol.md` and commit `docs: record player camera live spike`.

---

## Decisions made in this plan (beyond the spec)

- **Snapshot version bump to 5** with a v4→v5 upgrade, because the decoder is exact-key and would otherwise null every saved capture.
- **`isBroadcastMutation` includes `player-cameras`**, so booth flips publish to graphics.
- **Bounds:** room 1–32 chars, password 8–32 chars; generated password is 24 hex chars.
- **Decrypt error text generalized** to "saved settings"; the AAD prefix is unchanged for compatibility.
- **No "public settings" projection**: the operator page needs the password to build links.
- **Room stays empty until the operator sets it.** The page has an explicit "no room" state rather than an auto-generated room name.
- **Booth derivation lives in `src/lib/cameras/booths.ts`** (pure, unit-tested) rather than in the route.
