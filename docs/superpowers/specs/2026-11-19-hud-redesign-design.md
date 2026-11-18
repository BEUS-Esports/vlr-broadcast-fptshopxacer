# HUD redesign — design

Source brief: [docs/feature-description/redesign-hud.md](../../feature-description/redesign-hud.md).

## Intent

Both in-game HUDs still look like the generic dev scorebar. They must match the current broadcast
designs before the first Roadshow stop (Đồng Nai, 21/11/2026), and keep serving every later tournament.
The HUD stays **shared, not template-owned**; an event changes only colours, fonts and art through
`--hud-*` custom properties (as `predator-roadshow-val/theme.css` already does).

## Goals

1. **Fallback HUD** (no provider; game shows its full spectator HUD) in the FPT Shop Uni Tour 2024 layout
   (`design_reference/ingame_images/hud-fallback/fptShopUniTour24.png`), framing the game's own top bar.
2. **Provider HUD** (Spectra/GStack connected; game in Custom-Lobby "clean" mode,
   `design_reference/ingame_images/clean/`) in the league/Spectra VCT26 layout
   (`design_reference/reference_img/5.2_league_HUD_NormalPhase.png`,
   `design_reference/ingame_images/spectra/spectraTestingNobii.png`), built around the game's own timer box.

## Non-goals (this spec)

- Camera boxes — next project (auto-follow spectated player via provider, operator seat pick as fallback).
  Only reserve their screen area here.
