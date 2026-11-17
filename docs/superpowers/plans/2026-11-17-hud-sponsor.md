# HUD Sponsor Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Global sponsor config, applied only where a template supports it:
- per-banner art (background and logo) for the center match banner, falling back to a Tournament Banner
- a timed sponsor logo loop

**Architecture:**
- **Storage:** a one-row `sponsor_settings` table holds the config as JSON. Triggers bump `broadcast_state.revision`,
  so the publisher re-sends.
- **Snapshot:** `buildBroadcastSnapshot` resolves the fallbacks into `snapshot.sponsor`. It sits beside
  `publications` and is never captured by Show. `programSnapshot` passes it through.
- **Support filtering:** `GraphicRenderer` strips whatever the tournament's template does not declare in its
  `sponsor` export.
- **Rendering:** `CenterMatchBanner` and the shared `SponsorLoop` render whatever remains.

**Tech Stack:** SvelteKit (Svelte 5 runes), Drizzle + SQLite, Vitest (node + `vitest-browser-svelte`), Playwright,
Skeleton UI.

**Spec:** [docs/superpowers/specs/2026-11-17-hud-sponsor-design.md](../specs/2026-11-17-hud-sponsor-design.md)

## Global Constraints

- **Banner slots:** `default` (UI label "Tournament Banner"), the five `ceremonyTypes` from
  `src/lib/broadcast/in-game-controls.ts`, `tactical` and `technical`.
  - Derive the ceremony keys from `ceremonyTypes`. Never retype them.
- **Fallback:** each of `backgroundPath` / `logoPath` falls back **independently** to `default`'s value. If that is
  also `null`, the banner renders exactly as today.
- **Loop interval:** an integer number of ms, 2000–60000 inclusive, default 5000.
  - The DB `check` and the service validation both enforce it.
  - The UI edits it in seconds.
- **Uploads:** only `saveUpload` from `src/lib/server/assets.ts` (PNG/JPEG/WebP, 10 MB max). No new upload path.
- **Text layer:** label, team logo and team name always render above any sponsor art. Sponsor art never replaces them.
- **Unsupported templates:** a template that does not opt in renders byte-identical markup to today.
- **Spectra gate:** the loop stays inside the existing `showSponsor` gate of `templates/test/InGame.svelte`.
- **Asset cleanup:** sponsor asset paths must be listed in `collectUnusedAssets` references.
- **Removed art:** removed or replaced sponsor art is **not** deleted immediately. It may still be on air, so the
  14-day cleanup job owns deletion.
- **Svelte code:** run every new or changed `.svelte` file through the Svelte MCP `svelte-autofixer` until it is
  clean.

## Review Focus

1. **Loop list shrinks mid-cycle.** For example, the current index is 3 and the operator removes logos, leaving 2.
   The loop must show a valid logo (wrap), never blank or throw. Test in Task 6.
2. **Two operators save at once.** The second save gets the stale-revision error with no lost write. Test in Task 2.
3. **Art changes while a banner is on air.** Saving new art during a timeout or ceremony updates the shown banner on
   the next publish, without re-Show and without restarting the ceremony's 6 s window. Test in Task 5.
4. **Prefix-matched tournament slug.** A tournament whose slug is `predator-roadshow-val-hanoi` resolves to the
   roadshow template's sponsor support, through the existing `resolveTemplate` prefix rule. Test in Task 4.
