# Phase 5 Broadcast Controls and Test Graphics Implementation Plan

> **For agentic workers:** Implement this plan using the repository's existing SvelteKit page/action -> domain service -> Drizzle/libSQL architecture. Preserve Phase 1-4 domain ownership and do not create graphics-only copies of match, lineup, veto, statistics, or MVP data.

**Goal:** Establish one shared broadcast-control state, read-only OBS outputs, SSE distribution, and seven functional 1920×1080 test graphics that work from saved/manual data before live providers or final design-team artwork.

**Architecture:** Keep the database as the source of prepared competition data. Add a small persisted broadcast-control layer for on-air selection and presentation overrides. Build server-owned read models/snapshots for graphics instead of exposing raw Drizzle rows. Controllers mutate explicit broadcast/control state; OBS pages are read-only consumers. Phase 6 later merges normalized live-provider state into the same presentation boundary.

**Spec:** `docs/TECH-SPEC.md`, especially sections 3, 4.3-4.4, 5, and 6. The Team A/B prerequisite is tracked separately in [2026-10-01-team-a-b-veto-order-correction.md](./2026-10-01-team-a-b-veto-order-correction.md).

**Status:** Tasks 0–8 implemented and reviewed; Task 9 automated browser/production verification completed on 2026-10-01. Actual OBS/Valorant composition remains pending, so full Phase 5 acceptance and broadcast readiness are not yet claimed. See [verification evidence and screenshots](./2026-10-01-phase-5-verification.md). Final tournament artwork remains Phase 8; authentication is explicitly deferred to trusted-LAN operation.

| Tasks                                                                    | Status                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------ |
| 0–3: Team A/B, persisted control, controller, typed snapshot/SSE library | Complete and tested                                    |
| 4–5: Stable routes/templates and presentation primitives                 | Complete and tested                                    |
| 6–8: All seven saved/manual generic outputs                              | Complete and tested                                    |
| 9: Browser journeys, production Node, screenshots and operator guidance  | Automated verification complete                        |
| 9: Actual OBS/Valorant and target LAN rehearsal                          | Pending; separate checklist in the verification report |

---

## Approved Phase 5 decisions

- Canvas: transparent **1920×1080**.
- Test graphics are functional/conceptual; they do not need final sponsor zones or final tournament artwork.
- English-only labels are sufficient for Phase 5.
- Seven graphics:
  1. Player Lineup
  2. Player Stats
  3. Map Veto
  4. Agent Select
  5. In-Game
  6. Post-Game
  7. MVP
- Player Stats uses one shared system with:
  - **Single / Player to Watch**
  - **Head-to-Head**
- In-Game implementation is **native-HUD-safe first**.
- Match **Team A / Team B** is competition order:
  - Team A starts the standard map veto sequence.
  - Team B is the other competition-order slot; grand-final upper-bracket bans may start with either A or B.
  - Saved veto actors and order remain operator-editable.
- Broadcast **left/right** is presentation order:
  - default A-left / B-right
  - explicit presentation-only Swap Left/Right is allowed.
- Gameplay side is independent:
  - **Attacker = blue**
  - **Defender = red**
  - side changes change colors, not screen positions.
- Sponsor import/display is not a Phase 5 generic requirement. Tournament templates may add sponsor placement later.

---

## Global constraints

- Do not duplicate saved lineups, vetoes, game results, statistics, MVPs, teams, players, or map resources into graphics-specific domain tables.
- Ordinary management browsing must never change what is on air.
- Partial Tournament -> Match -> Game selector changes must not switch the live game.
- OBS URLs remain stable when the live game changes.
- OBS outputs are read-only and must not receive provider credentials or mutation controls.
- Unknown/missing prepared data renders gracefully; do not invent players, agents, statistics, maps, or results.
- Phase 5 must work without ValoSpectra, GStack, HenrikDev, or another match-data provider.
- Detailed provider/live telemetry belongs to Phase 6.
- Post-game network import belongs to Phase 7.
- Final supplied visual identity belongs to Phase 8.
- Do not make Match Team A/B, broadcast left/right, and Attacker/Defender aliases of one another.

---

## Task 0 — Correct Team A / Team B veto semantics

Complete [the dedicated correction](./2026-10-01-team-a-b-veto-order-correction.md) before accepting the Map Veto control/output.

Required result:

- Team A is visibly the standard map veto sequence opener;
- BO1, BO3, BO5, and BO5 grand-final presets fill editable veto drafts while saved actors remain authoritative;
- Match UI offers a clear A/B correction path before dependent data locks identity;
- later veto actors remain flexible;
- presentation left/right never changes Match A/B.

Do not hide this requirement inside graphics code.

Management/domain implementation updated 2026-10-01 for editable veto presets, including upper-bracket Team B opening bans. The broadcast left/right isolation check remains with Tasks 1–2, when the presentation override exists.

---

## Task 1 — Add persisted shared broadcast state

Add a small server-owned persisted broadcast aggregate.

Minimum state:

- selected game ID, nullable before an operator selects a game;
- revision/version for stale-write protection;
- presentation left/right swap;
- manual current-side override needed for native/custom HUD testing, nullable when the selected game's prepared starting side should be used;
- timestamps.

Derive selected match/tournament from the game relationship. Do not persist a separately editable tournament/match/game triple that can disagree.

Keep per-graphic controls small and typed. Persist only controls that need to survive reload/reconnect, such as:

- graphic visible/hidden state;
- Player Stats mode/scope/player selection(s);
- MVP scope;
- similarly essential output choices.

Do not create a generic arbitrary styling/settings database.

### Required service behavior

- transaction + control-revision checked update; prepared-data invalidation uses a separate data revision so ordinary domain edits do not stale control drafts;
- selecting a valid game changes the shared broadcast selection;
- changing only the parent dropdown draft does not;
- selecting another game resets or validates game-specific temporary controls;
- presentation swap changes only presentation state;
- current-side override must reference one of the selected match participants;
- stale operator writes are rejected.

---

## Task 2 — Build the shared Graphics Controller

Create a dedicated graphics workspace, expected under `/admin/graphics` or an equivalent stable management route.

The top-level controller contains:

- Tournament -> Match -> Game selector;
- current on-air tournament/match/game summary;
- connection/snapshot status;
- current revision;
- **Swap Left/Right** presentation control;
- current-side manual test control;
- tabs/sections for all seven graphics.

Where practical, reuse or embed the same domain editors already used by Tournament/Match/Game management:

- Lineup -> existing saved lineup;
- Map Veto -> parent match veto;
- Agent Select -> saved game agent assignments;
- Post-Game -> saved Phase 4 statistics;
- MVP -> saved operator MVP.

The Graphics Controller can be the faster operational entry point, but it must not become a second source of truth.

---

## Task 3 — Define broadcast snapshots, the shared broadcast library, and SSE distribution

Add a server-owned broadcast read model and snapshot publisher **plus one reusable typed broadcast library that every graphics implementation imports**.

The seven Phase 5 outputs must not each open and manage their own ad-hoc `EventSource`, parse their own payload shape, or implement their own revision/reconnect logic. Future tournament-specific templates in Phase 8 must be able to consume the same library without copying the test-template transport code.

Keep server-only publication code separate from browser-safe client code. A suitable internal shape is:

```text
src/lib/broadcast/
├─ types.ts          # graphics-safe snapshot/control types
├─ client.ts         # shared SSE client, reconnect, revision ordering
├─ selectors.ts      # framework-neutral snapshot/read helpers
└─ store.svelte.ts   # optional Svelte reactive wrapper

src/lib/server/broadcast/
├─ snapshot.ts       # canonical snapshot builder
└─ publisher.ts      # server-owned current snapshot + SSE publication
```

Exact filenames may change, but the architectural boundary may not: **one importable broadcast client API for all current and future graphics**.

The snapshot should expose only graphics-safe, explicit fields, for example:

- selection identity + revision;
- tournament display identity/slug;
- Match Team A/B identities;
- presentation left/right identities after override;
- current attacker/defender identity after prepared/manual state resolution;
- team branding;
- selected game's map/result/lineups/agents;
- match veto read model;
- Phase 4 statistics/MVP read models;
- per-graphic control state/visibility;
- connection/readiness metadata needed by controllers/outputs.

Do not serialize database rows wholesale.

### Shared library behavior

The browser-side library owns:

- opening/closing the SSE connection;
- connection/reconnection state exposed to graphics and controllers;
- decoding/validating the shared snapshot envelope;
- retaining the newest accepted snapshot;
- ordering SSE snapshots by a transport cursor (process epoch + sequence), independent of persisted control/data revisions;
- ignoring duplicate or older events from the same stream epoch;
- resynchronizing from a complete snapshot after reconnect;
- a small typed API/store that graphics import rather than touching raw SSE events;
- framework-neutral selectors/helpers where possible so test templates and later custom templates share data interpretation.

