# Phase 4 Manual Statistics Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the repository's existing SvelteKit page/action -> domain service -> Drizzle/libSQL architecture. Preserve unrelated working-tree changes and the established Phase 1-3 conventions. Use checkbox items as execution tracking; this document does not select an agent execution mode.

**Goal:** Make manual per-game player statistics, corrections, game/series/tournament statistical scopes, and operator-selected MVPs fully usable without any live or post-game provider. Establish the canonical persisted statistics model that later HenrikDev and ValoSpectra imports will write into without creating a second provider-specific data model.

**Architecture:** Statistics extend the existing game aggregate rather than replacing it. `game_lineups` remains the source of truth for who played and which agent they used. Persist only the per-player values required for manual operation, aggregation, and planned graphics; do not persist HenrikDev `rounds[]`, `kills[]`, locations, economy events, or other detailed event payloads in Phase 4. Broader series/tournament views derive from saved per-game records and are never independently editable aggregate copies.

**Tech Stack:** Existing TypeScript, SvelteKit 3 preview, Svelte 5, Skeleton 5, Drizzle/libSQL/SQLite, Vitest, and Playwright; pnpm. No new runtime dependency is planned.

**Spec:** `docs/TECH-SPEC.md`, especially sections 3, 4.4, 5.1, 6.3, 6.4, and 9; build scope from Phase 4 of `docs/PLAN.md`.

**Status:** Implemented on 2026-09-30 in `4d93124c` and reviewed against current `main` on 2026-10-01. Phase 4 is complete; Phase 5 is the next build phase.

The detailed checklists below are retained as the implementation design record. Current phase status is owned by `docs/PLAN.md`.

---

## Global Constraints

- Manual entry is required and must remain fully usable without HenrikDev, ValoSpectra, OCR, or another provider.
- Manual entry and future imports populate the **same canonical saved per-player, per-game records**.
- `game_lineups.playerId` remains the source of truth for player participation in a game.
- `game_lineups.agentId` remains the source of truth for that player's agent in the game. Do not duplicate agent selection into a statistics table.
- Missing values are `NULL`, not zero. Explicit zero remains distinguishable from unknown.
- Operators may save incomplete statistics and correct them later.
- Provider event payloads are out of scope. Do not persist HenrikDev `rounds[]`, `kills[]`, player locations, round economy, plants/defuses, or Spectra kill events merely because they exist in the provider contract.
- Manual Phase 4 entry should prioritize the statistics immediately visible on the Valorant spectator end-game screen:
  - kills / deaths / assists
  - Performance Score
  - trades
  - first bloods
  - plants
  - defuses
  - agent
- Treat Performance Score as its own Riot-facing statistic. Do **not** alias it to ACS or HenrikDev `players[].stats.score`.
- HenrikDev's richer fields such as combat score, damage, hit counts, economy, rounds, and kill events remain future provider-enhanced inputs.
- Do not add economy, clutches, retakes, detailed round events, or other advanced statistics until a Phase 5 graphic or an approved requirement consumes them.
- Do not infer event-derived statistics from aggregate K/D/A.
- Game, series, and tournament aggregates are derived views, not separately editable tables.
- Draft/incomplete games must not inflate broader statistical scopes.
- MVP is always an operator selection. Statistical ranking must never overwrite it.
- Shared broadcast selection, SSE, graphics controls, and OBS outputs remain Phase 5.
- HenrikDev / Spectra report retrieval and import behavior remain Phase 7.
- Authentication remains deferred under the current project plan. This phase does not make management routes safe for untrusted public exposure.
- Preserve the domain-split schema and `#lib/...` import conventions.
- Add a forward migration. Never use `db:push` against event data.

---

## Review Focus

