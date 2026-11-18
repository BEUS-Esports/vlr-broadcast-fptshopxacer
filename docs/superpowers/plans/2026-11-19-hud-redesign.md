# HUD Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared fallback and provider in-game HUD layouts to the Uni Tour 2024 and league/Spectra references, themed per event only via `--hud-*`.

**Architecture:** The HUD stays shared. `templates/test/InGame.svelte` becomes the Uni Tour fallback HUD (all templates keep importing it). `live/InGameHud.svelte` stops embedding it and draws its own clean-mode top bar, map strip, cards and buy-phase round history. Roadshow `theme.css` drops its HUD layout overrides and keeps only tokens + art.

**Tech Stack:** Svelte 5 (runes), SvelteKit, vitest-browser-svelte, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-19-hud-redesign-design.md`

## Global Constraints

- Canvas 1920×1080, transparent, `pointer-events: none`.
- Colours/fonts only through `--hud-*` vars with neutral defaults (existing defaults: panel `#10151df2`, attack `#248bff`, defense `#ff4655`, ink `#f7f4eb`).
- Keep test/output hooks: `data-live-hud`, `data-identity`, `data-provider-generation`, `.team-rail[data-position][data-side][data-entry-id]`, `[data-win-dots]`, `[data-sponsor-safe-area]`, `[data-sponsor-loop]`, `[data-attribution-safe-area]`, `.match-bug`, `.round-context`, `.score[data-position]`, `[data-health]`, `.credits`, `.kda`, `.ultimate`, `.ability`, `[data-ability-dot]`, `[data-ability-charges]`, `[data-winner-position]`, `[data-player-id]`, `article` ×10.
- Sponsor loop in provider HUD: shown only when `status?.provider !== 'spectra' || status.attribution === 'supporter'`.
- Missing data renders blank in the provider HUD (empty HUD `textContent.trim() === ''`).
- Long names never ellipsize (`text-overflow: clip`, `-webkit-line-clamp: none`).
- Reserved (nothing drawn): fallback game strip x 400–1520 y 28–90; provider timer x 890–1030 y 0–72; minimap x 0–420 y 30–470; kill feed x 1440–1910 y 90–140; spectated-player bar x 470–1390 y 940–1080; future camera box x 480–780 y 750–920.
- Out of scope: `CenterMatchBanner`, `beus-graph-test/InGame.svelte`, server/snapshot changes.
- Run `svelte-autofixer` (Svelte MCP) on every changed `.svelte` file until clean.

## Review Focus

1. Very long team/player/map names — must stay inside their boxes, no ellipsis, never into reserved areas. (Task 3 bounds test; Task 1 provider bounds test.)
2. Best-of 1 and best-of 5 matches — `BEST OF 1`, `MAP 1/1`; win dots count `floor(bestOf/2)+1`. (Task 3 test.)
3. Overtime — 30+ rounds of history must fit the strip width (≤ 1100px) without overflow. (Task 1 test.)
4. All five players on a side dead — cards keep their slot positions; no layout jump. (Task 2 test.)
5. Provider identity with no local match (unmapped teams) — names come from provider, no win dots, no map strip if no current game. (Existing GraphicRenderer test + Task 1 assertion.)

---

### Task 1: Provider HUD top bar, map strip, buy-phase history

**Files:**

- Modify: `src/lib/broadcast/selectors.ts` (add `mapStrip`)
- Modify: `src/lib/broadcast/live/InGameHud.svelte`
- Test: `src/lib/broadcast/selectors.test.ts`, `src/lib/broadcast/GraphicRenderer.svelte.test.ts`

**Interfaces:**

- Produces: `mapStrip(snapshot: BroadcastSnapshot): Array<{ gameNumber: number; name: string; state: 'past' | 'current' | 'next' }>` — veto steps with `action !== 'ban'` and `gameNumber !== null`, sorted by `gameNumber`, keeping only `gameNumber <= game.number + 1`; `[]` when `snapshot.game` is null.
- Produces: `InGameHud` no longer imports `templates/test/InGame.svelte` (Task 3 relies on this to delete props).