5. **Invalid upload.** A non-image or oversize file leaves the stored config unchanged, removes any file saved earlier
   in the same request, and shows the form error. Test in Task 7.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/lib/broadcast/sponsor.ts` (new) | Types, `emptySponsor`, `resolveSponsor`, `filterSponsor`, `bannerArt`. Pure and shared by client and server |
| `src/lib/server/db/schema/settings.ts` | `sponsorSettings` table |
| `drizzle/0017_*.sql` (generated + hand-added triggers) | Table + revision triggers |
| `src/lib/server/settings/sponsors.ts` (new) | `loadSponsorSettings`, `saveSponsorSettings` (validation + optimistic lock) |
| `src/lib/server/asset-cleanup.ts` | Add `s.sponsorSettings` to referenced tables |
| `src/lib/broadcast/types.ts`, `src/lib/server/broadcast/snapshot.ts`, `src/lib/broadcast/selectors.ts`, `src/lib/broadcast/preload.ts` | `sponsor` on snapshot, pass-through, preload |
| `src/lib/broadcast/templates.ts`, `templates/predator-roadshow-val/Graphic.svelte` | `sponsor` support export and registry |
| `src/lib/broadcast/GraphicRenderer.svelte` | Filter `sponsor` by template support |
| `src/lib/broadcast/in-game/CenterMatchBanner.svelte`, `templates/predator-roadshow-val/theme.css` | Banner art layers and roadshow styling |
| `src/lib/broadcast/in-game/SponsorLoop.svelte` (new), `templates/test/InGame.svelte` | Loop component and placement |
| `src/routes/admin/sponsors/+page.server.ts`, `+page.svelte` (new), `src/routes/admin/+layout.svelte`, `src/lib/server/broadcast/mutations.ts` | Admin page, nav, republish |

---

### Task 1: Shared sponsor model

**Files:**
- Create: `src/lib/broadcast/sponsor.ts`
- Test: `src/lib/broadcast/sponsor.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export const sponsorBannerSlots = ['default', ...ceremonyTypes, 'tactical', 'technical'] as const;
  export type SponsorBannerSlot = (typeof sponsorBannerSlots)[number];
  export type SponsorBannerKind = Exclude<SponsorBannerSlot, 'default'>; // what a shown banner is
  export type SponsorArt = { backgroundPath: string | null; logoPath: string | null };
  export type SponsorConfig = {            // stored form
    banners: Record<SponsorBannerSlot, SponsorArt>;
    loopLogos: string[];
    loopIntervalMs: number;
  };
  export type BroadcastSponsor = {         // resolved form, on the snapshot
    banners: Record<SponsorBannerKind, SponsorArt>;
    loop: { logos: string[]; intervalMs: number };
  };
  export type SponsorSupport = { banners: boolean; loop: boolean };
  export const SPONSOR_INTERVAL_MIN_MS = 2000, SPONSOR_INTERVAL_MAX_MS = 60000, SPONSOR_INTERVAL_DEFAULT_MS = 5000;
  export const emptyArt: SponsorArt;            // both null
  export const defaultSponsorConfig: SponsorConfig;  // all slots emptyArt, [], 5000
  export const emptySponsor: BroadcastSponsor;       // resolveSponsor(defaultSponsorConfig)
  export function resolveSponsor(config: SponsorConfig): BroadcastSponsor;
  export function filterSponsor(sponsor: BroadcastSponsor, support: SponsorSupport): BroadcastSponsor;
  ```

- [ ] **Step 1: Write the failing tests** in `sponsor.test.ts`:
  - `resolveSponsor falls back per field to default`:
    - config `default = { backgroundPath: '/assets/d.png', logoPath: '/assets/dl.png' }`,
      `clutch = { backgroundPath: '/assets/c.png', logoPath: null }`
    - expect `banners.clutch` toEqual `{ backgroundPath: '/assets/c.png', logoPath: '/assets/dl.png' }`
    - expect `banners.tactical` toEqual the default art
  - `resolveSponsor leaves art null when default is unset`: `resolveSponsor(defaultSponsorConfig).banners['round-win']`
    toEqual `{ backgroundPath: null, logoPath: null }`.
  - `resolveSponsor has no default key and maps the loop`:
    - `Object.keys(banners)` toEqual `[...ceremonyTypes, 'tactical', 'technical']`
    - `loop` toEqual `{ logos: config.loopLogos, intervalMs: config.loopIntervalMs }`
  - `filterSponsor strips unsupported parts`:
    - `{ banners: false, loop: true }` → every banner `emptyArt`, logos kept
    - `{ banners: true, loop: false }` → `loop.logos` toEqual `[]`, banners kept
    - `{ banners: true, loop: true }` → returns the same object (`toBe`)

- [ ] **Step 2: Run to verify they fail.**
  Run: `pnpm vitest run src/lib/broadcast/sponsor.test.ts`. Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement `sponsor.ts`** with the interfaces above. `filterSponsor` returns the input unchanged when
  both flags are true.

- [ ] **Step 4: Run to verify they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**: `git add src/lib/broadcast/sponsor*.ts && git commit -m "feat(sponsor): shared sponsor model"`

---

### Task 2: Storage, service, revision triggers, asset cleanup

**Files:**
- Modify: `src/lib/server/db/schema/settings.ts` (after `cameraSettings`)
- Create: `drizzle/0017_<generated>.sql` (+ `drizzle/meta` updates from drizzle-kit)
- Create: `src/lib/server/settings/sponsors.ts`
- Modify: `src/lib/server/asset-cleanup.ts:24` (table list)
- Test: `src/lib/server/settings/sponsors.test.ts`, `src/lib/server/asset-cleanup.test.ts`

**Interfaces:**
- Consumes: `SponsorConfig`, `defaultSponsorConfig`, `sponsorBannerSlots`, and the interval constants from Task 1.
- Produces:
  - `sponsorSettings` (Drizzle table), with columns:
    - `id` (singleton 1)
    - `revision`
    - `banners` (`text` json, `$type<SponsorConfig['banners']>`, default `defaultSponsorConfig.banners`)
    - `loopLogos` (`loop_logos`, json `string[]`, default `[]`)
    - `loopIntervalMs` (`loop_interval_ms` integer, default 5000)
    - `createdAt`, `updatedAt`
  - Checks:
    - `sponsor_settings_singleton_check`
    - `sponsor_settings_revision_check`
    - `sponsor_settings_interval_check` (`between 2000 and 60000`)
  - `export type SponsorSettings = SponsorConfig & { revision: number }`
  - `loadSponsorSettings(connection?: typeof db | Transaction): Promise<SponsorSettings>`. Inserts the default row if
    it is missing, like `loadCameraSettings`. It accepts a transaction so Task 3 can read it inside the snapshot
    transaction.
  - `saveSponsorSettings(next: SponsorConfig, expectedRevision: number): Promise<SponsorSettings>`

- [ ] **Step 1: Write the failing tests** in `sponsors.test.ts`. Use `withManagementFixture`, as
  `invalidation.test.ts` does.
  - `loads defaults on first read`:
    - toEqual `{ ...defaultSponsorConfig, revision: 1 }`
  - `saves and bumps the revision`:
    - save `{ ...defaults, loopLogos: ['/assets/<uuid>.png'], loopIntervalMs: 8000 }` at revision 1
    - expect `revision` 2 and the values round-trip
  - `rejects a stale revision`:
    - save at 1 twice
    - the second rejects with `SaveError` code `'stale'`
    - the stored row equals the first save (Review Focus 2)
  - `rejects invalid config` (each rejects with `SaveError` code `'invalid'`):
    - interval 1999 or 60001
    - a non-integer interval
    - a missing or extra slot key
    - a path not matching `^/assets/[0-9a-f-]{36}\.(png|jpg|webp)$`
    - more than 20 loop logos
  - `bumps broadcast dataRevision on save`:
    - `getBroadcastState()` first
    - save sponsor settings
    - expect `(await getBroadcastState()).dataRevision` to have increased by at least 1

  Add to `asset-cleanup.test.ts`:
  - `keeps sponsor-referenced assets`:
    - upload two images
    - store one as `banners.default.backgroundPath` and the other in `loopLogos`
    - run `collectUnusedAssets` at `start` and at `start + 14 * day`
    - both files still exist and neither is queued

- [ ] **Step 2: Run to verify they fail.**
  Run: `pnpm vitest run src/lib/server/settings/sponsors.test.ts src/lib/server/asset-cleanup.test.ts`.
  Expected: FAIL (missing module, missing table).

- [ ] **Step 3: Add the `sponsorSettings` table** to `schema/settings.ts`, mirroring `cameraSettings`.

- [ ] **Step 4: Generate the migration.**
  - Run: `DATABASE_URL=file:/tmp/sponsor-gen.db pnpm db:generate --name sponsor_settings`.
  - Then append these 2 triggers to the generated SQL, each preceded by `--> statement-breakpoint`, in the style of
    `drizzle/0005_broadcast_invalidation.sql`:
    - `broadcast_revision_sponsor_settings_insert`: `AFTER INSERT ON sponsor_settings`
    - `broadcast_revision_sponsor_settings_update`: `AFTER UPDATE ON sponsor_settings`
    - Both run `UPDATE broadcast_state SET revision = revision + 1 WHERE id = 1`.
  - Expected: a new `drizzle/0017_sponsor_settings.sql`, and `_journal.json` gains entry 17.

- [ ] **Step 5: Implement `sponsors.ts`** following `settings/cameras.ts`:
  - validate the whole `SponsorConfig`
  - lock optimistically with `where id = 1 and revision = expected`
  - set `revision: expected + 1`
  - error copy:
    - stale: `'Sponsor settings changed. Reload before saving.'`
    - invalid interval: `'Loop interval must be 2–60 seconds.'`

- [ ] **Step 6: Add `s.sponsorSettings`** to the `for (const table of [...])` list in `collectUnusedAssets`.

- [ ] **Step 7: Run to verify they pass.**
  - Same command as Step 2. Expected: PASS.
  - Then also run `pnpm vitest run src/lib/server/db` (startup-migrations tests). Expected: PASS.

- [ ] **Step 8: Commit**: `feat(sponsor): sponsor settings storage and service`

---

### Task 3: Sponsor on the broadcast snapshot

**Files:**
- Modify: `src/lib/broadcast/types.ts:143`
  - `BroadcastSnapshot = BroadcastPreparedSnapshot & { publications: BroadcastPublications; sponsor: BroadcastSponsor }`
- Modify: `src/lib/server/broadcast/snapshot.ts` (`buildBroadcastSnapshot`)
- Modify: `src/lib/broadcast/selectors.ts` (`programSnapshot` return object)
- Modify: `src/lib/broadcast/preload.ts` (`collectGraphicAssetUrls`)
- Modify: every test fixture that builds a `BroadcastSnapshot` (`pnpm check` lists them): add `sponsor: emptySponsor`
- Test: `src/lib/server/broadcast/snapshot.test.ts`, `src/lib/broadcast/selectors.test.ts`,
  `src/lib/broadcast/preload.test.ts`

**Interfaces:**
- Consumes:
  - `loadSponsorSettings(tx)` (Task 2)
  - `resolveSponsor`, `emptySponsor`, `BroadcastSponsor` (Task 1)
- Produces: `snapshot.sponsor: BroadcastSponsor` on every built snapshot and every `programSnapshot` result.

- [ ] **Step 1: Write the failing tests**
  - `snapshot.test.ts`: `includes resolved sponsor`
    - save a config with `default.logoPath` set
    - `(await buildBroadcastSnapshot()).sponsor.banners.flawless.logoPath` equals it
  - `selectors.test.ts`: `programSnapshot passes latest sponsor through`
    - the latest snapshot has `sponsor.loop.logos = ['/assets/x.png']`
    - a publication was captured earlier
    - the result's `sponsor` toBe `latest.sponsor`
  - `preload.test.ts`: `preloads sponsor art for in-game only`
    - with banner and loop paths set, the `in-game` URLs contain them
    - the `player-lineup` URLs do not

- [ ] **Step 2: Run to verify they fail.**
  Run: `pnpm vitest run src/lib/server/broadcast/snapshot.test.ts src/lib/broadcast/selectors.test.ts src/lib/broadcast/preload.test.ts`.
  Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `buildBroadcastSnapshot`:
    - call `loadSponsorSettings(tx)` inside the existing transaction, **before** reading `broadcastState`, so that
      the default-row insert trigger's revision bump is included in the state it reads
    - return `{ ...prepared, publications, sponsor: resolveSponsor(settings) }`
  - `programSnapshot`: add `sponsor: latest.sponsor`.
  - `collectGraphicAssetUrls`: when `graphic === 'in-game'`, add every banner's `backgroundPath`/`logoPath` and every
    loop logo from `snapshot.sponsor`.

- [ ] **Step 4: Fix the fixtures.**
  - Run `pnpm check`.
  - For each "Property 'sponsor' is missing" error, add `sponsor: emptySponsor` to that fixture, including
    `templates/test-snapshot.ts`.
  - Expected: `pnpm check` reports 0 errors.

- [ ] **Step 5: Run the tests.** The Step 2 command, then `pnpm test:unit`. Expected: PASS.

- [ ] **Step 6: Commit**: `feat(sponsor): publish resolved sponsor on the broadcast snapshot`

---

### Task 4: Template support declaration and renderer filtering

**Files:**
- Modify: `src/lib/broadcast/templates.ts`
- Modify: `src/lib/broadcast/templates/predator-roadshow-val/Graphic.svelte`. Add
  `<script module lang="ts">export const sponsor: SponsorSupport = { banners: true, loop: true };</script>`
- Modify: `src/lib/broadcast/GraphicRenderer.svelte`
- Test: `src/lib/broadcast/templates.test.ts` (new), `src/lib/broadcast/GraphicRenderer.svelte.test.ts`

**Interfaces:**
- Consumes: `SponsorSupport`, `filterSponsor` (Task 1).
- Produces:
  - `resolveGraphicTemplate(slug)` returns `{ id: string; component: Component<GraphicTemplateProps>; sponsor: SponsorSupport }`.
  - A missing export defaults to `{ banners: false, loop: false }`.

- [ ] **Step 1: Write the failing tests**
  - `templates.test.ts`:
    - `resolveGraphicTemplate('predator-roadshow-val').sponsor` toEqual `{ banners: true, loop: true }`
    - `resolveGraphicTemplate('predator-roadshow-val-hanoi').sponsor` gives the same result (Review Focus 4)
    - `resolveGraphicTemplate('beus-graph-test').sponsor` and `resolveGraphicTemplate(null).sponsor` both toEqual
      `{ banners: false, loop: false }`
  - The end-to-end renderer filtering test lives in Task 6, once both sponsor elements exist.

- [ ] **Step 2: Run to verify they fail.** Run: `pnpm vitest run src/lib/broadcast/templates.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `templates.ts`:
    - widen the glob type to `{ default: Component<GraphicTemplateProps>; sponsor?: SponsorSupport }`
    - put `sponsor: module.sponsor ?? { banners: false, loop: false }` in each registry entry, `test` included
  - `GraphicRenderer`:
    - add `const presented = $derived(rendered && { ...rendered, sponsor: filterSponsor(rendered.sponsor, template.sponsor) })`
    - pass `presented` wherever `rendered` is currently passed to `InGameHud`, `Template` (`agentSnapshot` derives
      from it) and `CenterMatchBanner`
    - keep the `template` lookup on `rendered`

