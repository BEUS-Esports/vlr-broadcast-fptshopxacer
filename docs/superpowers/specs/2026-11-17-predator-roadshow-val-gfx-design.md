# Predator Roadshow VALORANT graphics — design

## Intent

The FPT Shop x Predator League Roadshow – VALORANT Division runs three stops: Đồng Nai (21–22/11), Đà Nẵng (28–29/11) and Hà Nội (19–20/12). The app's broadcast output must look like the event's package: the LoL roadshow look (aurora sky, cyan grid cards, cyan→teal gradient name plates, Predator font). The current `test` and `beus-graph-test` looks are placeholders.

Source material: `design_reference/` (gitignored, local only). See its `README.md`.

- `predatorRoadshow_lol/`: the LoL roadshow package. PSDs (layered; readable with `psd-tools`), PNG exports, logos, Predator fonts (10 weights, Vietnamese-capable), `BACKGROUND ĐỘNG/MAIN.mp4`.
- `reference_img/`: `roadshow` images are the LoL roadshow broadcast (reuse closely). `league` images are the Predator League VN Qualifiers 2027 (reference for layout ideas only; **do not copy**).

## Goals

1. A new template, `src/lib/broadcast/templates/predator-roadshow-val/`, renders all seven graphics in the roadshow look:
   - Player Lineup
   - Player Stats, single and head-to-head
   - Map Veto
   - Agent Select
   - In-Game, including the existing pause and ceremony banners
   - Post-Game
   - MVP
2. **Map Winner**: the Lineup graphic gains a fourth display option, `winner`. It shows the current game's winning team in the Lineup layout, with a "WINNER" title in place of the Roadshow lockup.
3. Every tournament for the three stops uses this template without per-stop code.

## Non-goals

- No new graphic IDs, OBS URLs or snapshot version bump.
- No background video in the app. Pages stay transparent. Operators run `MAIN.mp4` as its own OBS layer behind full-screen graphics.
- No changes to data, providers, stats computation or how the controller publishes graphics, beyond the `winner` lineup option.
- No restyle of `test` or `beus-graph-test`. They only need to handle `winner` sensibly (below).

## Anti-goals

- Copying the league graphics: their shield logo, dragon/landmark art, or exact layouts.
- Any opaque full-frame background on a page, which would hide the OBS background layer.
- Text baked into images. Names, numbers and labels stay live HTML so Vietnamese diacritics and long names work.

## Approaches considered (Map Winner)

- **A. Lineup display option `winner` (chosen).** No snapshot version bump and no new route. `lineup_teams` is a plain `text` column with no CHECK constraint (`drizzle/0014_tearful_venus.sql`), so only the TS enum and validators widen. Trade-off: Lineup and Map Winner cannot be on air at once.
- **B. Separate `map-winner` graphic.** Rejected: a graphic ID is part of the validated visibility map (`types.ts:320`), so it needs snapshot v6, an upgrade from stored v5 publications, a new admin page and URL, and test churn, all for a layout identical to Lineup.

## Decided

### Template selection

`resolveTemplate` (`src/lib/broadcast/template-resolution.ts`) keeps exact slug matching first. If nothing matches exactly, it picks the template whose id is a prefix of the slug followed by `-`. So `predator-roadshow-val-dong-nai`, `-da-nang` and `-ha-noi` all resolve to `predator-roadshow-val`. Otherwise it falls back to `test` as today. Unit-test this.

### Map Winner control (Lineup admin page)

- `lineupTeams` gains `'winner'` everywhere it is enumerated:
  - `controls.ts`
  - the `types.ts` validator
  - `schema/broadcast.ts` (the enum is TS-only, so no migration)
  - the `broadcast.ts` service validation
  - the `graphics-control.ts` form parsing
- `lineupTeamVisible` (`selectors.ts`) treats `winner` as "the entry equal to `snapshot.game.winnerEntryId`". Add a selector for the game winner team, or reuse an existing one.
- `GraphicControls.svelte`, Lineup page: the existing Team A / Team B / Both buttons and the Show/Hide Lineup button stay as they are. **Below the Show/Hide button**, add a "Map winner" section containing:
  - a "Map winner" display button, styled and wired like the existing lineup-display buttons (posts `lineupTeams: 'winner'`, pressed state when active);
  - **beside it**, the current game's saved result: game number and map, winning team name, and score A–B (e.g. "Game 2 · Ascent — 9Gaming won 13–9"). With no saved winner, it shows "No result saved for this game yet" and the button is disabled.
- `GraphicPreview.svelte` currently forces the main Lineup preview to Team A/B. When the live control is `winner`, the main preview must show the winner layout instead.

### `winner` in other templates

`test` and `beus-graph-test` get `winner` behaviour through `lineupTeamVisible`: the winner's lineup only. No new title art.

### Look and assets

- Canvas 1920×1080 with a transparent body.
- Full-screen graphics carry the shared header:
  - Predator logo, top left
  - "FPT SHOP X PREDATOR LEAGUE / ROADSHOW" lockup, top centre (`LOGO ROADSHOW.png`)
  - FPT Shop pill, top right

  This matches `reference_img/0_roadshow_*` and the `COUNTDOWN.psd` composite. Map Winner replaces the centre lockup with a large "WINNER" title.