1. **Participation identity:** statistics must belong only to players actually selected in that game's saved lineup, and to the correct match entry.
2. **Unknown vs zero:** every numeric field must preserve `NULL` separately from explicit `0`.
3. **Corrections:** edits to a game's statistics must immediately affect derived match/tournament views without manual aggregate maintenance.
4. **Substitutions:** a player absent from a game is not "missing statistics" for that game. Coverage is measured only across games in which the player actually appeared.
5. **Incomplete coverage:** a player can appear in a completed game while some fields remain unknown; broader views must identify partial coverage instead of silently treating missing values as zero.
6. **Unsupported aggregation:** Performance Score is stored exactly as reported for an individual game and remains unavailable at series/tournament scope until an authoritative aggregation rule is approved.
7. **Concurrency:** two operators editing the same game statistics must not silently overwrite one another.
8. **Lineup corrections:** player identity changes must not orphan saved statistics. Agent corrections may remain possible without changing player identity.
9. **Future imports:** the model needs enough provenance to tell later import logic that an operator changed a row after import, without implementing provider fetching now.
10. **MVP independence:** sorting or later corrections to Performance Score, K/D/A, or other visible statistics must never auto-change the saved MVP.

---

## 1. Existing Foundation to Preserve

| Existing file / behavior                                   | Reuse or implication                                                                                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/db/schema/games.ts`                        | `games` already owns result state and revisions. `game_lineups` already stores `(gameId, entryId, slot, playerId, agentId)` and therefore owns participation + agent selection.           |
| `src/lib/server/services/games.ts`                         | `bumpGameRevision()` provides the stale-write primitive for game-owned edits. Reuse it for a statistics save.                                                                             |
| `src/lib/server/services/lineups.ts`                       | Existing lineup replacement validates roster membership and historical retention. Extend its protection so a player with saved statistics cannot be silently removed from a draft lineup. |
| `src/lib/server/services/matches.ts` / `series-results.ts` | Match result state already derives from games. Statistics aggregation must not duplicate or replace this result logic.                                                                    |
| `/admin/games/[gameId]`                                    | Existing Info -> Lineup -> Map Veto workspace is the natural parent for a Post-Game tab.                                                                                                  |
| `/admin/matches/[matchId]`                                 | Add a read-oriented Statistics tab using derived match-scope statistics.                                                                                                                  |
| `/admin/tournaments/[tournamentId]`                        | Add a read-oriented Statistics tab using derived tournament-scope statistics.                                                                                                             |
| Phase 3 form behavior                                      | Preserve deep links, enhanced saves, dirty drafts, stale-save feedback, and section-local pending state.                                                                                  |
| HenrikDev v4 schema documented in `TECH-SPEC.md`           | Use the provider shape as a compatibility input, not as the database schema. Persist only the Phase 4 subset.                                                                             |

Do not redesign Phase 3 records or build a provider-oriented mirror of the HenrikDev response.

---

## 2. Decisions for Phase 4

### 2.1 Statistics ownership

Add a new domain schema file:

```text
src/lib/server/db/schema/statistics.ts
```

Export it from `src/lib/server/db/schema/index.ts`.

The canonical per-player record should be keyed by the local game and local player:

```text
game_player_statistics
├─ game_id
├─ player_id
├─ entry_id
├─ kills
├─ deaths
├─ assists
├─ performance_score
├─ trades
├─ first_bloods
├─ plants
├─ defuses
├─ manually_edited_at
├─ created_at
└─ updated_at
```

Recommended key:

```text
PRIMARY KEY (game_id, player_id)
```

References:

- `game_id -> games.id`
- `player_id -> players.id`
- `entry_id -> tournament_entries.id`

`entry_id` is intentionally persisted with the stat row. It records whether the player represented stable Team A or Team B for that game rather than re-inferring identity from a mutable reusable player profile.

Do **not** duplicate:

- `agent_id` — use `game_lineups.agent_id`
- team name / player display name / portraits — reusable profiles remain presentation sources
- game score/result — already owned by `games`

Database constraints should enforce non-negative stored numeric values where possible. Cross-record ownership remains service validated.

### 2.2 Initial Phase 4 metric set

Persist and expose the values that are conveniently available on the spectator end-game screen:

| Field             | Manual | Future provider mapping                                           | Aggregation                           |
| ----------------- | ------ | ----------------------------------------------------------------- | ------------------------------------- |
| Agent             | Yes    | `players[].agent` where available                                 | Not aggregated; per-game presentation |
| Kills             | Yes    | HenrikDev `players[].stats.kills`                                 | sum                                   |
| Deaths            | Yes    | HenrikDev `players[].stats.deaths`                                | sum                                   |
| Assists           | Yes    | HenrikDev `players[].stats.assists`                               | sum                                   |
| Performance Score | Yes    | Treat as provider-specific unless an authoritative mapping exists | game scope only initially             |
| Trades            | Yes    | Provider/event-derived when available                             | sum                                   |
| First Bloods      | Yes    | Provider/event-derived when available                             | sum                                   |
| Plants            | Yes    | Provider/event-derived when available                             | sum                                   |
| Defuses           | Yes    | Provider/event-derived when available                             | sum                                   |

All values are independently nullable.

For manual entry:

- K/D/A, Performance Score, Trades, First Bloods, Plants, and Defuses form the compact fallback scoreboard.
- Do not require Tracker.gg, HenrikDev, or another external site to complete the manual workflow.
- Do not require combat score, ACS, damage, hit counts, or rounds played in the default Phase 4 editor.
- Preserve explicit zero separately from unknown.
- Treat Performance Score as an opaque reported value. Do not calculate it locally and do not assume it equals ACS.
- Until an authoritative broader-scope aggregation rule is established, do not aggregate Performance Score across series or tournament scopes.

Future provider-enhanced fields such as combat score, damage, hit counts, rounds, economy, and detailed events may be added when Phase 5 graphics or Phase 7 imports justify them.

### 2.3 Minimal provenance seam

Add a one-to-one game statistics metadata record, e.g.:

```text
game_statistics_meta
├─ game_id
├─ import_source          nullable
├─ external_match_id      nullable
├─ imported_at            nullable
├─ last_manual_edit_at    nullable
├─ created_at
└─ updated_at
```

Purpose:

- Phase 4 manual-only games have import fields `NULL`.
- A manual statistics save updates `last_manual_edit_at`.
- Phase 7 can later set `import_source`, `external_match_id`, and `imported_at`.
- Future reimports can distinguish imported data from later manual corrections.

Add row-level `manually_edited_at` to `game_player_statistics`. A manual save should update it only for rows whose values or agent selection actually changed. This permits later import conflict previews to be player-specific instead of conservatively blocking the entire game.

Do not implement provider lookup, import polling, raw payload storage, or report checksums in Phase 4.

A future import may add more bookkeeping if real provider behavior proves it necessary.

### 2.4 Lineup and agent behavior

Participation and agent remain separate concepts:

- Player identity is saved through `game_lineups.player_id`.
- Agent is saved through `game_lineups.agent_id`.
- Player identity changes on a terminal game continue to require the existing correction path.
- The Post-Game editor may update `agent_id` for an already selected player without replacing the lineup.
- A stats row may only exist for a non-null `player_id` currently or historically retained in that game lineup.

When draft lineup replacement would remove a player with saved statistics:

```text
BLOCK
```

with a clear message requiring the operator to clear that player's saved statistics first or explicitly resolve the correction. Do not silently delete the stats.

A normal lineup save that preserves the same players may continue to work.

### 2.5 Aggregation semantics

Implement one server-side aggregation module used by management now and graphics later.

Suggested read model:

```ts
type Metric<T = number> = {
	value: T | null;
	coverage: 'complete' | 'partial' | 'none';
};