- [ ] **Step 4: Run to verify they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**: `feat(sponsor): template sponsor support and renderer filtering`

---

### Task 5: Banner sponsor art

**Files:**
- Modify: `src/lib/broadcast/in-game/CenterMatchBanner.svelte`
- Modify: `src/lib/broadcast/templates/predator-roadshow-val/theme.css` (in the shared live HUD section, line ~48)
- Test: `src/lib/broadcast/in-game/CenterMatchBanner.svelte.test.ts`

**Interfaces:**
- Consumes: `snapshot.sponsor.banners` (already filtered by Task 4), `SponsorBannerKind`.
- Produces DOM inside `.match-banner`:
  - `<div class="sponsor-background" data-banner-sponsor-background>`, the first child, behind `.banner-content`,
    with `background-image` from `backgroundPath`
  - `<Asset path={logoPath} label="Sponsor" blankMissing>` wrapped in `<div class="sponsor-logo" data-banner-sponsor-logo>`
  - Each element is rendered only when its path is non-null.

- [ ] **Step 1: Write the failing tests**
  - `renders the art of the shown banner kind`:
    - a technical pause with `banners.technical = { backgroundPath: '/assets/a.png', logoPath: '/assets/b.png' }`
    - both `data-banner-sponsor-*` elements exist
    - the `h2` text is still `TECHNICAL PAUSE`
  - `ceremony uses its own slot`:
    - `ceremony.type = 'clutch'` with art only on `clutch`
    - the art is present, and a `round-win` ceremony with empty art renders none
  - `keeps label, team logo and name`:
    - with art set, the team `strong`/`span` and the team `Asset` still render above it
    - `.banner-content` comes after `.sponsor-background` in the DOM
  - `no art means unchanged markup`:
    - with `emptySponsor`, the banner's `innerHTML` equals a render made before this change
    - snapshot it with `toMatchInlineSnapshot` taken before editing the component
  - `art update does not restart the ceremony window` (Review Focus 3):
    - render a ceremony
    - `rerender` with new `sponsor` art at the same `sequence`
    - the art changes, and the banner still expires at the original `triggeredAt + CEREMONY_VISIBLE_MS`
    - use fake timers, as the existing expiry tests do

