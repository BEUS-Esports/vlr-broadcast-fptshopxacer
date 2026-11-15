# Phase 3 Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. The execution method is not selected by this planning document.

**Goal:** Complete source-independent tournament, roster, match, veto, game, and lineup management, with safe corrections and persistence across application restarts.

**Architecture:** Extend the existing SvelteKit page/action -> domain service -> Drizzle/libSQL architecture. Keep mutations transactional and revision checked, derive ordinary series results from games, and reuse saved domain records between management workspaces. Do not add another backend, tournament engine, or graphics-only copy of these records.

**Tech Stack:** The repository's installed TypeScript, SvelteKit 3 preview, Svelte 5, Skeleton 5, Drizzle/libSQL/SQLite, Vitest, and Playwright; pnpm. No additional runtime dependency is planned.

**Spec:** `docs/TECH-SPEC.md`, particularly sections 3, 4.2-4.4, and 9; build scope from Phase 3 of `docs/PLAN.md`.

**Status:** Functional implementation verified on 2026-09-30. The original staged checklist below is retained as an execution record; functional completion and verification evidence are summarized here. No migration or runtime dependency was added.

| Slice      | Current result                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3A–3G      | Services, routes, collection editors, correction paths, and regression coverage implemented.                                                                                          |
| Navigation | Skeleton Tabs with SvelteKit 3 navigation; deep links, keyboard/history, and saved/dirty section behavior verified in the browser.                                                    |
| 3H         | Five browser journeys passed against a disposable database/assets; independent-connection races and fresh-process saved-setup checks passed. Final verification results follow below. |

The additional decisions in section 2 were adopted for implementation. Management editing requires JavaScript; read-only tab links remain available without it. Each successful enhanced save applies its result in place (`navigate: false`) to retain the workspace tab. Archived player profiles cannot become new lineup choices; same-game historical selections remain retainable.

> [!IMPORTANT]
> **Semantic follow-up updated 2026-10-01:** Match Team A / Team B represent competition order. Team A starts the standard map veto; a grand-final upper-bracket team may ban twice first as A or B. The editor offers editable ruleset drafts and preserves saved actor ownership. See [the Team A/B veto-order correction](./2026-10-01-team-a-b-veto-order-correction.md) before accepting the Phase 5 Map Veto graphics workflow.

## Verification evidence — 2026-09-30

| Check                                                                                    | Result                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                             | Passed: zero errors and warnings.                                                                                                                                                                                                             |
| `pnpm exec vitest run --project server --project client`                                 | Passed: 19 files, 52 tests. Two subprocess-role tests are skipped in the parent; the restart test runs both in separate writer/reader processes. A final fixture-isolation adjustment was rechecked with all five game-service tests passing. |
| `pnpm exec playwright test tests/phase3-management.e2e.ts tests/phase3-conflicts.e2e.ts` | Passed: five tests using installed Chrome, including edited-proposal veto consent invalidation.                                                                                                                                               |
| `pnpm exec eslint .`                                                                     | Passed.                                                                                                                                                                                                                                       |
| `pnpm lint`                                                                              | Fails on formatting in 44 untouched baseline files (including existing configuration, schema, profile routes, and the Phase 2 browser test). All Phase 3 changes pass formatting; the baseline is not reported as a pass.                     |
| `pnpm build`                                                                             | Passed; rebuilt with the normal environment after the isolated browser run.                                                                                                                                                                   |
| Migration and restart proof                                                              | Disposable migration recreation, rollback, foreign-key integrity, seven independent-connection races, and terminated-writer/fresh-reader persistence passed.                                                                                  |
| Review                                                                                   | Archive-deletion protection, consent tied to the current veto proposal, and post-clinch “Not needed” presentation fixed and re-reviewed.                                                                                                      |

The original red-first steps and per-task commit steps below remain historical checklist items where execution evidence or an individual commit was not recorded. Functional implementation and final verification are represented by the results above. Phase 2 target-network catalogue refresh and another-machine LAN rehearsal remain outstanding; these local results do not close those checks.

## Global Constraints

- "Automatic tournament brackets, seeding, advancement, or standings engines" are out of scope.
- "Tournament rosters have **no main/substitute classification**."
- "Operators create games **one at a time as needed**, under the selected match."
- "Game numbers are unique within a match and are distinct from the editable display name".
- "The map veto belongs to the **entire match**, not an individual game."
- "The game setup flow is **Info -> Lineup -> Map Veto**." (Arrow typography normalized.)
- "Incomplete games do not contribute a winner to the series score."
- "Draft preparation can be incomplete; a ready lineup requires all five selections."
- "Roster changes preserve already saved game lineups."
- "Do not silently rewrite the competition setup."
- Maintain the existing domain-split schema and `#lib/...` imports. Do not upgrade the framework as part of this phase.
- Keep manual statistics in Phase 4; shared broadcast selection, SSE, and graphics in Phase 5; providers in later phases.
- Authentication remains deferred under the existing plan. Management remains trusted-network-only; this phase is not authorization to expose it publicly.
- Preserve existing migrations and unrelated working-tree changes. Never run `db:push` against event data.