type PlayerStatisticsView = {
	playerId: string;
	entryIds: string[];
	gamesPlayed: number;
	gamesWithStatistics: number;
	kills: Metric;
	deaths: Metric;
	assists: Metric;
	trades: Metric;
	firstBloods: Metric;
	plants: Metric;
	defuses: Metric;
	performanceScore: Metric;
};
```

Exact type names may differ. Preserve the semantics. `performanceScore` is meaningful for game scope; broader scopes should leave it unavailable until an authoritative aggregation rule is approved.

#### Scope contributors

**Game scope**

- Uses that game's saved row directly.
- May be displayed even while incomplete/draft because the operator is editing it.
- Missing fields remain unavailable.

**Series scope**

- Consider games under the selected match where the player appears in `game_lineups`.
- Only normally completed games contribute to accumulated competitive totals in the initial policy.
- Draft/null-result and cancelled games do not contribute.
- Forfeit/walkover games have no invented rounds/statistics and do not contribute unless a later approved rule explicitly models played statistics for them.

**Tournament scope**

- Same rules, across normally completed games belonging to that tournament.
- Participation is based on saved game lineups, not merely tournament-roster membership.

A player who did not appear in a game is **not missing data** for that game.

A player who appeared but has no stats row, or whose row lacks a requested field, creates incomplete coverage for that metric.

#### Counts

Kills, deaths, assists, damage, and hit counts:

```text
sum recorded values
```

Do not substitute zero for unknown.

Coverage:

- `complete`: every contributing appearance has the field recorded.
- `partial`: at least one contributing appearance has a value and at least one is missing.
- `none`: no contributing appearance has the value.

#### Performance Score

Performance Score is recorded exactly as shown/reported for the individual game.

For Phase 4:

- game scope: display the saved value directly;
- series scope: unavailable;
- tournament scope: unavailable.

Do not sum or average Performance Score until Riot or an approved provider contract establishes an authoritative aggregation rule.

Do not map HenrikDev `players[].stats.score` to Performance Score unless that relationship is later verified explicitly.

#### Counts

Trades, First Bloods, Plants, and Defuses follow the same aggregation rules as K/D/A:

```text
sum recorded values across contributing appearances
```

Coverage is field-specific and uses the same complete / partial / none semantics.

### 2.6 MVP persistence

Persist explicit MVP selections at the natural aggregate scopes:

- `games.mvp_player_id`
- `matches.mvp_player_id`
- `tournaments.mvp_player_id`

Each references `players.id`.

Service validation:

- Game MVP must have appeared in that game's saved lineup.
- Match MVP must have appeared in at least one game of that match.
- Tournament MVP must have appeared in at least one game of that tournament.
- Archived reusable player profiles remain valid if already selected historically.
- A new selection must resolve to an eligible participant for the scope.
- Clearing MVP is allowed.

The scope is therefore implicit and unambiguous:

```text
game.mission -> game statistics
match.mvp    -> series statistics
tournament.mvp -> tournament statistics
```

Do not compute or recommend an MVP. A statistics table may be sorted for operator convenience, but that must not change the saved selection.

### 2.7 Management UI

Game workspace:

```text
Info -> Lineup -> Map Veto -> Post-Game
```

The first three remain the preparation flow. Post-Game is the later operational stage.

Post-Game should use a scoreboard-oriented two-team layout:

```text
Team A
  Player | Agent | K | D | A | Performance Score | Trades | First Bloods | Plants | Defuses