- [ ] **Step 2: Run to verify they fail.** Run: `pnpm vitest run src/lib/broadcast/in-game/CenterMatchBanner.svelte.test.ts`.
  Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - Add `const kind = $derived<SponsorBannerKind>(freshCeremony ? freshCeremony.type : pause.type === 'tactical' ? 'tactical' : 'technical')`
    and `const art = $derived(snapshot.sponsor.banners[kind])`.
  - Render the elements above.
  - Default CSS:
    - `.sponsor-background { position: absolute; inset: 0; z-index: 0; background: center / cover no-repeat; }`
    - `.banner-content { position: relative; z-index: 1 }`
    - `.sponsor-logo` is absolutely positioned at the right edge, 56 px tall, `z-index: 1`

- [ ] **Step 4: Add the roadshow styling** in `theme.css`: override `.sponsor-background` / `.sponsor-logo` placement
  for the roadshow look. These are global selectors scoped under the roadshow root, matching that section's existing
  pattern.

- [ ] **Step 5: Run the tests.**
  - The Step 2 command, plus `pnpm vitest run src/lib/broadcast/GraphicRenderer.svelte.test.ts`. Expected: PASS.
  - Then run `svelte-autofixer` on `CenterMatchBanner.svelte` until it is clean.

- [ ] **Step 6: Commit**: `feat(sponsor): sponsor art on the center match banner`

