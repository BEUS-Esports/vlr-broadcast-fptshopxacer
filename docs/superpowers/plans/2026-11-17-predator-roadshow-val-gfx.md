# Predator Roadshow VALORANT Graphics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every broadcast graphic in the FPT Shop x Predator League Roadshow look. Add a Map Winner display mode to the Lineup graphic.

**Architecture:**
- A new template folder, `src/lib/broadcast/templates/predator-roadshow-val/`. It is picked up by the existing `import.meta.glob` registry and selected by slug prefix.
- Map Winner is a new `lineupTeams` value, `'winner'`, threaded through the existing control path.
- The shared live HUD is themed through CSS custom properties plus a stylesheet scoped to `[data-template="predator-roadshow-val"]`.

**Tech Stack:** SvelteKit 3, Svelte 5 runes, TypeScript, Vitest browser mode (`vitest-browser-svelte`), Playwright, psd-tools (asset export only, not a dependency).

**Spec:** `docs/superpowers/specs/2026-11-17-predator-roadshow-val-gfx-design.md`

## Global Constraints

- Template id and folder: `predator-roadshow-val`. Stop tournaments use slugs `predator-roadshow-val-<stop>`.
- Pages stay transparent. No full-frame opaque background. No video in the app.
- Canvas: 1920×1080.
- Fonts: Predator TTFs only, loaded via `@font-face` from committed files. No Google Fonts.
- Text, numbers and names are live HTML, never baked into images.
- Labels: English headline plus a small Vietnamese subtitle. Map Veto actions: `CẤM BẢN ĐỒ`, `CHỌN BẢN ĐỒ`, `BẢN ĐỒ QUYẾT ĐỊNH`.
- Do not copy league art: no shield logo, no dragon or landmark art.
- Entrance animations respect `prefers-reduced-motion`.
- Keep `[data-attribution-safe-area]` and existing `data-*` test hooks (`data-slot`, `data-position`, `data-field`, `data-entry-id`).
- Run `pnpm check`, `pnpm build` and E2E one after another, never in parallel.
- Run the Svelte MCP `svelte-autofixer` on every new or changed `.svelte` file until clean.
- No DB migration. `lineup_teams` has no CHECK constraint.

## Review Focus

1. **A long team or player name** (for example "9G CHARLINGTON", "Robo Trái Cây") or Vietnamese diacritics on stacked lines. Expected: ellipsis or font-fit inside the plate, never overflowing the frame or clipping diacritics. *Test:* Task 10's overflow assertion.
2. **Map winner chosen and then the operator changes game.** The server already resets `lineupTeams` to `'both'` on a game change. Expected: the button is unpressed and the new game's result is shown. *Test:* Task 2, server test.
3. **Missing images** (player portrait, team logo, agent or map art is `null`). Expected: the frame still renders with a neutral fill; no broken-image icon. *Test:* Task 3 render-each-graphic test using null asset paths.
4. **A game with a forfeit or walkover result.** `winnerEntryId` is set but scores may be null. Expected: the Map Winner info shows the winner and "Forfeit" or "Walkover" instead of a score. *Test:* Task 2, component test.
5. **The roadshow theme leaking into other templates' HUD.** Expected: the `test` template's live HUD computed colours are unchanged. *Test:* Task 9.

---

### Task 1: Slug-prefix template resolution

**Files:**
- Modify: `src/lib/broadcast/template-resolution.ts`
- Test: `src/lib/broadcast/template-resolution.test.ts`

**Interfaces:**
- Produces: `resolveTemplate(slug, templates)` resolves in this order:
  1. an exact own key;
  2. the longest own key `k` where `slug.startsWith(k + '-')`;
  3. `templates.test`.

  The signature is unchanged.

- [ ] **Step 1: Write the failing test** `it('resolves stop slugs to their event template by prefix')`, with `templates = { test, event, 'event-special' }`:
  - `resolveTemplate('event-dong-nai', t)` returns `t.event`;
  - `resolveTemplate('event-special-x', t)` returns `t['event-special']`;
  - `resolveTemplate('eventual', t)` returns `t.test`;
  - `resolveTemplate('test-x', t)` returns `t.test`.
- [ ] **Step 2:** Run `pnpm vitest run src/lib/broadcast/template-resolution.test.ts`. Expected: FAIL on the first assertion.
- [ ] **Step 3:** Implement with `Object.keys(templates).filter(key => key !== 'test' && slug.startsWith(key + '-'))`, then take the longest. Keep the `Object.hasOwn` exact match first.
- [ ] **Step 4:** Re-run the test. Expected: PASS, and the existing `__proto__`/`constructor` cases still pass.
- [ ] **Step 5:** Commit `feat(gfx): resolve stop tournaments to their event template by slug prefix`.