- [ ] **Step 1: Write failing selector tests** in `selectors.test.ts`:
  - `it('lists played, current and next picked maps for the strip')`: veto = ban(Ascent), pick g1 Bind, pick g2 Haven, decider g3 Lotus; `game.number = 2` → `[{1,'Bind','past'},{2,'Haven','current'},{3,'Lotus','next'}]`.
  - same veto, `game.number = 1` → length 2, last is `{2,'Haven','next'}`.
  - `game = null` → `[]`.
- [ ] **Step 2:** `pnpm vitest run src/lib/broadcast/selectors.test.ts` → FAIL (`mapStrip` not exported).
- [ ] **Step 3:** Implement `mapStrip` in `selectors.ts`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5: Write failing HUD tests** in `GraphicRenderer.svelte.test.ts`:
  - Update `'renders a provider template without game preparation or healthy status'`: set `state.phase = 'buy'` before rendering (history is now buy-phase only); keep every existing assertion.
  - `it('shows round history only in buy phase')`: same setup with `phase: 'combat'` → `querySelector('[aria-label="Round history"]')` is null; rerender with `phase: 'buy'` → not null.
  - `it('fits overtime round history inside the strip')`: 30 rounds, `phase: 'buy'` → history `getBoundingClientRect().width <= 1100` and `scrollWidth <= clientWidth`.
  - `it('labels current and next maps in the provider HUD')`: local identity, prepared snapshot with the Step 1 veto and `game.number = 1` → `[data-map-strip]` text contains `CURRENT: BIND` and `NEXT: HAVEN` (case-insensitive match).
  - `it('keeps the provider top bar clear of the game timer')`: render with long names (`'Long saved identity '.repeat(20)`) → every `.team-rail`, `.score`, `.round-context`, `[data-map-strip]` box does not intersect `{left: 890, top: 0, right: 1030, bottom: 72}` except `.round-context`, which may only sit within y 0–24.