---

### Task 6: Sponsor loop

**Files:**
- Create: `src/lib/broadcast/in-game/SponsorLoop.svelte`
- Modify: `src/lib/broadcast/templates/test/InGame.svelte:81-87` (`.sponsor-slot`)
- Test: `src/lib/broadcast/in-game/SponsorLoop.svelte.test.ts`

**Interfaces:**
- Consumes: `snapshot.sponsor.loop` (filtered).
- Produces:
  - `SponsorLoop` props: `{ logos: readonly string[]; intervalMs: number }`
  - root element `<div class="sponsor-loop" data-sponsor-loop data-index={i}>`
  - renders nothing when `logos` is empty

- [ ] **Step 1: Write the failing tests** (fake timers):
  - `cycles on the interval`:
    - 3 logos at 5000 ms
    - shows logo 0, then logo 1 after 5000 ms, then logo 2 after 10000 ms, then back to logo 0
  - `single logo is static`: no index change after 20000 ms.
  - `empty renders nothing`: no `[data-sponsor-loop]`.
  - `same list on a new snapshot keeps position`:
    - advance to index 2
    - `rerender` with an equal but new array
    - the index is still 2
  - `shrunk list wraps to a valid logo` (Review Focus 1):
    - at index 2 of 3, rerender with 2 logos
    - the shown logo is one of the 2, never blank
  - `interval change applies`:
    - rerender with 2000 ms
    - the next switch comes after 2000 ms
  - `reduced motion`: with `prefers-reduced-motion`, there's no crossfade transition (duration 0).
  - In `GraphicRenderer.svelte.test.ts`: `strips sponsor for unsupported templates, including the live HUD`
    - a snapshot with tournament slug `beus-graph-test`, `in-game` visible, `sponsor.loop.logos = ['/assets/x.png']`
      and a `technical` pause with `banners.technical.backgroundPath` set
    - render in `program` mode and in `preview-live` mode
    - in both modes, expect no `[data-sponsor-loop]` and no `[data-banner-sponsor-background]`
    - repeat with slug `predator-roadshow-val`: both elements are present

