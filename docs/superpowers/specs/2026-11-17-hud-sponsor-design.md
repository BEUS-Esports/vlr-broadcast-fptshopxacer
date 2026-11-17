# HUD Sponsor Customization — Design

Source request: [docs/feature-description/hud-sponsor.md](../../feature-description/hud-sponsor.md)

## Intent

Sponsors need visible placement on the in-game HUD. Operators set sponsor art once, globally, and it appears in every
template whose graphics support it, without per-tournament setup or code changes.

## Scope

### Goals

1. **Banner art.** The center match banner (`CenterMatchBanner`) can carry a sponsor **background** and a sponsor
   **logo**. There are 8 configurable banner slots:
   - `default`: the global "Tournament Banner"
   - the five ceremonies: `round-win`, `thrifty`, `clutch`, `team-ace`, `flawless`
   - `tactical` (tactical timeout)
   - `technical` (technical pause)

   Each slot's background and logo fall back **independently** to the `default` slot when unset. If `default` is unset
   too, the banner renders exactly as it does today.
2. **Sponsor loop.** An ordered list of sponsor logos that cycles in the scorebar's reserved sponsor slot, with an
   operator-set interval.
3. **Global config.** There is one config, independent of tournament, match and game.
4. **Template opt-in.** Sponsor content renders only where the template supports it. Unsupported templates look
   unchanged.
5. **Live updates.** Saving updates Preview and on-air output immediately, the same way the in-game controls do.

### Non-goals

- Per-tournament sponsor sets.
- Video or animated-image sponsor art. These use the existing PNG/JPEG/WebP, 10 MB upload path.
- Changing the banner's text content. The label (e.g. `ROUND WIN`), the team logo and the team name always render on
  top of the sponsor art.
- A generic visual style editor. **The banner's custom look is written in template CSS**, not configured in the admin
  UI.

### Anti-goals

- Sponsor art must never hide or replace the label, team logo or team name.
- A template without sponsor support must not change at all, including its layout and empty-slot behaviour.
- Sponsor art must not show where it is unwanted. The sponsor slot stays hidden whenever `showSponsor` is false
  (Spectra provider without supporter attribution), as it is today.
- Uploaded sponsor art must survive the asset cleanup job.

## Current state

- `CenterMatchBanner` ([src/lib/broadcast/in-game/CenterMatchBanner.svelte](../../../src/lib/broadcast/in-game/CenterMatchBanner.svelte))
  - It is shared and rendered by `GraphicRenderer` for `in-game`, outside the template.
  - It draws ceremonies (from `liveControls.ceremony`) and the tactical/technical pause (from `liveControls.pause`).
  - Templates restyle it only through CSS variables. For an example, see `predator-roadshow-val/theme.css`.
- Sponsor slot: there is an empty `.sponsor-slot[data-sponsor-safe-area]` placeholder in two places:
  - `templates/test/InGame.svelte`. This scorebar is reused by the `test` template, by `predator-roadshow-val`, and by
    the live telemetry HUD (`live/InGameHud.svelte`) for **every** tournament.
  - `templates/beus-graph-test/InGame.svelte`, which is its own copy.
- Snapshot model (`src/lib/broadcast/types.ts`, `src/lib/server/broadcast/snapshot.ts`)
  - `BroadcastSnapshot = BroadcastPreparedSnapshot & { publications }`.
  - Program output renders the **publication captured at Show**. `programSnapshot` (`selectors.ts`) overlays live
    fields (`liveControls`, visibility, …) from the latest snapshot.
  - Prepared snapshots are versioned (v5), with legacy upgrade checks.
- Single-row settings precedent: `camera_settings` (`src/lib/server/db/schema/settings.ts`, `/admin/player-cameras`).
- Asset cleanup (`src/lib/server/asset-cleanup.ts`)
  - It deletes any `/assets/…` file not referenced by a hard-coded table list.
  - References are found by walking row values recursively, so paths inside JSON are found.
- Republish trigger: `src/lib/server/broadcast/mutations.ts` regex of admin routes.

## Approaches considered

| Decision | Chosen | Rejected and why |
| --- | --- | --- |
| Storage | One-row `sponsor_settings` table with JSON columns, like `camera_settings` | Normalized `sponsor_banners` + `sponsor_loop_logos` tables: more schema and migrations for a fixed 8-slot set, and they buy nothing |
| Delivery to output | Server-resolved sponsor data on the broadcast snapshot, republished on save | Output fetches settings itself: a second data path with its own reconnect handling |
| Banner opt-in | Template module export `sponsor = { banners: true }`; `CenterMatchBanner` adds art elements only when the flag is set; template CSS places them | Each template renders its own banner: duplicates the expiry and dismiss timing logic per template |
| Loop opt-in | Shared `<SponsorLoop>` in the scorebar's sponsor slot, plus a `loop: true` template flag enforced by `GraphicRenderer` (option A) | Placement alone as the opt-in (option B): the live telemetry HUD reuses the `test` scorebar for every tournament, so unsupported templates would show the loop |

The user approved all four choices.

## Design

### Data

New table `sponsor_settings`, single row `id = 1`, following `camera_settings`:

- `revision` (optimistic lock), `createdAt`, `updatedAt`, using the existing column helpers.
- `banners`: JSON, `Record<SponsorBannerSlot, { backgroundPath: string | null; logoPath: string | null }>`.
  - Slots are `default | round-win | thrifty | clutch | team-ace | flawless | tactical | technical`.
  - Derive the ceremony keys from `ceremonyTypes` in `in-game-controls.ts`, not a second list.