## Review Focus

1. Two connections editing related records: participant changes versus game creation, veto edits versus game edits, roster edits versus lineup saves, and simultaneous game finalizations. Each must serialize correctly or return a clear conflict. Tests: Tasks 3, 4, 5, 7, 8.
2. Blank, zero, malformed, fractional, or incomplete scores: unknown is not zero and drafts are not results. Tests: Tasks 1 and 5.
3. Historical players removed from current availability: old lineups remain readable and editable without permitting new ineligible selections. Tests: Tasks 3 and 6.
4. Veto corrections with existing games: provide an actual resolution path, not two mutually blocking editors. Tests: Tasks 5 and 7.
5. Failed collection-form saves: preserve all selected players/maps and their order; do not flatten repeated form fields or replace a dirty draft with newly loaded data. Tests: Tasks 3, 6, 7, 8.

## 1. Existing foundation to preserve

The following were inspected, not merely assumed from the roadmap:

| Existing file                                | Reuse or implication                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/server/db/schema/tournaments.ts`    | Tournament, entry, current player membership, and map-pool tables already exist. Tournament has a revision and archive timestamp.                                                                                                    |
| `src/lib/server/db/schema/matches.ts`        | Match and ordered veto tables already exist. Composite foreign keys tie match participants to the tournament; a check restricts the winner to A/B. Veto sequence, map, and assigned game number already have uniqueness constraints. |
| `src/lib/server/db/schema/games.ts`          | Games and lineup slots already exist. Game number uniqueness, paired scores, result combinations, slot bounds, and game-wide player uniqueness are partly database enforced. Cross-record ownership still needs service validation.  |
| `src/lib/server/services/tournaments.ts`     | `replaceTournamentMapPool()` already has transactional revision checking and blocks removal of referenced maps. Extend it rather than bypassing it.                                                                                  |
| `src/lib/server/services/matches.ts`         | `updateMatchParticipants()` already blocks changes after any game, veto action, or stored result exists. Keep this rule even for empty draft games.                                                                                  |
| `src/routes/admin/teams/+page.server.ts`     | Existing route convention: server loads, named actions, service mutations, structured failure, and redirect after successful creation.                                                                                               |
| `src/lib/server/services/form-error.ts`      | Existing scalar-form error adapter. Collection forms need explicit draft preservation, not an assumption that scalar extraction preserves arrays.                                                                                    |
| `src/lib/server/services/foundation.test.ts` | Existing disposable file-backed database, migration, rollback, reference, and revision-test patterns.                                                                                                                                |
| `vite.config.ts`, `playwright.config.ts`     | Vitest projects are `server` and `client`; Playwright finds `**/*.e2e.{ts,js}` and builds/previews the app.                                                                                                                          |

Do not start with a schema rewrite. Add a forward migration only for an invariant that cannot be implemented correctly with the existing representation. Any migration must pass recreation and populated-upgrade tests.

## 2. Proposed decisions to approve

### 2.1 Navigation and saving

Use stable IDs in administration URLs. A tournament slug remains presentation/template metadata, not the admin record locator.

| Route                               | Workspace                                           |
| ----------------------------------- | --------------------------------------------------- |
| `/admin/tournaments`                | Searchable list and create form; archive filter.    |
| `/admin/tournaments/[tournamentId]` | Overview / Teams & Players / Map Pool / Matches.    |
| `/admin/matches/[matchId]`          | Info / Games / Map Veto; match-wide result summary. |
| `/admin/games/[gameId]`             | Info / Lineup / Map Veto, with parent breadcrumbs.  |

Use a validated `?tab=` value for refreshable/deep-linkable tabs. New matches are created from their tournament and new games from their match. Do not introduce a global tournament selector as a substitute for explicit management context.

Exclude archived/unavailable profiles and resources from new choices, but keep existing referenced selections readable and retainable. A catalogue availability change must not invalidate saved event preparation; the saved tournament pool still controls map validity.

Each editable section has its own Save button, pending state, draft state, and revision token. Switching tabs must retain drafts; leaving the workspace with unsaved changes must warn. The game-page Map Veto tab edits the parent match and uses its revision, not the game revision. Label this explicitly.

Use constrained image boxes rather than CSS transforms: compact team logos, portraits, and map thumbnails must not dictate the height of every row. Lineup editors show two team panels with five numbered slots each; stack panels on narrow screens. Reordering must have keyboard-usable Move Up/Move Down controls; drag-and-drop is not required.

### 2.2 Result rules

Scores A/B always belong to the match's stable A/B entries. Starting attack/defense is an independent pair. Changing starting sides never changes A/B, scores, winners, or lineups.

| Game state       | Scores                                     | Winner                              | Series contribution                              |
| ---------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------------------ |
| Draft/incomplete | Both unknown, or a reachable MR12 score    | None                                | No game win, even if the draft score is unequal. |
| Normal final     | 13–0 through 13–11, or overtime win by two | Derived server-side from A/B scores | One win.                                         |
| Forfeit/walkover | Both unknown                               | Operator selects A or B             | One win; no invented round score.                |
| Cancelled        | Both unknown                               | None                                | No win.                                          |

For normal finalization, require an identified map from the tournament pool. Do not require a complete lineup before recording a result; preparation readiness and result validity are separate. Starting sides are either both unknown or the two distinct match entries. Regulation uses MR12 per half and ends at 13 unless the score reaches 12–12. Overtime uses MR1 per half, repeating without a cap until a team wins both rounds: 14–12, 15–13, and so on. Validate both finalization and corrections. Drafts may be unfinished or hold a completed score before explicit finalization, but cannot contain rounds played after the game would have ended.

Ordinary match results derive from games: BO1 needs one win; BO2 needs two decisive game results and permits 1-1; BO3 needs two wins; BO5 needs three. Game-level normal/forfeit/walkover results count; drafts and cancellations do not.

Proposed ordering policy: results may be entered out of order, but a normal series is not complete while an earlier numbered game before its clinching result is missing or unresolved. Count known wins visibly. Reject a correction/finalization that leaves a decisive game result after an earlier series-clinching result; identify those games and require explicit reopening/correction. Never silently drop later results. Prepared, unplayed games beyond a clinch remain saved and are shown as not needed.

A completed normal match uses `resultType = normal`; a BO2 draw has no winner. An incomplete normal series uses null result/winner. Do not expose independently editable ordinary match winner and series-score fields.

Match-wide forfeit, walkover, and cancellation are separate administrative actions. Preserve played-game data and display the exceptional outcome separately from recorded game wins. Clearing the exceptional outcome recomputes the ordinary result. Block game-result mutations while a match-wide exceptional outcome is active until the operator explicitly clears it. No new outcome-provenance column is required: the existing exceptional result types distinguish these paths.

### 2.3 Corrections and deletion

Game number is a stable logical slot in `1..bestOf`; creation suggests the lowest unused slot and uses a database uniqueness constraint as the final authority. Do not renumber games after deletion or generate all possible games. Reopening a cancelled game is the correction path for replaying that logical slot; separate rematch numbering is outside this phase.

After any terminal game result exists, changing the match format requires explicit reopening of those results first. With drafts only, format changes are allowed only when existing game numbers and veto assignments still fit. Label edits remain allowed.

A Save Draft result command is permitted only when the current game has no terminal result. It must not bypass the explicit Reopen command.

A normal final-score correction may update the result directly, with impact confirmation and revision checks. Changing a completed game's map, starting-side identity, or players requires an explicit Reopen action first. Reopening clears completion/winner and retains preparation; retain normal scores as draft values. Recompute the parent series in the same transaction.

Deleting a draft game requires confirmation showing that its saved lineup will also be removed. Terminal games must be reopened first. A match can be deleted only after its games, vetoes, and exceptional result have been explicitly cleared. Tournament entries referenced by matches cannot be replaced or removed; changing a team profile's branding is a different operation. Archive tournaments rather than recursively deleting used event data. A tournament can be hard-deleted only after entries and matches are removed; its owned map-pool rows can then be removed transactionally.

There is no hidden Reset Everything action. The existing participant-lock rule is relaxed only when the operator has explicitly removed the actual dependent records, not just cleared score fields.

### 2.4 Historical lineups and current availability

Current roster membership controls new selections. Existing lineup references are not foreign-keyed to that mutable membership row.

When a roster player is removed, keep their saved game selections and mark them as no longer on the current roster. An unchanged player retained within the same saved game's same team can stay or be reordered. That exception does not permit selecting the player in a new game, moving them to the other team, or re-adding them after a saved removal from the lineup. A player can belong to only one team's current roster per tournament; validate this within the roster-save transaction. Profiles remain reusable across tournaments. The roster editor provides searchable player selection and a selected-player preview, disabling players assigned to another entry in this tournament. Conflicts remain prohibited within an actual game's lineup.

Do not overwrite a populated lineup automatically from a roster or another game. Agent selection is not a new Phase 3 editor, but existing agent IDs must not be destroyed by a player-order-only save. Preserve an assignment when the same player stays in the same game/team; clear it when its player is removed or replaced.

### 2.5 Veto ownership and conflict resolution

Allow arbitrary ordered ban/pick/decider rows, consecutive actions by one team, and assignments before games exist. A draft veto need not match an automatically generated tournament format.

Enforce one occurrence of a map per match sequence, unique positive sequence positions, unique assigned game numbers, current map-pool membership, and A/B-only actors. Ban/pick rows require an acting team; a neutral decider may omit it. Bans have no target game or side choice. Picks/deciders may remain unassigned during preparation; when assigned, their number is in `1..bestOf`. Side chooser and choice are either both present or both absent and refer to a match participant.

Game creation prefills its assigned veto map and any fully recorded starting-side choice, but creates only the requested game. Manual map selection is possible when there is no assignment and must not contradict a ban or another game's selected map in the veto.

Do not silently reconcile later differences. A veto save with a conflicting existing game returns a list of affected games. Provide an explicit Apply to affected draft games option, previewing map/side changes and submitting their expected revisions. That single transaction updates veto plus consenting draft games. Completed/cancelled/forfeited games must be reopened first. A conflicting game-side edit points back to this shared veto correction path, so the user is not trapped between two blocking forms.

Removing a veto assignment leaves the game's existing preparation intact; it does not delete the game or clear its scores. A newly created ban that contradicts a prepared game still blocks until the operator resolves the conflict. No implicit side alternation is inferred from pick order.

### 2.6 Revision ownership

| Write                                                          | Revision and transaction scope                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournament metadata, entries, rosters, map pool                | Check/bump tournament revision; update the affected collection atomically.                                                                                           |
| Match metadata, participants, veto, exceptional outcome        | Check/bump match revision.                                                                                                                                           |
| Game creation/deletion, info changes, result correction/reopen | Check/bump parent match revision; check/bump existing game revision; recompute series when affected, in the same transaction.                                        |
| Lineup replacement                                             | Check/bump game revision and replace both teams' slots atomically. Validate current ownership, roster eligibility, and final-state restrictions in that transaction. |
| Veto propagation to draft games                                | Check/bump match revision plus every affected game revision in one transaction.                                                                                      |

A parent revision is not a replacement for checking the current referenced records. Read and validate tournament membership, map availability/pool, and result state inside the same write transaction. A busy/write conflict must not silently retry an old draft as if it were fresh. Return a useful conflict and preserve the submitted draft. Read-only page loads do not bump revisions.

## 3. File and responsibility map

| Files                                                                 | Responsibility                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing `services/tournaments.ts`                                    | Tournament commands and current map-pool command.                                                                                                                                                |
| New `services/tournament-entries.ts`                                  | Entry add/remove and roster replacement.                                                                                                                                                         |
| Existing `services/matches.ts`                                        | Match create/edit/delete, existing participant lock, exceptional outcomes, transactional derived-result persistence.                                                                             |
| New `services/series-results.ts`                                      | Pure series calculation and result-sequence conflict reporting.                                                                                                                                  |
| New `services/games.ts`                                               | Individual game creation, info/result changes, reopen/delete, parent-series consistency.                                                                                                         |
| New `services/game-preparation.ts`                                    | Shared pure veto/game projection and conflict validation, used by games and veto commands.                                                                                                       |
| New `services/lineups.ts`                                             | Atomic lineup replacement and historical-selection eligibility.                                                                                                                                  |
| New `services/vetoes.ts`                                              | Ordered veto replacement and explicit draft-game propagation.                                                                                                                                    |
| Existing `services/form-error.ts`                                     | Preserve existing scalar behavior; add error code and optional serializable draft for collection forms.                                                                                          |
| New colocated `*.test.ts` files                                       | Pure-rule and disposable-database tests for each service.                                                                                                                                        |
| New `src/lib/server/testing/management-fixture.ts`                    | A migrated temporary DB fixture and deterministic data, including a two-connection variant; never the developer's database.                                                                      |
| `src/lib/components/admin/management/`                                | `RosterEditor.svelte`, `MapPoolEditor.svelte`, `LineupEditor.svelte`, and `VetoEditor.svelte`, with colocated component tests. Components own only local drafts, not authoritative domain state. |
| New route files listed above                                          | Page loads and named actions; call services for mutations. Use direct focused read queries as existing routes do; do not add a generic repository abstraction.                                   |
| Existing `src/routes/admin/+layout.svelte`                            | Tournaments navigation and nested-route active state.                                                                                                                                            |
| New `tests/phase3-management.e2e.ts`, `tests/phase3-conflicts.e2e.ts` | End-to-end preparation, correction, and stale-save journeys.                                                                                                                                     |
| Existing `playwright.config.ts`, `docs/PLAN.md`, `README.md`          | Test isolation/runtime details and accurate completion notes.                                                                                                                                    |

Shared interface notation below: IDs are strings; revisions are positive safe integers. `SavedRecord` is `{ id: string; revision: number }`. `GameSaved` is `{ gameId: string; gameRevision: number; matchId: string; matchRevision: number; series: SeriesSummary }`. Define/export these aliases in their owning services, not in an unrelated generic types framework.

## 4. Implementation tasks

### Task 1 / 3A: Pin the pure result contract

**Files:** Create `src/lib/server/services/series-results.ts` and `.test.ts`.

**Interfaces:** Produce `deriveSeriesResult(input: SeriesInput): SeriesSummary`. `SeriesInput` contains `bestOf: 1|2|3|5`, `teamAEntryId`, `teamBEntryId`, and games containing `{ id, number, resultType, winnerEntryId }`. `SeriesSummary` contains `{ winsA: number, winsB: number, state: 'incomplete'|'completed'|'draw', winnerEntryId: string|null, conflicts: Array<{ gameId: string; reason: 'after-clinch'|'invalid-winner'|'invalid-number'|'duplicate-number' }> }`. Incomplete-prefix handling is described in section 2.2. The service does not query or mutate the DB.

- [x] Write table-driven tests: BO1 A win; BO2 A/A, A/B, B/B; BO3 2-0 and 2-1; BO5 3-0 and 3-2; unfinished/cancelled games contribute zero; game forfeits count one; third-team winner and duplicate/out-of-range numbers conflict. Assert BO2 1-1 is `draw`, not `incomplete`. Assert a missing earlier result keeps a known two-win tally incomplete. Assert post-clinch decisive games are identified, not ignored.
- [ ] Run `pnpm exec vitest run --project server src/lib/server/services/series-results.test.ts`; confirm failures are the missing behavior, not a broken test harness.
- [x] Implement only that contract and the proposed decision table. Do not add bracket, round, or provider logic.
- [x] Rerun the command and `pnpm check`; require all task assertions to pass and no new diagnostics.
- [ ] Commit only this task with `test/feat: define series result rules` after review.

### Task 2 / 3B: Tournament metadata and a usable tournament entry point

**Files:** Extend `services/tournaments.ts`; create `services/tournaments.test.ts` and `server/testing/management-fixture.ts`; add `src/routes/admin/tournaments/+page.server.ts`, `+page.svelte`, and `[tournamentId]/+page.server.ts`, `+page.svelte`; update the admin layout.

**Interfaces:** Add `saveTournament({ id?, expectedRevision?, name, slug }): Promise<SavedRecord>`, `setTournamentArchived({ tournamentId, expectedRevision, archived: boolean }): Promise<SavedRecord>`, and `deleteTournament({ tournamentId, expectedRevision }): Promise<void>`. On create, omit ID/revision; on update require both. Preserve `replaceTournamentMapPool`'s existing signature. The test fixture exports `withManagementFixture(run)` and `withTwoConnections(run)` with their callbacks receiving isolated migrated DB/client handles and deterministic IDs; close handles and remove files in `finally`.

- [x] Add tests for create/reopen, Unicode display names, trimming/lowercasing slug input, valid lowercase hyphen-separated slugs, rejected unsafe slugs, duplicate slug conflicts, rename preserving slug, stale updates, archive/unarchive, and blocked deletion with entries/matches.
- [ ] Run `pnpm exec vitest run --project server src/lib/server/services/tournaments.test.ts`; verify each missing command fails its intended assertion.
- [x] Implement services and list/detail Overview UI. Derive an editable slug suggestion only during creation; never overwrite a saved slug on name edits. Archived records remain readable and must be unarchived before new preparation changes. Add Tournaments navigation active for descendant routes.
- [x] Rerun task tests, existing `foundation.test.ts`, and `pnpm check`. Add a browser create/edit/reopen case to `tests/phase3-management.e2e.ts` as this UI becomes usable.
- [ ] Commit `feat: add tournament management workspace` after the slice passes.

### Task 3 / 3C: Tournament entries, rosters, and map pools

**Files:** Create `services/tournament-entries.ts`, `.test.ts`; extend tournament service tests, `form-error.ts`, and tournament route actions; add `RosterEditor.svelte` and `MapPoolEditor.svelte` with component tests.

**Interfaces:** Add `addTournamentEntry({ tournamentId, expectedTournamentRevision, teamId }): Promise<{ entryId: string; tournamentRevision: number }>`, `removeTournamentEntry({ tournamentId, expectedTournamentRevision, entryId }): Promise<{ tournamentRevision: number }>`, and `replaceTournamentRoster({ tournamentId, expectedTournamentRevision, entryId, playerIds: string[] }): Promise<{ tournamentRevision: number }>`. IDs in the payload must agree with the loaded parent; duplicates are invalid. Extend `formError(cause, form?, draft?: Record<string, unknown>)` without breaking existing callers; return only explicitly submitted/validated serializable draft fields, plus the existing safe error message and classification code.

- [x] Test duplicate team entry, missing/foreign entry, duplicate roster player, more than five available players, stale roster save, referenced-entry removal, and rollback. Seed a saved lineup directly and prove roster removal does not change it. Retain existing map-pool reference-preservation tests; add two-tournament pool separation. Test that collection drafts survive a validation/409 response with all values and ordering intact.
- [ ] Run the focused server and new component tests and establish intended failures before implementation.
- [x] Implement the Teams & Players and Map Pool tabs. Submit each collection as a validated complete payload, not an accidentally flattened repeated field. Replace owned collections transactionally and return the new tournament revision. Do not replace an entry's team identity in place.
- [x] Require passing `pnpm exec vitest run --project server src/lib/server/services/tournament-entries.test.ts src/lib/server/services/tournaments.test.ts`, `pnpm exec vitest run --project client`, and `pnpm check`. Exercise add/remove player plus reload in the browser journey.
- [ ] Commit `feat: add tournament entries rosters and map pools`.

### Task 4 / 3D: Matches and safe administrative outcomes

**Files:** Extend `services/matches.ts`; create `services/matches.test.ts`; add `src/routes/admin/matches/[matchId]/+page.server.ts` and `+page.svelte`; extend tournament Matches tab.

**Interfaces:** Consume `deriveSeriesResult`. Add `createMatch({ tournamentId, teamAEntryId, teamBEntryId, label, bestOf }): Promise<SavedRecord>`, `saveMatchInfo({ matchId, expectedRevision, label, bestOf }): Promise<SavedRecord>`, `deleteMatch({ matchId, expectedRevision }): Promise<void>`, `setMatchOutcome({ matchId, expectedRevision, resultType: 'forfeit'|'walkover'|'cancelled', winnerEntryId: string|null }): Promise<SavedRecord>`, and `clearMatchOutcome({ matchId, expectedRevision }): Promise<SavedRecord>`. Preserve `updateMatchParticipants` and its existing signature. The module also owns `recomputeMatchResult(tx, matchId): Promise<SeriesSummary>`, called inside a transaction whose caller already checked/bumped the match revision. It must not open a nested transaction or bump the revision again. Type `tx` from the configured Drizzle transaction callback. Reject exceptional active outcomes in ordinary game-mutation paths; clearing one explicitly recomputes from games.

- [x] Test both entries in the same tournament, distinct teams, supported formats, empty-draft-game participant lock, veto/result lock, same-tournament third-team winner rejection, safe label edit, format shrinking past an existing game/veto slot, and result-bearing format changes. Test administrative wins without invented game scores and clearing them back to the derived result.
- [ ] Run `pnpm exec vitest run --project server src/lib/server/services/matches.test.ts`; record intended missing-behavior failures.
- [x] Build match creation from the tournament, match Info UI, result summary, separate participant edit, and explicit exceptional-outcome controls. Metadata saves must not carry a client-computed ordinary series winner. Show dependency blockers next to locked participant controls.
- [x] Require task tests, `foundation.test.ts`, and `pnpm check` to pass. Extend the browser journey with two matches and a blocked identity change.
- [ ] Commit `feat: add match management and safe outcomes`.

### Task 5 / 3E: Individual games, scores, and series recomputation

**Files:** Create `services/games.ts`, `.test.ts`, `services/game-preparation.ts`, `.test.ts`; add `src/routes/admin/games/[gameId]/+page.server.ts`, `+page.svelte`; implement match Games tab.

**Interfaces:** Consume match result services. Produce `createGame({ matchId, expectedMatchRevision, number, name }): Promise<GameSaved>`, `saveGameInfo({ gameId, expectedGameRevision, expectedMatchRevision, name, mapId: string|null, startingAttackersEntryId: string|null, startingDefendersEntryId: string|null }): Promise<GameSaved>`, `saveGameResult({ gameId, expectedGameRevision, expectedMatchRevision, result }): Promise<GameSaved>`, `reopenGame({ gameId, expectedGameRevision, expectedMatchRevision }): Promise<GameSaved>`, and `deleteDraftGame({ gameId, expectedGameRevision, expectedMatchRevision }): Promise<{ matchId: string; matchRevision: number; series: SeriesSummary }>`. Result is a discriminated union: draft `{ mode:'draft', scoreA:number|null, scoreB:number|null }`; normal `{ mode:'normal', scoreA:number, scoreB:number }`; forfeit/walkover `{ mode, winnerEntryId:string }`; cancelled `{ mode:'cancelled' }`.

`game-preparation.ts` exports `projectVetoGame({ number, teamAEntryId, teamBEntryId, actions }): { mapId: string|null; startingAttackersEntryId: string|null; startingDefendersEntryId: string|null }` and `findVetoGameConflicts({ actions, games, teamAEntryId, teamBEntryId }): Array<{ gameId:string; fields:Array<'map'|'startingSides'>; reason:string }>`. Use existing schema-inferred veto/game row types, with readonly inputs; require no database access in these helpers. Their conflict rules are section 2.5.

- [x] Test one-game-only creation, same-match number collision, cross-match number reuse, no renumbering, current pool validation, A/B-only sides/winner, both-or-neither starting sides, paired unknown/zero scores, rejected NaN/fractions/negatives, and explicit completion. Assert swapping attack/defense leaves scores, winner, A/B, and lineup rows unchanged. Test correction/reopen recomputes BO2/BO3 atomically; force a failed derived-result update and prove the game write rolls back. Test veto prefill and conflicting map rejection using directly seeded actions.
- [ ] Run focused games/preparation tests and verify the failures identify missing behavior.
- [x] Implement commands in one write transaction with checked match/game revisions. Normal winners are server derived. Add Info controls with separate Save Draft, Finalize, Correct Result, and Reopen actions; show current series impact before consequential changes. Parsing blanks must produce null, not `Number('') === 0`. A stale create offers reload rather than quietly creating the next game.
- [x] Require focused tests plus `series-results.test.ts`, `matches.test.ts`, and `pnpm check` to pass. Add browser BO2 2-0 -> correction -> 1-1 and reopen -> incomplete cases.
- [ ] Commit `feat: add game lifecycle and consistent series results`.

### Task 6 / 3F: Five-slot lineups with historical preservation

**Files:** Create `services/lineups.ts`, `.test.ts`; add `LineupEditor.svelte` and `LineupEditor.svelte.test.ts`; extend game route actions and Lineup tab.

**Interfaces:** Add `replaceGameLineups({ gameId, expectedGameRevision, teams: Array<{ entryId:string; slots:Array<{ slot:1|2|3|4|5; playerId:string|null }> }> }): Promise<{ gameId:string; gameRevision:number; readyA:boolean; readyB:boolean }>`. Require exactly the game's two team entries and exactly five slot objects each; null player IDs are valid drafts. Agent fields are not accepted from this editor; preserve or clear server-side as section 2.4 specifies.

- [x] Test empty/partial/full lineups, invalid/duplicate slots, wrong tournament/team, duplicate player within a team and across both teams, new selection outside current roster, retained historical selection, illegal historical carryover to another game/team, substitutions only affecting the edited game, and preserved agent assignment when reordering the same player. Test stale save, completed-game edit rejection, and rollback after a replacement insertion fails. Assert readiness is computed from five valid players, never from a client-supplied flag.
- [ ] Run the new server and component tests; verify expected failures.
- [x] Implement validation against current DB data and the same game's persisted selections, then replace both teams' lineups atomically. Use player IDs rather than display names; duplicate names must remain distinguishable. Show 3/5-style preparation status and historical-membership badges. Never fill or copy lineups implicitly.
- [x] Require `pnpm exec vitest run --project server src/lib/server/services/lineups.test.ts`, `pnpm exec vitest run --project client`, and `pnpm check` to pass. Extend the browser journey with six available players, a game-two substitution, and unchanged game-one selections.
- [ ] Commit `feat: add per-game lineups with historical preservation`.

### Task 7 / 3G: One reusable match-wide veto editor

**Files:** Create `services/vetoes.ts`, `.test.ts`; add `VetoEditor.svelte` and `VetoEditor.svelte.test.ts`; extend both match and game route actions/tabs. Reuse `game-preparation.ts`; do not write another conflict algorithm.

**Interfaces:** Add `replaceMatchVeto({ matchId, expectedMatchRevision, actions, applyToDraftGames?: Array<{ gameId:string; expectedGameRevision:number }> }): Promise<{ matchId:string; matchRevision:number; changedGames:Array<{ gameId:string; gameRevision:number }> }>`. Action input contains `{ id?:string, action:'ban'|'pick'|'decider', mapId:string, actingEntryId:string|null, gameNumber:number|null, sideChooserEntryId:string|null, sideChoice:'attack'|'defense'|null }`; array order determines contiguous stored sequence. New IDs are server generated; supplied IDs must already belong to this match. Missing `applyToDraftGames` never authorizes game changes.

- [x] Test same-team consecutive picks, neutral decider, future game assignment, reorder without transient unique-index failure, repeated map/number rejection, map outside pool, unrelated actor/chooser, invalid ban metadata, and half-filled side choice. Test that reorder alone does not change games; assignment removal preserves game data; a conflicting draft update needs explicit consent and all expected revisions; terminal games block; any failure rolls back both veto and propagated game changes.
- [ ] Run new service/component tests and verify the expected missing-behavior failures.
- [x] Implement full-set replacement in one transaction, preserving existing action IDs and using a delete/reinsert strategy to avoid transient sequence-uniqueness collisions. Provide a conflict preview and explicit draft-game propagation, not automatic overwrites. Use the same component/service from both workspaces and show that this edits the entire match. A veto save must not require a game to exist.
- [x] Require focused tests, preparation/games tests, `pnpm exec vitest run --project client`, and `pnpm check` to pass. Browser-test a BO5 veto with two consecutive same-team picks, assignment before creation, game prefill, and viewing the same veto from two games.
- [ ] Commit `feat: add shared veto editor and explicit draft reconciliation`.

### Task 8 / 3H: Prove the full management milestone and correction paths

**Files:** Complete `tests/phase3-management.e2e.ts`, `tests/phase3-conflicts.e2e.ts`; add `services/management-concurrency.test.ts` and `services/management-reopen.test.ts`; update test isolation in `playwright.config.ts`, `docs/PLAN.md`, and `README.md`. Add a new migration only if a proven gap from the preceding tasks requires one, and test its populated upgrade here.

**Interfaces:** Consume the preceding public commands and real named actions. No new product subsystem. Test environment uses a disposable `DATABASE_URL` and `ASSET_DIR`, never the normal local database/assets. The restart proof must close all DB handles and start a new app/DB process, not merely open a second browser page.

- [x] Add deterministic two-connection tests for simultaneous game creation, concurrent distinct-game finalizations, participant swap versus game creation, roster removal versus lineup save, and map-pool removal versus new veto/game reference. Accept a valid serialized result or a surfaced conflict; assert no wrong-team scores, orphaned references, lost lineup, duplicate game slot, or partial result commit. Add two-browser stale-save tests preserving the losing operator's full draft. Add a fresh-process reopen test covering the complete saved setup.
- [ ] Run the new tests before completing reliability handling; ensure concurrency tests are not secretly using only one connection/transaction.
- [x] Finish cross-tab draft/revision synchronization, deep links, loading/error states, keyboard operation, dependency-specific confirmations, and reload/review flow. Do not silently retry a mutation with a newer revision token. Keep named actions validating IDs server-side regardless of selectors.
- [x] Run `pnpm check`, `pnpm exec vitest run --project server`, `pnpm exec vitest run --project client`, `pnpm exec playwright test tests/phase3-management.e2e.ts tests/phase3-conflicts.e2e.ts`, `pnpm lint`, and `pnpm build`. All newly introduced tests must pass and checks must have no new diagnostics. Record unrelated baseline failures separately, not as passes. Verify migration recreation and `PRAGMA foreign_key_check` on the disposable DB.
- [ ] Perform the acceptance scenario below, record evidence, update Phase 3 checkboxes only for proved items, and commit `test: verify complete phase 3 management workflow`.

## 5. Final acceptance scenario

Prepare two tournaments with different map pools. Add at least three reusable teams and rosters with more than five players. Create a BO2 match and a BO5 match. Prepare a BO5 veto with consecutive picks by the same team and assign maps to game numbers before creating games.

Create only Game 1; verify that Games 2-5 were not generated. Save a partial lineup, complete it, then prepare a later game with a different fifth player. Remove an earlier player from current roster availability and verify their older game selection remains readable. Change starting sides and verify scores remain under their original teams.

Finalize BO2 2-0, correct one result to 1-1, reopen a game to make the series incomplete, and refinalize it. Exercise a match-wide exceptional result and explicitly clear it back to derived results. Exercise a veto change that requires an explicit draft-game update, and prove a completed game cannot be overwritten through that path.

Use a second operator browser to trigger stale tournament, lineup, veto, and result saves. Confirm all losing drafts remain visible and no replacement happens automatically. Stop the application, close its DB handles, start it again, and reopen every prepared record. Verify the same setup remains, without opening graphics, connecting providers, or adding manual player statistics.

## 6. Delivery and scope boundaries

Recommended review sequence is 3A -> 3B -> 3C -> 3D -> 3E -> 3F -> 3G -> 3H. Each step includes its own tests; the final step adds cross-feature proof rather than postponing all testing.

The highest-risk reviews are results and transactional corrections (3A/3E), historical lineup eligibility (3F), and veto reconciliation/concurrency (3G/3H). Prefer small commits and one coherent reviewed integration branch over a single unreviewable patch. Repository writes or implementation require the user's next instruction; this downloaded plan does not perform them.

The existing plan separately records Phase 2 target-network catalogue refresh and another-machine LAN verification. Do not mark those checks complete merely because this phase's local tests pass. Authentication and release-network safety retain their existing pre-public-exposure gate.

### Sources used during planning

Repository: `docs/PLAN.md`; `docs/TECH-SPEC.md`; `README.md`; `AGENTS.md`; `package.json`; `vite.config.ts`; `playwright.config.ts`; the schema/service/route/test files listed in section 1; `src/routes/admin/+layout.svelte`.

External verification: Skeleton's official Svelte Tabs documentation (controlled/navigation tabs); Drizzle's official Transactions documentation; SQLite's official Transaction documentation. The SvelteKit 3 documentation page could not be fetched during this session; framework-specific implementation must be checked against the installed preview's documentation and compiler, not copied from SvelteKit 2 assumptions.