- [ ] **Step 2: Run to verify they fail.** Run: `pnpm vitest run src/lib/broadcast/in-game/SponsorLoop.svelte.test.ts`.
  Expected: FAIL.

- [ ] **Step 3: Implement `SponsorLoop.svelte`.**
  - Track `index` in `$state`.
  - Run an `$effect` keyed on `intervalMs` and `logos.length` that runs `setInterval(() => index = (index + 1) % logos.length, intervalMs)`
    when `length > 1`, and cleans up on change.
  - Clamp the shown index with `index % logos.length`.
  - Fill the slot with `Asset`, crossfading 300 ms (0 under `prefersReducedMotion.current`).
  - Preloading is covered by Task 3's `collectGraphicAssetUrls`.

- [ ] **Step 4: Place it in `test/InGame.svelte`.**
  - Inside the `{#if showSponsor}` slot:
    - when `snapshot.sponsor.loop.logos.length`, render
      `<SponsorLoop logos={snapshot.sponsor.loop.logos} intervalMs={snapshot.sponsor.loop.intervalMs} />`
    - otherwise keep the existing `{#if !blankMissing}<span>SPONSOR LOOP</span>{/if}` placeholder
  - Do not touch `beus-graph-test/InGame.svelte`.

- [ ] **Step 5: Run the tests.**
  - The Step 2 command, plus `GraphicRenderer.svelte.test.ts`,
    `templates/test/Pregame.svelte.test.ts` and `live/*.test.ts`. Expected: PASS.
  - Then run `svelte-autofixer` on both `.svelte` files until it is clean.