- 1v1 UI — after camera boxes.
- Per-template HUD components / renderer changes.
- New live-provider data. Round timer comes from the game itself (clean mode keeps it).
- Past-map scores in the map strip (snapshot only carries the current game's score). Follow-up.
- Ceremony / pause banner (`CenterMatchBanner`) redesign — unchanged except it must not collide with
  the new top bars.

## Anti-goals

- Covering anything the game still draws: in fallback, the agent-portrait strip and timer; in provider
  mode, the timer box, minimap, kill feed, plant/defuse banner and the spectated-player bottom bar.
- Roadshow-specific markup or hard-coded Roadshow art in shared components.

## Constraints

- 1920×1080 canvas, transparent background, `pointer-events: none` (unchanged).
- Keep existing `data-*` hooks that tests and outputs rely on (`data-win-dots`, `data-sponsor-safe-area`,
  `data-attribution-safe-area`, `data-live-hud`, `data-identity`, `data-provider-generation`,
  `data-side`, `data-position`, `data-player-id`, …). Update tests only where the markup change is intentional.
- Sponsor loop visibility rule stays: hidden under Spectra unless attribution is `supporter`.
- `ProviderAttribution` stays rendered in the provider HUD.
- Fonts/colours come only from `--hud-*` variables with neutral defaults.

## Approaches

- **A. Keep the HUD shared, rebuild its layout (chosen).** Rewrite the shared fallback scorebar and the
  provider HUD; events theme via `--hud-*`. No renderer or contract change; existing tests and banners stay.
  Chosen because the HUD will serve all future tournaments, and it is the lowest-risk change two days out.
- B. Template-owned HUDs. Full per-event freedom, but changes `GraphicRenderer` and every HUD test.
  Only worth it if a future event needs a structurally different HUD.

## Where the code lives today

- Fallback in-game: each template's `Graphic.svelte` renders `templates/test/InGame.svelte`
  (predator-roadshow-val imports it directly).
- Provider HUD: `GraphicRenderer` → `live/InGameHud.svelte`, which also embeds `test/InGame.svelte` as
  its top bar, plus `live/PlayerCard.svelte` ×10, round history and `ProviderAttribution`.
- `in-game/CenterMatchBanner.svelte` renders over both.

## Design

### 1. Fallback HUD — `templates/test/InGame.svelte` (rewrite in place; all importers keep working)

Reference geometry from the Uni Tour / "dirty" screenshots:

- **Top frame** x≈320–1604, y 0–72. The game's agent strip + timer occupy roughly x 400–1520, y 28–90:
  that window stays fully transparent (frame around it, not a band over it).
  - Team names above the game strip: left name centred ≈x 540, right ≈x 1330, y 0–30.
  - Team logos at the frame ends (≈x 330–395 and 1530–1595).
  - Centre label above the timer: `BEST OF {match.bestOf}`.
  - Series score (maps won) beside the timer, where Uni Tour shows "0 … 0": keep the existing win-dots
    or numbers from `teamScore(snapshot, entryId, 'match')`; side colour from `gameplaySide`.
- **Map box** bottom-left, x≈28–520, y≈858–1072 (below the game's spectated-player portrait at y≈795–875):
  - Tab header: `{match.label} - MAP {game.number}/{match.bestOf}`.
  - Body: event logo (left) │ map name (right, large).
  - Event logo = `--hud-event-logo` (a CSS `url()` set by the template theme); hidden when unset.
- Sponsor loop stays top-right (`data-sponsor-safe-area`).
- `blankMissing` / `teamPresentation` props: `teamPresentation` and `mapName` are no longer needed once
  `InGameHud` stops embedding this component; remove them and their branches if nothing else uses them.

### 2. Provider HUD — `live/InGameHud.svelte` (+ `PlayerCard.svelte`)

`InGameHud` stops embedding `test/InGame.svelte` and draws its own top bar. Geometry from the league
reference:

- **Top bar** x≈640–1280, y 0–80, built around the game's timer box (x 890–1030, y 0–72, left clear).
  - `ROUND {live.roundNumber}` small label above/over the timer's top edge.
  - Left: logo ≈x 660–710, tag ≈x 720–790, score ≈x 800–850; right mirrored. Score = live team score.
  - Series dots under each score (`teamScore(…, 'match')`, local identity only).
  - Side colour (attack/defense) on each half, same derivation as today's rails.
- **Map strip** top-left, x 0–620, y 0–22: one item per veto step whose action is `pick` or `decider`,
  ordered by `gameNumber`. Label `CURRENT:` for `gameNumber === game.number`, `NEXT:` for the next one;
  earlier maps show name only (scores are a follow-up). Hidden when `snapshot.veto` has no picks.
- **Sponsor loop** top-right (≈x 1690–1900, y 0–90), same visibility rule as today.
- **Player cards**: left x≈15–328, right x≈1592–1905 (mirrored), 5 cards from y≈548, ≈100px tall each,
  ≈6px gap. Alive card (league/Spectra layout):
  - row 1: agent portrait (overhangs top-left), player name, shield icon+value, HP number;
  - health bar in side colour;
  - row 2: ult ring with agent ult icon (outer edge), three ability icons with charge pips, weapon
    silhouette, credits.
  - Spike carrier marker beside the name when `hasSpike`.
  - Observed player: highlighted border.
  - Dead (`alive === false`): dimmed, health bar hidden; shows name, credits and `K/D/A`.
  - Missing data renders blank, never placeholder text (current `blankMissing` behaviour).
- **Round history**: moves to just below the top bar (y≈90–150, centred) and shows only when
  `live.phase === 'buy'`. Keeps the current per-round reason glyphs and `role="group"` label.
- **Spike state** text stays near the top bar (it lives in `.round-context` today).
- `ProviderAttribution` unchanged.

### Reserved areas (do not place anything here)

- Game minimap: x 0–420, y 30–470. Kill feed: x 1440–1910, y 90–140.
- Game spectated-player bar: x 470–1390, y 940–1080.
- Future camera box: x≈480–780, y≈750–920.

### Theming

- Roadshow `theme.css` sets the new art/colour tokens it needs (at least `--hud-event-logo`; panel,
  accent, attack/defense already exist). Shared defaults stay neutral so the `test` template still renders.

## Verification

- Existing unit tests pass (`GraphicRenderer`, `PlayerCard`, `ProviderAttribution`, `CenterMatchBanner`,
  `Pregame`, Roadshow `Graphic` tests), updated only where markup intentionally changed.
- New/updated tests: map strip labels (CURRENT/NEXT, hidden with no picks); round history only in buy
  phase; dead card shows K/D/A and hides health; map box header text `… - MAP n/N`.
- Visual check with Playwright screenshots of both HUDs composited over
  `design_reference/ingame_images/dirty/chaoTanHCMUS1.png` (fallback) and
  `design_reference/ingame_images/clean/bg3.webp` (provider): nothing overlaps the reserved areas.

## Left to the builder

- Exact typography, clip-path shapes and spacing, as long as they follow the theme tokens and references.
- Whether the provider top bar is a new component file or inline in `InGameHud.svelte`.
- Icon assets for shield/credits/spike (reuse catalog resources where available, CSS shapes otherwise).