Team B
  Player | Agent | K | D | A | Performance Score | Trades | First Bloods | Plants | Defuses
```

The UI may progressively reveal the optional advanced columns to avoid an excessively wide default editor, but the values remain part of one saved draft.

Requirements:

- incomplete saves
- explicit blank -> `NULL`
- explicit `0` preserved
- dirty draft retained across tabs/history
- stale-save conflict retains submitted draft
- section-local Save button and pending state
- agent can be corrected without replacing player identity
- label Performance Score explicitly, keep it game-scoped, and do not present it as ACS
- terminal game result is not required to begin entering draft stats, but broader aggregates exclude unfinished games

Match workspace:

```text
Statistics
```

Tournament workspace:

```text
Statistics
```

These are derived/read-oriented tables. They do not edit aggregate totals.

Show status such as:

```text
3 / 5 player appearances have Kills coverage
Performance Score unavailable at series scope
Defuses unavailable
Series still incomplete
```

Do not hide all accumulated data merely because the match/tournament is still in progress.

---

## 3. Task 1 — Add Statistics Schema and Forward Migration

### Files

Create/modify approximately:

```text
src/lib/server/db/schema/statistics.ts
src/lib/server/db/schema/games.ts
src/lib/server/db/schema/matches.ts
src/lib/server/db/schema/tournaments.ts
src/lib/server/db/schema/index.ts
drizzle/<next migration>.sql
```

### Work

- [ ] Add `game_player_statistics`.
- [ ] Add `game_statistics_meta`.
- [ ] Add scope MVP references.
- [ ] Add non-negative/check constraints where SQLite owns the invariant.
- [ ] Add indexes needed for game/player/tournament aggregation.
- [ ] Generate/review a forward migration instead of rewriting existing migrations.
- [ ] Confirm migration recreation from empty DB.
- [ ] Confirm upgrade from a populated Phase 3 database without losing tournament/match/game/lineup records.
- [ ] Confirm referenced player/profile deletion remains restricted appropriately.
- [ ] Confirm explicit game deletion cleans up statistics metadata/player rows according to the intentional delete policy.

### Tests first

Add migration/foundation tests for:

- empty migration recreation
- populated Phase 3 upgrade
- invalid negative stored counts rejected
- duplicate `(gameId, playerId)` rejected
- MVP reference integrity
- rollback on failed multi-row statistics transaction

### Commit checkpoint

```text
feat: add phase 4 statistics persistence
```

---

## 4. Task 2 — Implement Game Statistics Domain Service

### Suggested file

```text
src/lib/server/services/statistics.ts
```

### Commands / service shape

Implement one transactional game-statistics save rather than independent row mutations.

Suggested input shape:

```ts
type PlayerStatsDraft = {
	playerId: string;
	entryId: string;
	agentId: string | null;
	kills: number | null;
	deaths: number | null;
	assists: number | null;
	performanceScore: number | null;
	trades: number | null;
	firstBloods: number | null;
	plants: number | null;
	defuses: number | null;
};