- [ ] **Step 6: Commit**: `feat(sponsor): sponsor logo loop in the shared scorebar`

---

### Task 7: Admin page, nav, republish

**Files:**
- Create: `src/routes/admin/sponsors/+page.server.ts`, `src/routes/admin/sponsors/+page.svelte`
- Modify: `src/routes/admin/+layout.svelte:68` (nav item after Player Cameras, label `Sponsors`, Lucide icon `Megaphone`)
- Modify: `src/lib/server/broadcast/mutations.ts`: add `sponsors` to the route alternation
- Test: `src/lib/server/broadcast/mutations.test.ts`, `tests/sponsors.e2e.ts` (new)

**Interfaces:**
- Consumes: `loadSponsorSettings`, `saveSponsorSettings`, `SponsorConfig`, `sponsorBannerSlots`, `saveUpload`,
  `removeAsset`, `formError`, `field`.
- Produces:
  - `load` → `{ sponsor: SponsorSettings }`
  - Actions. Each reads `revision` and calls `saveSponsorSettings` exactly once with a full next config:

    | Action | Form fields | Change to the config |
    | --- | --- | --- |
    | `banner` | `slot`, file `background`, file `logo`, checkboxes `clearBackground`/`clearLogo` | Replaces that slot's paths; an empty file input keeps the current path |
    | `loopAdd` | multi-file `logos` | Appends the uploads |
    | `loopRemove` | `index` | Removes that logo |
    | `loopMove` | `index`, `direction` (`up`/`down`) | Moves that logo one place |
    | `interval` | `seconds` | Sets `loopIntervalMs = round(seconds * 1000)` |

  - Upload failure follows the teams pattern: remove the paths uploaded in this request, then `return formError(cause, form)`.
  - Replaced or removed paths are **not** deleted. The cleanup job owns deletion (Global Constraints).