A graphic should be able to do the conceptual equivalent of:

```ts
import { createBroadcastClient } from '$lib/broadcast/client';
```

and then consume typed broadcast state. It should not need to know the SSE wire protocol.

### SSE behavior

- one shared server-owned publication path;
- new/reconnecting client receives the latest complete snapshot immediately;
- subsequent control or prepared-data mutations publish a new ordered stream event; later provider telemetry may do the same without mutating control revision;
- clients ignore older revisions through the shared library;
- browser reconnect is separate from Phase 6 provider reconnect;
- multiple OBS pages may each consume the app-level SSE stream, but must not create multiple upstream provider connections later;
- transport errors must not cause each graphic to invent its own retry/backoff implementation.

Use SSE for app -> browser updates; ordinary protected HTTP actions remain the mutation path.

---

## Task 4 — Add stable live routes and template resolution

Provide stable read-only OBS routes for the seven graphics, for example:

- `/gfx/live/lineup`
- `/gfx/live/player-stats`
- `/gfx/live/map-veto`
- `/gfx/live/agent-select`
- `/gfx/live/in-game`
- `/gfx/live/post-game`
- `/gfx/live/mvp`

Exact spelling may change, but URLs must not include the currently selected game.

For each output:

1. import and consume the shared broadcast client/library from Task 3;
2. receive the typed shared broadcast snapshot through that API;
3. derive the selected tournament slug;
4. resolve a matching tournament-specific template if it exists;
5. fall back to the generic functional `test` template.

Neither generic nor tournament-specific templates should create their own raw `EventSource` implementation.

Correct the existing graphics production options so client rendering works in a production build; the current `csr = dev` scaffold cannot remain.

All test outputs use a transparent 1920×1080 canvas.

---

## Task 5 — Add shared presentation primitives

Create reusable presentation/read-model helpers rather than repeating domain interpretation in seven templates.

At minimum model:

### Competition identity

- Team A
- Team B
- saved veto actor
- stable scores/results/lineup ownership

### Presentation identity

- left team
- right team
- default A-left/B-right
- explicit swapped state

### Gameplay side

- attacker team
- defender team
- blue/red presentation

Never infer one axis by mutating another.

Example:

```text
Prepared start:
LEFT  Team A — Attacker — BLUE
RIGHT Team B — Defender — RED

After gameplay side swap:
LEFT  Team A — Defender — RED
RIGHT Team B — Attacker — BLUE

Presentation override:
LEFT  Team B
RIGHT Team A
```

The final case changes no competition-domain identity.

Reusable visual/data components should cover practical items such as:

- team identity/logo/name;
- player identity/portrait;
- agent card;
- map card;
- stat row/value with unavailable state;
- score/result header;
- side color treatment;
- simple show/hide transition;
- missing-asset placeholder.

Keep final tournament visual styling outside these data semantics.

---

## Task 6 — Build Lineup, Map Veto, and Agent Select test graphics

### Player Lineup

Full-screen 5v5 concept layout using:

- presentation left/right teams;
- ordered saved five-player lineups;
- player names/portraits;
- team names/logos;
- placeholders for incomplete preparation.

Do not recolor/reorder teams based on Attacker/Defender.

### Map Veto

Full-screen veto sequence using:

- Match Team A/B competition identity;
- saved ordered bans/picks/decider;
- saved acting team;
- map images;
- game number/side choice where prepared.

Do not infer veto actor from graphics left/right or the standard preset. The graphic renders saved actors and order.

### Agent Select

5v5 composition using:

- presentation left/right;
- saved player -> agent assignments;
- map;
- prepared starting sides;
- Attacker blue / Defender red.

Manual saved agents are sufficient in Phase 5. Phase 6 may later supply provider observations through the same read model.

---

## Task 7 — Build Post-Game, Player Stats, and MVP test graphics

### Post-Game

Render:

- map/result;
- team scores;
- both five-player rows;
- Phase 4 manual statistics;
- operator MVP highlight where useful.

Initial fields are:

- K/D/A;
- Performance Score;
- Trades;
- First Bloods;
- Plants;
- Defuses;
- Agent.

Keep NULL visibly unavailable and explicit zero visible as zero. Do not relabel Performance Score as ACS.

### Player Stats

One control/output pair with two modes.

**Single / Player to Watch**

- one selected player;
- selected game/match/tournament scope;
- portrait/team/agent when available;
- appropriate supported statistics.