### Task 2: `winner` lineup option, from server to admin control

**Files:**
- Modify:
  - `src/lib/broadcast/controls.ts:3`
  - `src/lib/server/db/schema/broadcast.ts:32`
  - `src/lib/server/services/broadcast.ts:239-240`
  - `src/lib/broadcast/selectors.ts:59-67`
  - `src/lib/components/admin/graphics/GraphicControls.svelte` (Lineup block, lines 58-91)
  - `src/lib/components/admin/graphics/GraphicPreview.svelte:34-45`
- Create: `src/lib/components/admin/graphics/MapWinnerControl.svelte`
- Test:
  - `src/lib/broadcast/selectors.test.ts`
  - `src/lib/server/broadcast/field-controls.test.ts`
  - `src/lib/components/admin/graphics/MapWinnerControl.svelte.test.ts`

**Interfaces:**
- Produces:
  - `lineupTeams = ['both', 'team-a', 'team-b', 'winner'] as const`.
  - `gameWinnerTeam(snapshot: BroadcastSnapshot): BroadcastTeam | null` in `selectors.ts`. It returns `teamByEntryId(snapshot, snapshot.game?.winnerEntryId ?? null)`.
  - `lineupTeamVisible` returns `true` for `'winner'` only when `entryId !== null && entryId === snapshot.game?.winnerEntryId`.
  - `MapWinnerControl` props are `{ live: BroadcastSnapshot }`.

Steps:

- [ ] **Step 1: Write the failing tests.**
  - `selectors.test.ts`, `it('shows only the saved game winner in winner mode')`:
    - with `winnerEntryId: 'a'`: `lineupTeamVisible(s, 'a')` is true and `(s, 'b')` is false;
    - with `winnerEntryId: null`: both are false;
    - `gameWinnerTeam(s)?.entryId === 'a'`.
  - `field-controls.test.ts` (follow the file's existing lineupTeams cases):
    - saving `lineupTeams: 'winner'` persists and the snapshot reports `'winner'`;
    - selecting another game resets it to `'both'`.
  - `MapWinnerControl.svelte.test.ts`:
    - no winner: the button `Map winner` is disabled and the text `No result saved for this game yet` is visible;
    - winner `a`, map `Ascent`, game 2, scores 13 and 9, `resultType: 'normal'`: the text contains `Game 2 · Ascent` and `Team a won 13–9`, and the button is enabled;
    - `resultType: 'forfeit'` with null scores: the text contains `won by forfeit`;
    - `lineupTeams: 'winner'`: the button has `aria-pressed="true"`.
- [ ] **Step 2:** Run `pnpm vitest run src/lib/broadcast/selectors.test.ts src/lib/server/broadcast/field-controls.test.ts src/lib/components/admin/graphics/MapWinnerControl.svelte.test.ts`. Expected: FAIL (`gameWinnerTeam` and the component don't exist; `'winner'` is rejected as invalid).
- [ ] **Step 3: Implement.**
  - Widen `lineupTeams` and the schema enum literal.
  - Change the `broadcast.ts` error to `'Choose both teams, team A, team B, or the map winner.'`.
  - Add `gameWinnerTeam` and the `winner` branch to `lineupTeamVisible`.
  - Build `MapWinnerControl`:
    - a `<section aria-label="Map winner">` with an `h3` reading `Map winner`;
    - a flex row containing a `ManagementForm` (`action="/admin/graphics?/controls"`, `recordDraft={false}`, `initial={{ expectedRevision, lineupTeams: 'winner' }}`). Its button copies the pressed and preset classes of the existing lineup buttons and is disabled when `!live.selection || !gameWinnerTeam(live)`;
    - a `<p>` with the result line beside the button.
  - Render it in `GraphicControls` directly **after** the Show/Hide `ManagementForm`, only when `graphic === 'player-lineup'`.
  - In `GraphicPreview`, when `snapshot.liveControls.lineupTeams === 'winner'` and `variant !== 'lineup-both'`, pass the snapshot through unmodified instead of forcing `singleTeam`.
- [ ] **Step 4:** Re-run the tests from Step 2, then `pnpm check`. Expected: PASS with 0 errors. Every `Record<LineupTeams, …>` or switch the compiler flags gets a `winner` arm.
- [ ] **Step 5:** Commit `feat(gfx): add map winner lineup mode with current game result`.

### Task 3: Template shell, assets, fonts and shared test snapshot

**Files:**
- Create:
  - `src/lib/broadcast/templates/predator-roadshow-val/Graphic.svelte`
  - `.../predator-roadshow-val/theme.css`
  - `.../predator-roadshow-val/Header.svelte`
  - `.../predator-roadshow-val/labels.ts`
  - `.../predator-roadshow-val/assets/*` (PNG or WebP exports, plus `fonts/Predator-{Regular,Bold,Black,BlackItalic}.ttf`)
  - `src/lib/broadcast/templates/test-snapshot.ts` (moves `preparedSnapshot()` out of `Pregame.svelte.test.ts`)
  - `src/lib/broadcast/templates/predator-roadshow-val/Graphic.svelte.test.ts`
- Modify: `src/lib/broadcast/templates/test/Pregame.svelte.test.ts`, which imports `preparedSnapshot` from `../test-snapshot`.

**Interfaces:**
- Produces:
  - `Header.svelte` props: `{ title?: string }`. With no `title` it shows the Roadshow lockup; with `title` (e.g. `'WINNER'`, `'MVP'`) it shows a large italic Predator Black title in place of the lockup. The Predator logo (left) and FPT Shop logo (right) are always shown.
  - `Graphic.svelte` dispatches on `graphic` exactly like `beus-graph-test/Graphic.svelte`. For graphics without a component yet it renders a placeholder `<p>`. With no selection it renders a `WAITING FOR MATCH` empty state.
  - `labels.ts` exports `statLabels: Record<StatisticField, { en: string; vi: string }>`:

    | Field | en | vi |
    |-|-|-|
    | kills | `KILLS` | `Hạ gục` |
    | deaths | `DEATHS` | `Chết` |
    | assists | `ASSISTS` | `Hỗ trợ` |
    | performanceScore | `ACS` | `Điểm chiến đấu trung bình` |
    | trades | `TRADES` | `Hạ gục đổi mạng` |
    | firstBloods | `FIRST BLOODS` | `Hạ gục đầu tiên` |
    | plants | `PLANTS` | `Cài Spike` |
    | defuses | `DEFUSES` | `Gỡ Spike` |

    It also exports `vetoLabels = { ban: 'CẤM BẢN ĐỒ', pick: 'CHỌN BẢN ĐỒ', decider: 'BẢN ĐỒ QUYẾT ĐỊNH' }` and `sideLabels = { attack: 'CÔNG', defense: 'THỦ' }`.
  - `theme.css` is imported once from `Graphic.svelte`'s `<script>` (bundled globally by the eager glob). It contains:
    - `@font-face` for family `Predator` at weights 400, 700, 900, and 900 italic;
    - palette custom properties on `[data-template="predator-roadshow-val"]`. Sample exact values from the PSDs; starting points: `--rs-panel: #000`, `--rs-line: #1fe6f0`, `--rs-plate-from: #2ff3f5`, `--rs-plate-to: #00d9b0`, `--rs-ink-dark: #04121a`, `--rs-ink: #fff`, `--rs-label: #2fe0f0`.
  - `test-snapshot.ts` exports `preparedSnapshot(): BroadcastSnapshot`, unchanged from the current body.

Steps:

- [ ] **Step 1: Export the assets.** Use the psd-tools Python at `~/.local/share/uv/tools/psd-tools/bin/python -I`, with a script kept in the scratchpad (not committed). Export these layers, cropped to their bbox, from `design_reference/predatorRoadshow_lol/`:
  - `compare.psd`, group `PLAYER phải`: card frame, grid fill and gradient plate as separate files; plus the centre stat panel frame;
  - `POSTMATCH.psd`, group `post 2`: team header bars and the panel frame;
  - `INGAME/1024 x 126.psd`: scorebar background with the centre lockup, without text layers;
  - `INGAME/PLAYER NAME.psd`: name plate without text;
  - `INGAME/góc L FRAME 286 X 112.png`: copy as-is;
  - `LOGO/*.png`.

  Downscale to the size each graphic uses. Prefer WebP when it's under the PNG size. Copy the four TTFs. Check that the total `assets/` size is under 6 MB.
- [ ] **Step 2: Write the failing test** `Graphic.svelte.test.ts`:
  - `it.each(graphicIds)('renders %s with and without a selection')` mounts `Graphic` with `preparedSnapshot()` and with `{ ...preparedSnapshot(), selection: null }`, and expects no throw. With no selection, the text contains `WAITING FOR MATCH`.
  - `it('resolves stop slugs to this template')`: `resolveGraphicTemplate('predator-roadshow-val-dong-nai').id === 'predator-roadshow-val'`.
- [ ] **Step 3:** Run `pnpm vitest run src/lib/broadcast/templates/`. Expected: FAIL (no module).
- [ ] **Step 4:** Implement the shell, `Header`, `labels.ts`, `theme.css` and the `test-snapshot.ts` move.
- [ ] **Step 5:** Re-run `pnpm vitest run src/lib/broadcast/templates/`. Expected: PASS, including the existing Pregame tests.
- [ ] **Step 6:** Commit `feat(gfx): add predator-roadshow-val template shell, assets and fonts`.

### Task 4: Player Lineup and Map Winner

**Files:** Create `predator-roadshow-val/PlayerLineup.svelte` and `predator-roadshow-val/PlayerCard.svelte` (portrait card: grid, portrait, fade, optional role/agent icon, name plate). Wire both in `Graphic.svelte`. Test: `predator-roadshow-val/Graphic.svelte.test.ts`.

**Interfaces:**
- Consumes: `lineupForTeam` and `lineupTeamVisible` (Task 2), and `gameWinnerTeam`.
- Produces: `PlayerCard` props `{ name: string | null; tag: string | null; portraitPath: string | null; iconPath?: string | null; size?: 'lineup' | 'feature' }`. Tasks 5 and 6 reuse it.

Steps:

- [ ] **Step 1: Tests.**
  - `it('shows the five cards of one team with TAG NAME plates')`, with `lineupTeams: 'team-a'`: one `[data-position]`, five `[data-slot]`, and the text contains `a First A`.
  - `it('shows the map winner under a WINNER title without the Roadshow lockup')`, with `lineupTeams: 'winner'` and `winnerEntryId: 'b'`: the text contains `WINNER` and `First B`; `[data-entry-id="a"]` is absent; `img[alt="Roadshow"]` is absent.
  - `it('shows both teams')`, with `'both'`: two `[data-position]`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Single team or winner follows `reference_img/0_roadshow_Lineup`: five cards across, with the big team logo and name bottom-left.
  - `Both` is two compact rows, left team on top, ordered by presentation.
  - Winner mode uses `<Header title="WINNER" />`. The Predator and FPT Shop logos stay.
  - A missing portrait gets a neutral silhouette fill.
- [ ] **Step 4:** Re-run the tests and the autofixer. Expected: PASS and clean.
- [ ] **Step 5:** Commit `feat(gfx): roadshow lineup and map winner`.

### Task 5: Player Stats (single and head-to-head) and MVP

**Files:** Create `predator-roadshow-val/PlayerStats.svelte`, `predator-roadshow-val/MVP.svelte` and `predator-roadshow-val/StatPanel.svelte`. Wire them in `Graphic.svelte`. Test: the same test file.

**Interfaces:**
- Consumes: `PlayerCard` (Task 4), `statLabels` (Task 3), `playerInScope`, `statisticMetric`, `selectedMvp`, and `controls.playerStats` / `controls.mvpFields`.
- Produces: `StatPanel` props `{ statistics: PlayerStatisticsView | null; fields: StatisticField[]; scope: BroadcastScope; compare?: PlayerStatisticsView | null }`. Without `compare` it renders a two-column grid like `1_roadshow`. With `compare` it renders the three-column table like `2_roadshow` (left value, label, right value).

Steps:

- [ ] **Step 1: Tests.**
  - `it('renders only the selected statistic fields with English and Vietnamese labels')`, with `fields: ['kills','firstBloods']`: exactly two `[data-field]`, and the text contains `KILLS`, `Hạ gục`, `FIRST BLOODS`.
  - `it('renders head-to-head with both players')`: two player names and one `[data-field="kills"]` row with two values.
  - `it('renders MVP with an MVP title')`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Single and MVP: stat panel on the left; agent full-portrait panel in the middle (`fullPortraitPath` of the player's agent in the current game's lineup, or an empty frame); `PlayerCard size="feature"` on the right with the team logo chip.
  - MVP: `<Header title="MVP" />` replaces the lockup.
  - H2H: two cards flanking a centre `StatPanel compare`, with a final `AGENT` row of agent icons.
  - Partial coverage keeps the existing `INCOMPLETE` marker.
- [ ] **Step 4:** Re-run the tests and the autofixer. Expected: PASS and clean.
- [ ] **Step 5:** Commit `feat(gfx): roadshow player stats and MVP`.

### Task 6: Map Veto

**Files:** Create `predator-roadshow-val/MapVeto.svelte` and wire it. Test: the same test file.

**Interfaces:** Consumes `snapshot.veto` (sort by `sequence`), `vetoActor`, `vetoLabels`, and `teamByEntryId`.

Steps:

- [ ] **Step 1: Tests.** `it('lists veto steps in sequence with Vietnamese action labels')`: with the fixture veto (ban seq 1 by b, pick seq 2 by a), the first `[data-sequence]` contains `CẤM BẢN ĐỒ` and tag `b`; the second contains `CHỌN BẢN ĐỒ` and tag `a`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Full-screen graphic with the Header, plus a row of map tiles in roadshow cyan frames.
  - Ban: dimmed map art with a cyan ban mark.
  - Pick: full-colour map art, with the team tag and `CHỌN THỦ`/`CHỌN CÔNG` side choice in the tile corner when `sideChoice` is set.
  - Decider: `BẢN ĐỒ QUYẾT ĐỊNH`.
  - Under each tile: the acting team tag and the action label.
  - Layout ideas from `3_league`, without copying its frame.
- [ ] **Step 4:** Re-run the tests and the autofixer. Expected: PASS and clean.
- [ ] **Step 5:** Commit `feat(gfx): roadshow map veto`.

### Task 7: Agent Select

**Files:** Create `predator-roadshow-val/AgentSelect.svelte` and wire it. Test: the same test file.

**Interfaces:** Consumes `presentationTeams`, `lineupForTeam`, `gameplaySide` and `sideLabels`.

Steps:

- [ ] **Step 1: Tests.** `it('shows five agent slots per team with player names, map and sides')`: ten `[data-slot]`, the text contains `Saved agent`'s player `First A`, the map `Saved map`, and `CÔNG` and `THỦ`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Lower-band overlay (not full-screen), roughly the bottom 230px.
  - Each team block: logo end-cap, five agent `displayIconPath` tiles in cyan frames, and player names under them.
  - Centre: `BẢN ĐỒ` and the map name.
  - Outer ends: side labels from `gameplaySide`.
  - No Header.
- [ ] **Step 4:** Re-run the tests and the autofixer. Expected: PASS and clean.
- [ ] **Step 5:** Commit `feat(gfx): roadshow agent select`.

### Task 8: Post-Game

**Files:** Create `predator-roadshow-val/PostGame.svelte` and wire it. Test: the same test file.

**Interfaces:** Consumes `presentationTeams`, `teamScore`, `lineupForTeam`, `scopes.game.statistics`, `statisticMetric` and `scopes.game.mvpPlayerId`.

Steps:

- [ ] **Step 1: Tests.** `it('shows both teams with score, five player rows and a per-team MVP')`:
  - two `[data-position]`;
  - each has five `[data-slot]`;
  - each `[data-slot]` row shows the agent name, player name, `K/D` and kills;
  - one `[data-team-mvp]` per team. The team MVP is the player with the most kills in that team; ties go to the lowest slot.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Layout from `POSTMATCH.psd` `post 2`: team header bars with logo, name and score on top; map name and `GAME n` in the centre plate; two panels, each with four non-MVP rows plus an MVP card (agent bust, player name, total kills, K/D, first bloods).
  - Pull ideas from `8_league`; don't copy its frame.
  - K/D shows one decimal; `—` when deaths are 0 or there's no statistic.
- [ ] **Step 4:** Re-run the tests and the autofixer. Expected: PASS and clean.
- [ ] **Step 5:** Commit `feat(gfx): roadshow post-game`.

### Task 9: In-Game fallback and live HUD theming

**Files:**
- Create: `predator-roadshow-val/InGame.svelte`, and wire it.
- Modify:
  - `src/lib/broadcast/live/InGameHud.svelte` (style block, from line 130)
  - `src/lib/broadcast/live/PlayerCard.svelte` (style)
  - `src/lib/broadcast/in-game/CenterMatchBanner.svelte` (style)
  - `predator-roadshow-val/theme.css`
- Test:
  - `predator-roadshow-val/Graphic.svelte.test.ts`
  - `src/lib/broadcast/GraphicRenderer.svelte.test.ts`

**Interfaces:**
- Produces, as custom properties read by the shared components, each defaulting to today's literal via `var(--hud-x, <current value>)`:
  - `--hud-font`, `--hud-font-display`
  - `--hud-panel`, `--hud-panel-strong`
  - `--hud-ink`, `--hud-muted`
  - `--hud-attack`, `--hud-defense`, `--hud-neutral`
  - `--hud-accent`
  - `--hud-banner-bg`, `--hud-banner-ink`

  Replace every hard-coded colour and font literal in those three style blocks. Keep the inline `style:--live-side` logic, but source its colours from `var(--hud-attack)` / `var(--hud-defense)` / `var(--hud-neutral)`.

Steps:

- [ ] **Step 1: Tests.** In `GraphicRenderer.svelte.test.ts`, `it('themes the live HUD only for the roadshow template')`:
  - render `mode="preview-live"`, `graphic="in-game"` with tournament slug `predator-roadshow-val-dong-nai`: `getComputedStyle` on the HUD root gives a `font-family` that includes `Predator`;
  - the same with slug `other`: the `font-family` does not include `Predator`, and the HUD background colour matches today's `#10151de0` (assert `rgb`/`rgba(16, 21, 29` prefix).
- [ ] **Step 2:** Run `pnpm vitest run src/lib/broadcast/GraphicRenderer.svelte.test.ts`. Expected: FAIL on the Predator assertion.
- [ ] **Step 3: Implement.**
  - The variable conversion in the three components, with no markup or logic changes.
  - In `theme.css` under `[data-template="predator-roadshow-val"]`: set the variables to the roadshow palette, and add overrides for the scorebar (the `1024 x 126` export as a background), the player-card name plates (the `PLAYER NAME` plate), and the banner frame (cyan top strip, dark body, as in `5.3`). Sides use the existing attack/defense convention.
  - Template `InGame.svelte`: the no-live-data scorebar from the `1024 x 126` art, with team names, scores and `GAME n`. Keep the current `beus-graph-test/InGame.svelte` data elements.
- [ ] **Step 4:** Run the tests, `pnpm vitest run src/lib/broadcast/`, and the autofixer on the three shared components. Expected: PASS. The existing `PlayerCard`, `CenterMatchBanner` and `InGameHud` tests are unchanged and passing.
- [ ] **Step 5:** Commit `feat(gfx): theme the live HUD for the roadshow template`.

### Task 10: Visual verification and operator docs

**Files:**
- Create: `tests/roadshow-visuals.e2e.ts`
- Modify: `docs/BROADCAST-OPERATIONS.md`

**Interfaces:** Consumes `prepareTournament`, `createMatch`, `createGame` and the DB seeding pattern from `tests/phase5.1-visuals.e2e.ts`. Set the slug with `UPDATE tournaments SET slug = 'predator-roadshow-val-e2e' WHERE id = ?`. Name players `Robo Trái Cây-1…5` / `9G CHARLINGTON-1…5`-style long names with diacritics.

Steps:

- [ ] **Step 1: Write the test** `test('Roadshow template renders every graphic inside the canvas')`. For each `graphicId`, plus lineup `winner` and player-stats `head-to-head`:
  - open `/gfx/live/<graphic>` after Show;
  - expect `[data-template="predator-roadshow-val"]`;
  - expect that no element matching `[data-template] :is(strong, span, p, h1, h2, small)` has `scrollWidth > clientWidth + 1` unless it has `text-overflow: ellipsis`;
  - save a screenshot to `test-results/roadshow/<name>.png`.
- [ ] **Step 2:** Run `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test tests/roadshow-visuals.e2e.ts`. Expected: PASS. Fix any overflow it reports in the owning component.
- [ ] **Step 3: Eye check.** Composite each screenshot over the first frame of `MAIN.mp4`. Use `ffmpeg -i "…/MAIN.mp4" -frames:v 1 bg.png`, then `magick bg.png shot.png -composite out.png` in the scratchpad. Compare against `reference_img/0`, `1`, `2` and `POSTMATCH.psd`. Record the fixes made.
- [ ] **Step 4: Docs.** Add a "Predator Roadshow VALORANT" section to `docs/BROADCAST-OPERATIONS.md`:
  - slugs must start with `predator-roadshow-val-`;
  - run `MAIN.mp4` as an OBS layer below full-screen graphics (pages are transparent);
  - Map Winner is on the Lineup page: press Map winner, check the result line, then Show Lineup.
- [ ] **Step 5:** Run `pnpm check`, then `pnpm build`, then `pnpm test:unit -- --run`, one after another. Expected: all pass.
- [ ] **Step 6:** Commit `test(gfx): verify roadshow graphics render inside the canvas; document operation`.