- Decorative pieces are exported from the PSDs to PNG (or WebP) and committed under the template's `assets/` folder, imported via Vite: card frames, cyan corner brackets, grid fills, gradient plates, panel frames, scorebar strip, logos. Useful sources:
  - `compare.psd`: player card frame, stat panel, name plate
  - `POSTMATCH.psd`: two-panel layout, side header bars
  - `INGAME/1024 x 126.psd`: scorebar with team plates and the "ROADSHOW / GAME n" centre
  - `INGAME/PLAYER NAME.psd`: gradient name plate
  - `INGAME/góc L FRAME 286 X 112.png`: L-corner frame
  - `COUNTDOWN.psd`: header lockup and score rows
  - `KV`: colours
- Fonts: Predator TTFs (Regular, Bold, Black, Black Italic; add others only if used), committed under the template and loaded with `@font-face`. No Google Fonts.
- Palette, sampled from the package:
  - near-black panels
  - cyan `#00e5ff`-ish frame lines
  - cyan→teal (`#0ff` → `#00d9b0`-ish) plates with dark text
  - white numbers
  - cyan headline labels

  Sample exact values from the PSDs.
- Labels follow the LoL roadshow convention: an English headline (K/D/A, DAMAGE…) with a small Vietnamese subtitle ("Hạ gục / Chết / Hỗ trợ"). Map Veto actions use Vietnamese as in the league reference (CẤM BẢN ĐỒ / CHỌN BẢN ĐỒ / BẢN ĐỒ QUYẾT ĐỊNH).

### Per graphic (what to show; layout is the builder's)

| Graphic | Reuse | Content |
|-|-|-|
| Player Lineup | `0_roadshow_Lineup` | 5 portrait cards (grid fill, gradient fade, "TAG NAME" plate), big team logo + name bottom-left; Both = two rows or two halves, builder's call |
| Map Winner | `6_league_Map Winner` concept on the Lineup layout | as Lineup, winner team only, "WINNER" title instead of the Roadshow lockup |
| Player Stats (single) | `1_roadshow_MVP + Player Stats` | stat grid panel (selected fields, English + VN subtitle), agent full portrait panel in place of "PICK" champion splash, player card with team logo chip |
| Player Stats (H2H) | `2_roadshow_Head2Head` | two player cards flanking a centre stat table; agent icons in the "PICK" row |
| MVP | `1_roadshow_MVP` | as single Player Stats with an "MVP" title |
| Map Veto | ideas from `3_league_Map Veto` | row of map tiles: ban = dimmed with ban mark, pick = map image + acting team, decider; team tag + action under each |
| Agent Select | ideas from `4_league_Agent Select` | bottom strip: two team blocks of 5 agent portraits + player names, team logo ends, map name centre, side (Thủ/Công) labels |
| In-Game (no live data) | `1024 x 126` scorebar, ideas from `5.x_league_HUD` | template's own `InGame.svelte`; keep every existing data element and position contract (attribution safe area, camera areas) |
| In-Game (live HUD) + pause / ceremony banners | `1024 x 126`, `PLAYER NAME.psd`, ideas from `5.x_league_HUD`, `5.3`/`5.4` | **themed, not replaced** (see below) |

### Live HUD theming

`InGameHud`, `PlayerCard` and `CenterMatchBanner` are shared and rendered by `GraphicRenderer` outside any template; a template-owned HUD is a separate, later piece of work. For now:

- Their hard-coded colours and fonts become CSS custom properties whose defaults are today's values, so every other template renders unchanged.
- The roadshow template ships a global `theme.css`, scoped to `[data-template="predator-roadshow-val"]` (the attribute `GraphicRenderer` already sets). It sets those properties and adds frame art through overrides of the existing class names. It holds the `@font-face` rules too, so the HUD gets the Predator font.
- No HUD logic or markup changes. The coupling to class names is accepted and covered by the screenshot check.
| Post-Game | `POSTMATCH.psd` + ideas from `8_league_PostMatch` | team bars with score, per-player rows (agent, name, K/D, kills), per-team MVP card |

Animations: short entrance animations, as in `beus-graph-test`, honouring `prefers-reduced-motion`.

## Constraints

- Svelte 5 / SvelteKit 3. Run the Svelte autofixer on every new or changed component.
- The template receives `GraphicTemplateProps` (`snapshot`, `graphic`) only. Read data through the existing selectors and snapshot fields. Do not add server data.
- Keep the attribution safe area (`[data-attribution-safe-area]`) that the existing templates render.
- `pnpm check`, `pnpm build` and E2E run one after another.
- Existing tests keep passing. Update any test that enumerates `lineupTeams`.

## Verification

- Unit tests:
  - prefix template resolution
  - `lineupTeamVisible` with `winner`
  - Map winner control: disabled without a result; shows the winner and score with one
- A render test that mounts each graphic of the new template with a fixture snapshot (filled and empty selection) without errors.
- Visual check: screenshots of each graphic over `MAIN.mp4`'s first frame, compared by eye against the references. Long names and Vietnamese diacritics must not overflow.

## Left to the builder

- Exact layouts for the league-inspired graphics, the Both-lineups arrangement, and colour values sampled from the PSDs.
- Which PSD layers to export, and at what format and size.
- Whether shared header and frame pieces become small template-local components.