- `loopLogos`: JSON, an ordered `string[]` of asset paths.
- `loopIntervalMs`: integer with a DB `check`. Builder picks bounds; suggest 2000–60000 ms, default 5000.

Add the migration with the project's existing Drizzle migration flow. Startup migrations apply it.

**Add `s.sponsorSettings` to the table list in `collectUnusedAssets`.** This is required, or sponsor art is deleted
after 14 days.

### Snapshot

- Add `sponsor` to `BroadcastSnapshot` **beside `publications`**, not inside `BroadcastPreparedSnapshot`:
  - `sponsor: { banners: Record<BroadcastCeremonyType | 'tactical' | 'technical', { backgroundPath: string | null; logoPath: string | null }>; loop: { logos: string[]; intervalMs: number } }`
  - The server resolves banners with the per-field fallback to `default`, so clients never apply fallback logic.
  - Keeping it out of the prepared snapshot means no version bump and no legacy upgrade. Sponsor art is never frozen
    into a Show capture.
- `buildBroadcastSnapshot` reads `sponsor_settings` (default row when missing) in its transaction.
- `programSnapshot` passes `sponsor: latest.sponsor` through, the same way it passes `publications`/`liveControls`.
- No full-snapshot validator exists on the client; only publications are validated. Update test fixtures and
  snapshot factories that construct `BroadcastSnapshot` to include `sponsor`.

### Admin

- New page `/admin/sponsors`, linked from the admin nav.
  - Banner section: one row per slot (Tournament Banner first, then the ceremonies, Tactical Timeout and Technical
    Pause). Each row has background and logo upload, preview and clear. Unset rows show that they use the Tournament
    Banner.
  - Loop section: upload logos, reorder, remove, and set the interval in seconds.
  - Uses the existing `saveUpload` and form-action patterns from `player-cameras`/`teams`, Skeleton UI components,
    and the revision-based stale-save error.
- Add `sponsors` to the admin-route regex in `mutations.ts` so saves republish.

### Template support

- `templates.ts`: templates may export from `<script module>` in `Graphic.svelte`:
  `export const sponsor = { banners: true, loop: true }`.
  - The registry records it.
  - `resolveGraphicTemplate` returns it, and it defaults to `{ banners: false, loop: false }`.
- **Support is enforced in one place.** `GraphicRenderer` already resolves the template from the rendered snapshot's
  tournament. It then strips what that template doesn't support from `rendered.sponsor`:
  - no `banners` support: every banner entry becomes `{ backgroundPath: null, logoPath: null }`
  - no `loop` support: `loop.logos` becomes `[]`

  Everything downstream (the template, `InGameHud`, `CenterMatchBanner`, `SponsorLoop`) renders whatever is on the
  snapshot and never checks support itself. This also covers the live telemetry HUD: it reuses the `test` scorebar for
  every tournament, but receives a snapshot already filtered by the tournament's own template.
- `CenterMatchBanner`:
  - Look up the shown banner's art from `snapshot.sponsor.banners` by banner type.
  - When it has a background, render a background layer **behind** `.banner-content`.
  - When it has a logo, render a sponsor-logo element (`data-banner-sponsor-logo`) inside the banner.
  - Default CSS is only a sane fallback (background covers the banner, logo stays small and clear of the text). The
    supporting template overrides placement and look in its CSS.
  - Label, team logo and name are unchanged.
  - Select the art by banner type: ceremony type, `tactical`, or `technical`.
- `predator-roadshow-val` is the first supporting template. It exports `sponsor = { banners: true, loop: true }` and
  styles the banner art in `theme.css`.
- The `test` template stays unsupported by default.

### Sponsor loop

- New shared component `src/lib/broadcast/in-game/SponsorLoop.svelte`, props `{ logos, intervalMs }`.
  - It shows one logo at a time and crossfades on the interval.
  - It shows a single logo statically, and nothing when the list is empty.
  - With reduced motion it switches without animation.
  - It preloads the next logo, and keeps the current position when the list is unchanged across snapshot updates.
- Place it inside the existing `.sponsor-slot` of `templates/test/InGame.svelte`, fed from
  `snapshot.sponsor.loop`, replacing the dev `SPONSOR LOOP` placeholder when logos exist.
  - Because the snapshot arrives filtered (see Template support), the loop shows only for tournaments whose template
    has `loop: true`. That applies on the native scorebar and on the live telemetry HUD alike (option A, chosen by the
    user).
- The existing `showSponsor` gate stays. `beus-graph-test` is left unchanged (not opted in) unless asked.
- Add sponsor asset URLs to `collectGraphicAssetUrls` (`preload.ts`) for `in-game`, so output preloads them.

## Verification

- Unit tests:
  - banner fallback resolution (per-field, per-slot)
  - settings validation
  - `programSnapshot` passes `sponsor` through
  - support filtering strips unsupported banners and loop per template
  - asset cleanup keeps sponsor-referenced files
- Component tests:
  - `CenterMatchBanner` renders art only with support, and keeps label, team logo and name
  - `SponsorLoop` cycles and handles one or zero logos
  - the loop is hidden when `showSponsor` is false
- E2E or manual check:
  - Saving on `/admin/sponsors` updates the Preview and on-air in-game output without a re-Show.
  - Roadshow banners show the art.
  - `beus-graph-test` is unchanged, including on the live telemetry HUD: no loop, no banner art.

## Builder calls (my calls, open to correction)

- Interval bounds and default (2–60 s, default 5 s).
- Default fallback CSS for banner art when a template opts in but styles little.
- Crossfade duration for the loop.
- `beus-graph-test` stays opted out.
- Page name and nav label "Sponsors".