- [ ] **Step 1: Write the failing tests**
  - `mutations.test.ts`: add `'/admin/sponsors'` to the expected-mutation list.
  - `tests/sponsors.e2e.ts`, using the helpers in `tests/management-helpers.ts` / `tests/fixtures.ts` and the
    `player-cameras.e2e.ts` style:
    - `banner art reaches on-air output without re-Show`:
      - select a roadshow-template game, Show `in-game`, open `/gfx/live/in-game`
      - trigger a technical pause
      - on `/admin/sponsors`, upload a Tournament Banner background
      - on the output, `[data-banner-sponsor-background]` becomes visible
    - `loop shows uploaded logos`:
      - upload 2 loop logos and set the interval to 2 s
      - `[data-sponsor-loop]` shows, and `data-index` changes within 3 s
    - `unsupported template stays clean`: the same setup with a `beus-graph-test` game shows neither element.
    - `invalid upload keeps config` (Review Focus 5):
      - upload a `.txt` as a banner logo
      - the error text `Use a PNG, JPEG, or WebP image.` is shown
      - after reload the slot is still unset

- [ ] **Step 2: Run to verify they fail.**
  Run: `pnpm vitest run src/lib/server/broadcast/mutations.test.ts && pnpm playwright test tests/sponsors.e2e.ts`.
  Expected: FAIL.

- [ ] **Step 3: Implement the route and the regex change.**

- [ ] **Step 4: Implement `+page.svelte`** with Skeleton UI, following the `player-cameras/+page.svelte` layout and the
  `ManagementForm` patterns:
  - **Banners section:**
    - one row per slot, labelled `Tournament Banner`, then `ceremonyLabels` in title case, then `Tactical Timeout`,
      `Technical Pause`
    - each row has thumbnails, file inputs and clear checkboxes
    - unset non-default rows show `Uses Tournament Banner`
  - **Loop section:**
    - a thumbnail list with up, down and remove buttons, plus a multi-file add
    - an interval number input in seconds, `min=2 max=60 step=0.5`
  - Show stale and invalid errors through the existing toaster/form error UI.
  - Run `svelte-autofixer` until it is clean.

- [ ] **Step 5: Run the tests.** The Step 2 command, then `pnpm check && pnpm lint`. Expected: PASS, 0 errors.

- [ ] **Step 6: Commit**: `feat(sponsor): sponsor admin page`

---

### Task 8: Full verification

- [ ] **Step 1:** `pnpm check && pnpm lint && pnpm test:unit`. Expected: all PASS.
- [ ] **Step 2:** `pnpm playwright test tests/sponsors.e2e.ts tests/roadshow-visuals.e2e.ts tests/phase6.1-banners.e2e.ts tests/stacked-graphics.e2e.ts`.
  Expected: PASS. The existing banner and roadshow visuals are unchanged when no sponsor is configured.
- [ ] **Step 3:** Update the spec's "Data" section to record the revision triggers (added during planning: the
  publisher drops publishes whose revision didn't change). Commit: `docs(spec): note sponsor revision triggers`.