**Head-to-Head**

- two operator-selected players;
- same scope rules;
- side-by-side values;
- unavailable/partial coverage remains explicit.

Do not create a new rating algorithm or automatically choose a "better" player.

### MVP

Render the already saved operator-selected MVP for:

- game;
- match;
- tournament.

The graphic may show relevant saved statistics, but must never compute, recommend, or replace the MVP selection.

---

## Task 8 — Build the native-HUD-first In-Game test graphic

The first Phase 5 In-Game output assumes the full Valorant native spectator HUD may be visible.

Treat these as protected/native areas unless actual rehearsal proves otherwise:

- top-left minimap;
- top-center timer/score;
- top-right killfeed;
- lower player/health/ability/weapon/economy areas.

The test overlay should therefore be conservative and focus on safe supplementary context, such as:

- team/tournament branding;
- series/map context;
- optional round-history/context area only where it does not cover native HUD;
- presentation-order and side-color proof.

Do **not** reconstruct Phase 6 live values manually in Phase 5:

- health/armor;
- weapon/ammo;
- live economy;
- ability charges;
- alive state;
- live K/D/A;
- killfeed;
- minimap;
- round timer.

Provide a manual current-side test control so Attacker/Defender color behavior can be verified without a provider. Phase 6 may replace that input with normalized live provider state.

The later custom HUD may keep only selected native elements such as timer, killfeed, and skills. That is an extension of the same presentation model, not a new competition model.

---

## Task 9 — Browser, production, and OBS verification

### Browser journey A — shared selection

1. Open two controller sessions and multiple output pages.
2. Select Tournament -> Match -> Game.
3. Verify all outputs update without URL replacement.
4. Change only parent selector drafts and verify the old game remains on air.
5. Commit another game and verify a single newer snapshot reaches all outputs.
6. Attempt stale selection save from the second operator and reject it.

### Browser journey B — identity axes

1. Prepare Team A and Team B.
2. Verify Team A is the standard preset's first actor; also verify a grand-final upper-bracket Team B double-ban and a manually edited order.
3. Render A-left/B-right.
4. Toggle Swap Left/Right.
5. Verify the screen swaps but Match A/B, veto actors, scores, and lineups do not.
6. Toggle current gameplay side.
7. Verify colors switch blue/red but screen positions remain fixed.

### Browser journey C — incomplete preparation

Verify all seven outputs handle:

- missing portrait/logo;
- incomplete lineup;
- missing agent;
- partial post-game values;
- no MVP;
- incomplete veto;
- no selected live game.

No output should crash or invent data.

### Browser journey D — Player Stats

- Single mode with one player.
- Head-to-Head with two players.
- game/match/tournament scopes;
- substitutions/partial coverage;
- Performance Score unavailable outside supported scope.

### Production proof

- `pnpm check`
- focused server/client tests;
- focused Playwright Phase 5 tests;
- lint/format changed files;
- `pnpm build`;
- run built Node app and verify outputs;
- unknown tournament template slug falls back to test template.

### OBS proof

Record a separate real OBS check for:

- transparent 1920×1080 browser source;
- stable URLs;
- alpha;
- scaling/clipping;
- native Valorant HUD safe areas;
- left/right swap;
- attacker/defender color swap;
- reconnect after app/browser-source refresh.

Browser screenshots alone do not prove OBS composition.

---

## Phase 5 done when

- Team A/B veto-order correction is complete and tested.
- A single persisted selected game drives all controllers and outputs.
- Partial selector navigation does not switch the live game.
- SSE reconnect returns the newest complete snapshot through one shared typed broadcast library.
- All seven generic outputs use that library rather than separate transport implementations, and the API is reusable by future tournament-specific templates.
- Seven stable read-only OBS routes render generic test templates.
- Player Stats supports Single and Head-to-Head from one control/read model.
- A-left/B-right is the default presentation and explicit Swap Left/Right does not mutate competition data.
- Attacker is blue and Defender is red; side changes recolor without moving teams.
- Native-HUD-safe In-Game mode works without a provider.
- Saved/manual Phase 3-4 data drives all applicable graphics.
- Missing/incomplete preparation renders safely.
- Production rendering no longer depends on `dev`.
- Multi-controller stale writes and multi-output reconnects are proven.
- Actual OBS composition has been checked separately.

Phase 6 can then add provider-backed live data without redefining Team A/B, left/right presentation, or saved management ownership.