saveGameStatistics({
	gameId,
	expectedGameRevision,
	players
});
```

Exact API may differ.

### Work

- [ ] Acquire the write lock / revision using the existing `bumpGameRevision()`.
- [ ] Load match + saved game lineup in the same transaction.
- [ ] Reject unknown players, duplicate player IDs, wrong entry IDs, or players absent from the saved lineup.
- [ ] Parse every nullable metric without collapsing blank to zero.
- [ ] Reject negative, fractional, unsafe, NaN, or infinite values.
- [ ] Allow incomplete rows and incomplete collections.
- [ ] Update `game_lineups.agentId` only for the corresponding retained player/slot.
- [ ] Preserve archived/inactive agent selections already saved; require valid available agents for new selections.
- [ ] Upsert statistics rows transactionally.
- [ ] Decide explicit semantics for a completely blank row:
  - recommended: remove the statistics row if all stat fields are `NULL`, while retaining agent selection separately in the lineup.
- [ ] Compare before/after values so `manuallyEditedAt` updates only for changed players.
- [ ] Update `game_statistics_meta.lastManualEditAt` when any manual stat/agent value changes.
- [ ] Return the new game revision and refreshed saved scoreboard.

Do not bump the match/tournament revision merely to save player statistics. The game owns the statistics mutation.

### Lineup protection

Modify `replaceGameLineups()`:

- [ ] Before removing/changing a selected player, detect whether that player has a `game_player_statistics` row.
- [ ] If saved statistics exist, reject the identity-changing lineup save with a clear correction message.
- [ ] Do not block harmless slot moves/rewrites that retain the same participating player set, provided existing Phase 3 lineup invariants remain valid.

### Tests first

Cover:

- unknown vs zero
- partial save
- empty row removal
- duplicate player
- wrong team entry
- player not in lineup
- invalid negative/fractional number
- stale game revision
- concurrent operator save
- agent-only correction
- removal of stats-bearing lineup player blocked
- transaction rollback leaves both lineup agents and stats unchanged

### Commit checkpoint

```text
feat: add manual game statistics service
```

---

## 5. Task 3 — Build the Post-Game Manual Editor

### Files

Extend:

```text
src/routes/admin/games/[gameId]/+page.server.ts
src/routes/admin/games/[gameId]/+page.svelte
```

Extract components if the page becomes difficult to maintain, e.g.:

```text
src/lib/components/admin/PostGameEditor.svelte
```

### Work

- [ ] Add `Post-Game` to the validated/deep-linkable game tabs.
- [ ] Load saved lineup, profiles, agents, current stat rows, provenance summary, and game result state.
- [ ] Build Team A/Team B sections in stable match A/B identity.
- [ ] Keep each row tied to the saved lineup player, not a free player selector.
- [ ] Allow agent correction.
- [ ] Provide the spectator end-game fields prominently: K, D, A, Performance Score, Trades, First Bloods, Plants, and Defuses.
- [ ] Do not require combat score, ACS, damage, hit counts, or round-by-round data in the default manual workflow.
- [ ] Preserve a dirty draft on tab switch/history navigation.
- [ ] Preserve submitted values after invalid/stale saves.
- [ ] Label Performance Score explicitly so operators do not confuse it with ACS.
- [ ] Make blank inputs remain blank after save/reload.
- [ ] Make explicit zero remain `0` after save/reload.
- [ ] Give terminal/draft game state clear text but do not prohibit manual preparation merely because a game is not finalized.
- [ ] Do not add provider fetch/import buttons yet.

### Component/client tests

Cover:

- tab behavior
- blank vs zero binding
- dirty draft retention
- team/player row identity
- agent binding
- optional field visibility if collapsible
- stale/invalid server error retains draft

### Commit checkpoint

```text
feat: add post-game manual statistics editor
```

---

## 6. Task 4 — Build the Statistics Aggregation Engine

### Suggested file

```text
src/lib/server/services/statistics-aggregation.ts
```

Keep calculation logic pure where practical so it can receive fixtures without a database.

### Work

- [ ] Implement game-scope stat read model.
- [ ] Implement match/series-scope aggregation.
- [ ] Implement tournament-scope aggregation.
- [ ] Determine player participation from saved game lineups.
- [ ] Exclude non-contributing result states per section 2.5.
- [ ] Track field-specific complete/partial/none coverage.
- [ ] Sum counts without replacing missing values with zero.
- [ ] Aggregate K/D/A, Trades, First Bloods, Plants, and Defuses across contributing appearances.
- [ ] Return Performance Score only for game scope in Phase 4.
- [ ] Return Performance Score as unavailable for series/tournament scope until an authoritative aggregation rule is approved.
- [ ] Ensure a substitute's non-participation in another map does not create false missing coverage.
- [ ] Ensure a reopened/draft game immediately stops contributing while retaining its saved rows for later correction/finalization.

### Focused fixture tests

Required examples:

1. `NULL` kills in one contributing appearance -> partial kills coverage.
2. Explicit zero kills -> complete known zero.
3. Trades / First Bloods / Plants / Defuses sum only known contributing values and report partial coverage when appropriate.
4. Game Performance Score is returned unchanged.
5. Series/tournament Performance Score is unavailable.
6. A substitute appears in only Game 2 -> Game 1 is not considered missing for that player.
7. Draft game with rows -> excluded from series/tournament.
8. Reopened normal game -> retained but excluded.
9. BO2 draw -> both normally played games contribute.
10. Cancelled/forfeit/walkover -> no invented statistics contribution.

### Commit checkpoint

```text
feat: add statistical scope aggregation
```

---

## 7. Task 5 — Add Series and Tournament Statistics Views

### Match route

Extend:

```text
/admin/matches/[matchId]?tab=statistics
```

### Tournament route

Extend:

```text
/admin/tournaments/[tournamentId]?tab=statistics
```

### Work

- [ ] Add validated Statistics tabs using existing workspace navigation behavior.
- [ ] Use the aggregation service; do not query and calculate independently in each Svelte page.
- [ ] Present accumulated players from actual contributing lineups.
- [ ] Show K/D/A plus Trades, First Bloods, Plants, and Defuses.
- [ ] Show per-metric coverage.
- [ ] Show Performance Score only where the selected scope supports it.
- [ ] Show match/tournament progress without requiring completion.
- [ ] Make unavailable values visibly different from `0`.
- [ ] Make unsupported broader-scope Performance Score visibly unavailable rather than inventing an average.
- [ ] Avoid inventing an overall rating/ranking system.
- [ ] Avoid independently editable aggregate totals.

Corrections to a game's rows should be reflected on reload/navigation without another "recalculate" save action.

### Tests

- [ ] server load uses canonical aggregation service
- [ ] incomplete series renders accumulated data + incomplete status
- [ ] tournament with multiple matches aggregates correctly
- [ ] substitutions preserve correct appearance denominator
- [ ] zeros and unavailable values render differently
- [ ] unsupported broader-scope Performance Score renders as unavailable rather than as an invented aggregate

### Commit checkpoint

```text
feat: add match and tournament statistics views
```

---

## 8. Task 6 — Add Operator MVP Selection

### Services

Suggested functions:

```text
setGameMvp()
setMatchMvp()
setTournamentMvp()
```

or one typed scope service if clarity remains high.

### Work

- [ ] Add game MVP control to the Post-Game/statistics area.
- [ ] Add match MVP control to the match Statistics tab.
- [ ] Add tournament MVP control to the tournament Statistics tab.
- [ ] Validate scope participation.
- [ ] Allow clearing the selection.
- [ ] Preserve historical archived players already selected.
- [ ] Use revisions/stale handling appropriate to the owning aggregate.
- [ ] Do not mutate selection when statistics change.
- [ ] Do not auto-select from Performance Score, K/D/A, or another ranking.
- [ ] Return the selected player's matching game/series/tournament statistics read model for later Phase 5 reuse.

### Important test

1. Select Player A as MVP.
2. Correct Player B's visible statistics so Player B becomes statistically stronger by the displayed measures.
3. Reload.
4. MVP remains Player A.

### Commit checkpoint

```text
feat: add operator-selected mvp scopes
```

---

## 9. Task 7 — Harden Provenance for Phase 7 Without Implementing Imports

### Work

- [ ] Expose a small provenance summary from the statistics service:
  - manual-only
  - imported source/ID/time when populated later
  - player rows manually changed after last import
- [ ] Keep provider fields nullable and unused by the manual UI except for explanatory status.
- [ ] Add service helpers that Phase 7 can reuse to compare an incoming normalized player row against current canonical rows.
- [ ] Do not add network code, polling, retry state, group-code lookup, HenrikDev requests, Spectra requests, or raw provider payload storage.
- [ ] Document that detailed HenrikDev `rounds[]` / `kills[]` remain transient adapter inputs unless a future graphic requires an approved persisted event model.

### Tests

Construct metadata fixtures manually to prove:

- imported timestamp can coexist with later manual correction timestamp
- only changed player rows are flagged as manually edited after import
- another manual save that does not change a player does not falsely update that row's timestamp

### Commit checkpoint

```text
test: harden statistics provenance for future imports
```

---

## 10. Task 8 — Browser Journeys, Restart Proof, and Final Verification

### Browser journey A — basic manual workflow

1. Open an existing tournament/match/game with both lineups.
2. Finalize a normal game.
3. Enter partial Post-Game statistics.
4. Save.
5. Reload and confirm blanks stay unknown and zeros stay zero.
6. Complete/correct more statistics.
7. Open match Statistics and verify derived totals.
8. Open tournament Statistics and verify the same saved records contribute.
9. Select a game/match/tournament MVP.
10. Reload and confirm persistence.

### Browser journey B — substitution and coverage

1. Create/finalize two games.
2. Use a substitute in Game 2.
3. Enter complete Game 1 stats for its five players.
4. Enter partial Game 2 stats.
5. Verify the substitute is not marked missing for Game 1.
6. Verify the replaced player is not marked missing for Game 2.
7. Verify the requested metric coverage reflects only actual appearances.

### Browser journey C — correction and stale writer

1. Two browser contexts load the same Post-Game editor.
2. Context A corrects statistics and saves.
3. Context B attempts to save its stale draft.
4. Reject B with stale feedback while preserving B's submitted draft.
5. Reload B and verify A's saved values.
6. Verify match/tournament aggregates reflect A only.

### Browser journey D — MVP independence

1. Save Player A as MVP.
2. Edit Player B to have stronger displayed statistics.
3. Reload all scopes.
4. Verify MVP remains Player A.

### Persistence/restart proof

Use the existing disposable database patterns:

- save lineups + stats + MVP
- terminate writer process
- open fresh process/connection
- verify canonical rows, agent selections, metadata, and derived scopes

### Final commands

Run at minimum:

```bash
pnpm check
pnpm exec vitest run --project server --project client
pnpm exec playwright test <phase-4 tests>
pnpm exec eslint .
pnpm build
```

Run formatting/lint according to current repository baseline and report pre-existing failures separately rather than claiming they pass.

### Final review checklist

- [ ] No provider network dependency was added.
- [ ] No detailed Henrik/Spectra event storage was added.
- [ ] Agent selection has one source of truth.
- [ ] Unknown and zero are distinct throughout DB/service/UI/aggregation.
- [ ] Per-game corrections update all broader scopes.
- [ ] Substitutions do not create false missing coverage.
- [ ] Performance Score is never mislabeled as ACS or aggregated without an approved rule.
- [ ] MVP remains operator-owned.
- [ ] Stale writers cannot silently overwrite.
- [ ] Phase 3 workflows still pass regression tests.
- [ ] Production build passes.

---

## 11. Phase 4 Done When

Phase 4 is complete when:

- An operator can manually enter, save, reopen, and correct per-player statistics for a game without any provider.
- Agent selection and statistics use the existing game lineup rather than a graphics/provider copy.
- Unknown values remain different from zero.
- Incomplete scoreboards can be saved.
- Game, match, and tournament statistical views derive from the same canonical records.
- K/D/A, Trades, First Bloods, Plants, and Defuses follow the aggregation rules in the technical specification.
- Performance Score is stored/displayed as its own game-level statistic and is not silently treated as ACS.
- Coverage and unavailable broader-scope values are visible instead of silently overstated.
- Substitutions aggregate by actual game participation.
- Reopening/drafting a game prevents it from inflating broader totals while preserving the saved manual work.
- Game/match/tournament MVPs can be explicitly selected and remain unchanged by statistical ranking or later corrections.
- Minimal provenance is ready for later provider conflict handling.
- No HenrikDev/Spectra retrieval or detailed event persistence has leaked into this phase.
- Saves survive restart and concurrent stale edits are rejected.
- The existing Phase 3 management behavior remains intact.

---

## 12. Explicitly Deferred to Later Phases

### Phase 5

- shared Tournament -> Match -> Game broadcast selection
- SSE state distribution
- Player Stats graphics control/output
- Post-Game graphics control/output
- MVP graphics control/output
- visual metric shortlist adjustments required by real test templates
- optional richer provider-derived metrics such as ACS/ADR/HS% if the graphics actually consume them

### Phase 6

- live HUD/provider integration and failover

### Phase 7

- HenrikDev request adapter
- ValoSpectra post-game polling/import
- external identity mapping/review
- idempotent import implementation
- import-vs-manual conflict preview/replacement
- real report validation
- any provider-specific normalization
- an explicit resolution path for imported all-null manual-clear rows before lineup identity changes
- player-level provenance for agent-only manual corrections before reimport can replace agent data
- detailed round/kill-event persistence **only if later requirements explicitly justify it**

The Phase 4 model is the canonical destination for those future normalized imports.