- [ ] **Step 6:** `pnpm vitest run src/lib/broadcast/GraphicRenderer.svelte.test.ts` → new tests FAIL.
- [ ] **Step 7: Rewrite `InGameHud.svelte` markup/styles** per spec §2 (top bar x 640–1280 y 0–80 around the timer; left logo/tag/score at ≈x 660/720/800 mirrored right; `ROUND n` at the timer's top edge in `.round-context` with `--hud-panel` background; spike state inside `.round-context`; `[data-win-dots]` under each score only when `identity === 'local'`; `[data-map-strip]` top-left x 0–620 y 0–22 from `mapStrip(snapshot)`; sponsor loop top-right x 1690–1900 y 0–90 inside `[data-sponsor-safe-area]` using `in-game/SponsorLoop.svelte`; player rails left x 15–328 / right x 1592–1905, first card y 548, card ≈100px, gap 6px; round history centred y 90–150 only when `live?.phase === 'buy'`). The two top-bar halves are `.team-rail[data-position][data-side]` with the name in a `strong`. Team logo only for local identity (`team.logoWhitePath ?? logoPath ?? logoBlackPath`) via `primitives/Asset.svelte` with `blankMissing`.
- [ ] **Step 8:** Same command → all PASS (including `'shows the entire live HUD template immediately…'` and `'hides the sponsor loop…'`).
- [ ] **Step 9: Commit** — `git commit -m "feat(hud): clean-mode provider top bar, map strip, buy-phase history"`

### Task 2: League-style player card

**Files:**

- Modify: `src/lib/broadcast/live/PlayerCard.svelte`
- Test: `src/lib/broadcast/live/PlayerCard.svelte.test.ts`

**Interfaces:**

- Consumes: unchanged props `{ saved, live, resources }`. Card height ≈100px, width fills the rail (Task 1).
- Produces: `article` keeps `class:dead`, `class:observed`, all hooks in Global Constraints. A `data-mirrored` attribute is not added — mirroring is done by Task 1's rail CSS (`[data-position='right'] article { direction / flex-direction }`).

- [ ] **Step 1: Write failing tests:**
  - `it('shows name, credits and K/D/A but no health on a dead card')`: `live = livePlayerFixture({ alive: false, health: 0, credits: 1500, kills: 3, deaths: 2, assists: 1 })` → `[data-health]` null, `.health-track` null, `.kda` text `3/2/1`, `.credits` contains `1,500`, text does not contain `DEAD`.
  - `it('hides K/D/A while alive')`: `alive: true` with kills set → `.kda` null.
  - `it('keeps card height when dead')`: render alive then rerender dead → `article.getBoundingClientRect().height` equal both times.
  - Update `'leaves missing player fields blank…'`: the fixture there is not dead (`alive` default) → change its `.kda` assertion to set `alive: false` in that rerender, or move the `0//2` check into the dead test; keep the other assertions.
- [ ] **Step 2:** `pnpm vitest run src/lib/broadcast/live/PlayerCard.svelte.test.ts` → FAIL.
- [ ] **Step 3: Restructure markup + styles** per spec §2 card: row 1 = agent portrait (overhang top-outer corner), name, spike marker, shield (`data-shield-kind`), HP (`[data-health]` text stays `{n} HP`); health bar in `--live-side`; row 2 = ult (outer edge), three abilities with pips, weapon, credits. `.kda` renders only when `live?.alive === false`; health bar and `[data-health]` hidden when dead; remove the `DEAD` text label (dim via `.dead { opacity: .55 }` style).
- [ ] **Step 4:** Same command → PASS; also `pnpm vitest run src/lib/broadcast/GraphicRenderer.svelte.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(hud): league-style live player card"`

### Task 3: Uni Tour fallback HUD

**Files:**

- Modify: `src/lib/broadcast/templates/test/InGame.svelte`
- Test: `src/lib/broadcast/templates/test/Pregame.svelte.test.ts`, `src/lib/broadcast/templates/predator-roadshow-val/Graphic.svelte.test.ts`

**Interfaces:**

- Consumes: Task 1 (no more `InGameHud` import). Props become `{ snapshot: BroadcastSnapshot; showSponsor?: boolean }`; delete `teamPresentation`, `blankMissing`, `mapName` and their branches.
- Produces: element `.event-logo` with `background-image: var(--hud-event-logo, none)` (Task 4 sets it).

- [ ] **Step 1: Update/write failing tests** in `Pregame.svelte.test.ts`:
  - `'bounds native team rails and match context…'`: replace `protectedAreas` with `{400,28,1520,90}` (game strip + timer), `{1440,90,1920,420}` (kill feed/weapons), `{530,680,1920,1080}` (ability bar), `{0,790,300,878}` (spectated portrait); add `.event-logo` to the checked regions.
  - `'renders prepared fallback…'`: replace `toContain('Game 1')` with `toContain(\`${snapshot.match!.label} - MAP 1/${snapshot.match!.bestOf}\`)`; keep `Saved map`, `Team unavailable`, `MAP TBD`, side assertions.
  - `it('labels best-of and map count for Bo1 and Bo5')`: `bestOf: 1` → text has `BEST OF 1` and `MAP 1/1`, `[data-win-dots] span` count 1 per team; `bestOf: 5`, `game.number: 3` → `BEST OF 5`, `MAP 3/5`, 3 dots per team.
  - Keep `'renders current in-game sides…'` unchanged (team-rail `border-bottom-color` = side colour).
- [ ] **Step 2:** `pnpm vitest run src/lib/broadcast/templates/test src/lib/broadcast/templates/predator-roadshow-val` → FAIL.
- [ ] **Step 3: Rewrite `InGame.svelte`** per spec §1: top frame x 320–1604 y 0–72 with a transparent window over x 400–1520 y 28–90; `.team-rail` per side holds logo at the frame end and name in the top row (y 0–28), with `[data-win-dots]` beside the name (series score stays outside the game strip — deliberate deviation from "beside the timer" to keep the window clear); centre `BEST OF {match.bestOf}` (omit when `match` null); `.match-bug` box x 28–520 y 880–1072: tab `{match?.label ?? 'MATCH'} - MAP {game?.number ?? '—'}/{match?.bestOf ?? '—'}`, body `.event-logo` │ map name (`game.map.displayName ?? 'MAP TBD'`); sponsor slot top-right unchanged; empty state unchanged.
- [ ] **Step 4:** Same command → PASS. Then `pnpm check` → 0 errors (catches leftover prop uses).
- [ ] **Step 5: Commit** — `git commit -m "feat(hud): Uni Tour fallback in-game HUD"`

### Task 4: Roadshow theme cleanup + event logo

**Files:**

- Modify: `src/lib/broadcast/templates/predator-roadshow-val/theme.css`
- Test: `src/lib/broadcast/GraphicRenderer.svelte.test.ts`, `src/lib/broadcast/templates/predator-roadshow-val/Graphic.svelte.test.ts`

**Interfaces:**

- Consumes: `.event-logo` (Task 3); markup hooks from Tasks 1–3.

- [ ] **Step 1: Write failing test** in roadshow `Graphic.svelte.test.ts`: `it('shows the roadshow event logo in the in-game map box')` → render `Graphic` in-game inside an element with `data-template="predator-roadshow-val"`, `getComputedStyle(.event-logo).backgroundImage` contains `logo-roadshow`.
- [ ] **Step 2:** `pnpm vitest run src/lib/broadcast/templates/predator-roadshow-val` → FAIL.
- [ ] **Step 3:** In `theme.css` keep the `--hud-*` token block and the `.match-banner` (CenterMatchBanner) rules; delete every `[aria-label='In-Game']` and `[data-live-hud]` layout override (scorebar.webp strip, team-rail geometry, win-dots, center-mark, score, round-context, match-bug); keep the no-ellipsis rule but retarget it to the new name selectors; add `--hud-event-logo: url('./assets/logo-roadshow.webp');` to the token block. Delete `assets/scorebar*.webp` only if no other file references them (`grep -r scorebar src`).
- [ ] **Step 4:** `pnpm vitest run src/lib/broadcast` → PASS (incl. `'themes the live HUD only for the roadshow template'`).
- [ ] **Step 5: Commit** — `git commit -m "style(roadshow): theme-only HUD overrides, event logo token"`

### Task 5: Visual verification

**Files:**

- Modify: `tests/phase6-live.e2e.ts` only if its HUD screenshot path breaks.

- [ ] **Step 1:** `pnpm vitest run && pnpm check && pnpm lint` → all pass.
- [ ] **Step 2:** `pnpm exec playwright test tests/phase6-live.e2e.ts tests/sponsors.e2e.ts` → PASS.
- [ ] **Step 3:** Run the app (`run` skill), open `/gfx/live/in-game` for a roadshow tournament in fallback mode; with Playwright MCP set `document.body.style.background = "url(/path) 0 0/1920px 1080px"` using `design_reference/ingame_images/dirty/chaoTanHCMUS1.png` (serve via the dev server or a data URI) and screenshot at 1920×1080. Repeat for the live-preview provider HUD over `design_reference/ingame_images/clean/bg3.webp`. Pass = no HUD element covers the game strip/timer, minimap, kill feed, spectated bar, or camera-box area. Save both screenshots to `docs/phase-6.1-screenshots/hud-redesign-fallback.png` and `hud-redesign-provider.png`.
- [ ] **Step 4: Commit** — `git commit -m "docs: HUD redesign screenshots"`
