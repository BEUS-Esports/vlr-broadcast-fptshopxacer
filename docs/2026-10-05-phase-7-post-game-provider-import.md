# Phase 7 — Provider-Neutral Post-Game Statistics Import

> For agentic workers: implement this plan task-by-task using the repository's existing SvelteKit page/action -> domain service -> Drizzle/libSQL architecture. Preserve unrelated working-tree changes and existing Phase 1-6.1 behavior. This phase adds provider retrieval and import around the canonical Phase 4 statistics model; it does not replace manual entry or introduce a general plugin framework.

**Goal:** Add a safe post-game import workflow with HenrikDev as the primary provider and ValoSpectra as a side-by-side secondary provider. Both must feed one normalized review/import pipeline and the same canonical per-game statistics records used by manual entry.

**Architecture:** Provider-specific code owns authentication, retrieval, polling and payload decoding only. It must normalize candidate/report data before returning it to shared identity validation, mapping, conflict preview and transactional import services. The operator explicitly selects and confirms a report. A provider response must never silently choose a local game, overwrite a manual correction, change the live game, switch the Live Data HUD, or select an MVP.

**Priority:** Implement HenrikDev first because its current API contract is better understood and supports recent-match discovery plus exact match detail. Implement Spectra against the same normalized contract after the shared review/import path exists.

**Manual fallback:** The existing Post-Game Report editor remains fully functional with no provider configured or reachable.

**Source status at planning time:**

- HenrikDev upstream currently identifies the API as v4.5.0 and requires a server-side API key. Current Basic-key documentation states 30 requests/minute.
- HenrikDev usage must follow its current consent/use requirements. For this tournament workflow, only query Riot IDs belonging to participants whose data use is authorized for the event.
- Spectra post-game remains a separate hosted statistics service from the self-hosted live provider. Successful event-specific hosted report retrieval still needs real verification.

---

## Approved Phase 7 decisions

### HenrikDev is primary, not exclusive

The Post-Game Report operator surface exposes both sources side-by-side:

- HenrikDev — recommended/default post-game import path.
- ValoSpectra — secondary post-game import path.
- Manual entry — always available and never hidden behind provider state.

Do not implement automatic fallback between providers. The operator chooses which provider to query and which report to import.

Only one imported report is authoritative for a local game at a time. Previewing the other provider is allowed, but replacing an already associated provider/report requires an explicit review and confirmation.

### One shared normalized report contract

Provider adapters must not write database rows directly.

Suggested provider-neutral contracts:

    export type PostGameProviderId = 'henrikdev' | 'spectra';

    export type PostGameCandidate = {
        provider: PostGameProviderId;
        ref: string;
        externalMatchId: string | null;
        startedAt: string | null;
        map: {
            externalId: string | null;
            name: string | null;
        };
        score: {
            teamA: number | null;
            teamB: number | null;
        } | null;
        participants: Array<{
            externalPlayerId: string | null;
            riotId: string | null;
            teamKey: string | null;
        }>;
    };

    export type NormalizedPostGamePlayer = {
        externalPlayerId: string | null;
        riotId: string | null;
        teamKey: string | null;
        agentExternalId: string | null;
        agentName: string | null;
        kills: number | null;
        deaths: number | null;
        assists: number | null;
        performanceScore: number | null;
        trades: number | null;
        firstBloods: number | null;
        plants: number | null;
        defuses: number | null;
    };

    export type NormalizedPostGameReport = {
        provider: PostGameProviderId;
        externalMatchId: string;
        startedAt: string | null;
        completed: boolean;
        map: {
            externalId: string | null;
            name: string | null;
        };
        teams: Array<{
            key: string;
            score: number | null;
            won: boolean | null;
        }>;
        players: NormalizedPostGamePlayer[];
    };

Exact type names may differ. Preserve the separation:

    HenrikDev payload ---\
                          +--> NormalizedPostGameReport
    Spectra payload -----/

Everything after normalization is shared.

Do not create a generic third-party plugin system in Phase 7.

### Discovery and confirmation are separate steps

The workflow is deliberately two-stage:

    Fetch candidates
        -> choose candidate
        -> fetch/normalize exact report
        -> map/validate
        -> preview diff
        -> explicit confirm
        -> transactional save

A recent-match result is not itself permission to import.

### HenrikDev operator flow

Use an existing lineup player's saved players.riotId as the discovery anchor.

Recommended panel:

1. Select an anchor player from lineup participants that have a Riot ID.
2. Fetch recent matches.
3. Display a bounded list of candidate matches with map, start time, score/status and enough participant identity to recognize the game.
4. Operator selects the intended match.
5. Fetch exact match detail by external match ID.
6. Normalize and run shared mapping/validation.
7. Show review/diff.
8. Confirm import.

If no lineup player has a Riot ID, explain that HenrikDev discovery is unavailable until a Riot ID is saved. Manual entry and Spectra remain available.

An optional direct external match ID input may be added as an advanced recovery path, but it must still pass the same review and validation.

For the expected event deployment, default configuration may use AP affinity and PC platform, but keep these server-side configurable rather than hard-coding event geography into domain logic.

### Spectra operator flow

Recommended panel:

1. Enter or use the configured group code.
2. Fetch report.
3. If the hosted service reports pending/not-ready, use bounded provider-specific polling.
4. Once a report exists, normalize it.
5. Run the same mapping/validation and review/diff used by HenrikDev.
6. Confirm import.

Spectra report polling is not part of the Phase 6 live-provider coordinator and must not share its retry/failover state machine.

No Spectra post-game action may enable/switch the live HUD or alter live provider selection.

### Identity matching is conservative

Local player identity is the saved game lineup player ID.

Provider identity is evidence used to map onto that lineup.

Preferred automatic player mapping:

1. exact normalized Riot ID match against players.riotId;
2. if provider exposes a stable external player ID and a previously approved mapping exists in the current review context, use it only for that report;
3. otherwise require explicit operator mapping.

Do not map players solely by displayName.

Do not mutate the player's saved Riot ID because a provider returned a different name/tag. That is a separate profile correction.

Team mapping should derive from uniquely mapped lineup participants where possible. Provider Blue/Red or equivalent team keys are provider-side identities, not local Team A/B, Left/Right, Attacker/Defender, or tournament entry IDs.

### Local-game validation

Before an import can be confirmed, compare the normalized report against the selected local game:

- report is completed where the provider supplies completion state;
- external match ID is present;
- map matches the local game when both sides have a known map;
- both local tournament entries can be mapped;
- provider participants can be mapped to saved lineup players;
- no provider player maps to two local players;
- no local player receives two provider rows;
- provider score/result is compatible with the local final result when both are known;
- suspicious start time or participant mismatch is surfaced prominently.

A mismatch may be:

- blocking when identity is contradictory;
- review-required when identity is incomplete but plausibly correct.

The operator must never be able to bypass a hard contradiction with a generic "import anyway" button. If a legitimate event case needs an exception, model a specific reviewed correction path.

### Canonical stats remain the destination

Imports write to:

- game_player_statistics;
- game_statistics_meta;
- game_lineups.agentId where an approved provider agent mapping is applied.

Do not create HenrikDev statistics tables or Spectra statistics tables.

Do not store the full provider payload in the canonical statistics tables.

Detailed event persistence remains out of scope unless a later approved graphic/data requirement explicitly needs it.

### Metric policy

Phase 7 must distinguish:

- directly reported fields;
- safely derived event fields;
- unsupported/unknown fields.

For HenrikDev, K/D/A and agent are direct candidates after payload validation.

Performance Score remains a separate Riot-facing statistic and must not be populated from HenrikDev players.stats.score unless that relationship is independently verified.

Plants and defuses may be derived from authoritative round plant/defuse events if the current payload contract is verified.

First Bloods may be derived only if the rule is explicit and tested: the credited killer of the earliest valid player kill in each played round. Do not count non-player/environmental events as a first blood without a verified rule.

Trades remain null until an approved trade definition/window is documented and tested. Do not invent a trade algorithm during implementation.

Unknown or unavailable values remain null, never zero.

Spectra follows the same canonical metric meanings. Provider-specific names must normalize into those meanings or remain unavailable.

### One authoritative import association per local game

game_statistics_meta continues to identify the current associated import source and external match ID.

Add database protection so the same source + external match ID cannot be associated with two different local games.

A report already associated with the current game is a reimport.

A different report or different provider associated with a game is a replacement and requires explicit confirmation after review.

Do not blend values from HenrikDev and Spectra silently.

---

## Global constraints

- Preserve the existing Info -> Lineup -> Map Veto -> Agent Select -> Post-Game Report game-tab order.
- Preserve manual editing before, during and after provider work.
- Provider secrets are server-only and must never reach page data, client JavaScript, OBS URLs, broadcast snapshots, logs or error messages.
- Provider HTTP calls originate from the app server.
- Bound outbound requests with timeout/abort behavior.
- Treat HTTP 429 distinctly from generic provider failure and show a useful operator error.
- Do not poll HenrikDev continuously. Discovery/detail fetches are explicit operator actions.
- Spectra pending polling must be bounded and cancellable when the page/game context changes.
- Provider fetch state is not persisted as broadcast state.
- Fetching or previewing a report does not bump the game revision.
- Import confirmation is revision checked.
- A late fetch response for Game A must not be importable into Game B after navigation/selection changes.
- Do not auto-finalize a game result from the provider in Phase 7.
- Do not auto-select MVP.
- Do not update tournament rosters or player profiles from provider data.
- Do not reintroduce direct Riot API/RSO work through this phase.
- Do not expose a "force overwrite everything" path that bypasses provenance checks.

---

## Task 0 — Lock the provider contract and configuration

Add a focused post-game provider domain separate from src/lib/server/live.

Suggested structure:

    src/lib/post-game/
        types.ts
        mapping.ts

    src/lib/server/post-game/
        config.ts
        providers/
            henrikdev.ts
            spectra.ts

Exact directories may differ, but do not put post-game report fetching into the Phase 6 live-provider coordinator.

### Configuration

HenrikDev server configuration should cover:

- API base URL, default https://api.henrikdev.xyz;
- API key from a server-only environment variable;
- affinity/region, default event value AP unless deployment overrides it;
- platform, default PC;
- request timeout;
- bounded candidate count.

Spectra server configuration should reuse or extend the existing server-only Spectra settings without assuming the live outgoing service hosts statistics.

Add .env.example entries with empty/safe defaults and no real credentials.

Validate malformed URLs/configuration at the boundary.

### HenrikDev request behavior

Implementation should confirm the current OpenAPI contract before coding final paths. The expected v4 flow is:

    recent match discovery:
    /valorant/v4/matches/{affinity}/{platform}/{name}/{tag}

    exact match detail:
    /valorant/v4/match/{affinity}/{matchId}

Send the API key through the documented Authorization request header.

Do not make provider version/path strings part of the shared import service.

### Focused proof

- secrets never appear in serialized config;
- missing HenrikDev key marks HenrikDev unavailable without breaking the page;
- malformed provider URL fails safely;
- timeout and 429 become typed provider errors;
- Spectra and HenrikDev configuration can be independently available/unavailable.

---

## Task 1 — Build fixtures and strict provider decoders first

Before UI work, record representative fixtures under tests/fixtures or the existing fixture convention.

Required HenrikDev fixtures:

- recent-match list with the intended custom/event game;
- exact completed match detail;
- incomplete/pending-like response if applicable;
- malformed/partial player;
- missing round event;
- 429/error envelope.

Required Spectra fixtures:

- known successful post-game shape from current source/types;
- pending/no-player-data response;
- malformed/partial player;
- reused group-code candidate shape.

When real Spectra success data is still unavailable, label the fixture provenance clearly. Do not claim real verification from source-code types.

Provider adapters must validate unknown external data. Do not cast response.json() directly to trusted internal types.

### Focused proof

- malformed external numbers/IDs are rejected or normalized to null per field policy;
- missing optional event data does not turn into zero;
- provider team keys remain provider-local;
- exact match ID is retained;
- raw provider-only fields do not leak into the normalized contract.

---

## Task 2 — Implement HenrikDev adapter first

Create a server-only HenrikDev client with two operations:

    discoverRecentMatches(...)
    fetchMatchDetail(...)

The adapter must:

- parse a local Riot ID into name/tag safely;
- URL-encode dynamic path segments;
- use the configured affinity/platform;
- include Authorization;
- use AbortSignal/timeout;
- classify 401/403, 404, 429, 5xx and malformed JSON separately enough for useful operator feedback;
- cap candidate results;
- normalize exact detail into NormalizedPostGameReport.

Do not retry 4xx blindly.

A single operator Fetch Recent Matches action should stay comfortably inside Basic-key limits; nevertheless, display rate-limit errors rather than hammering the service.

### Candidate ordering

Show newest plausible matches first.

Do not automatically choose the first result.

Prefer filtering or ranking candidates using:

- selected game's known map;
- local lineup Riot IDs present in candidate;
- start time proximity if local scheduling data is meaningful;
- completed state.

Ranking is a UI aid only. It must not turn into implicit import selection.

### Henrik-derived metrics

Implement only metrics whose semantics are approved in this document.

Write pure helper tests for any event derivation such as plants/defuses/first bloods.

Leave trades null.

Leave Performance Score null unless a verified source provides that exact metric.

### Focused proof

- encoded Riot IDs;
- no Riot ID available;
- candidate list empty;
- candidate ordering;
- exact detail mismatch;
- K/D/A normalization;
- plant/defuse derivation;
- first-blood derivation;
- missing rounds/kills leaves relevant derived fields null/partial rather than invented zero;
- API key redaction from errors.

---

## Task 3 — Implement the shared report mapping/validation service

Suggested pure/server module:

    src/lib/server/post-game/review.ts

Input:

- selected local game management/read model;
- normalized provider report;
- optional operator mapping choices.

Output should contain:

- match-level validation findings;
- team mapping;
- player mapping proposals;
- unresolved mappings;
- per-player normalized proposed values;
- local current values;
- conflict status;
- whether confirmation is currently allowed.

### Player mapping states

Each provider player should be one of:

- exact — unique exact Riot ID match;
- manual — explicitly mapped by operator;
- unresolved;
- conflicting.

Do not silently discard an unmatched provider player if it makes the report identity suspicious.

Observers/coaches should not be forced into the ten-player game mapping.

### Map and score

Map comparison should use existing game resources where possible:

- exact external ID if local resources preserve a compatible ID;
- otherwise normalized canonical map name.

Do not compare by loose substring matching.

If local result is still draft, provider score is review information only; import must not finalize it.

If local final score contradicts the provider, block import until the local result/report selection is corrected.

### Focused proof

- all ten exact mappings;
- one missing Riot ID -> manual mapping;
- renamed Riot ID -> manual mapping;
- duplicate Riot ID evidence -> conflict;
- wrong map;
- wrong opponent/player set;
- reversed provider team colors still maps correctly;
- substitution lineup;
- observer ignored;
- contradictory local final score.

---

## Task 4 — Resolve Phase 4 provenance gaps before enabling import

Add a forward migration after the current migration head.

### Database changes

At minimum:

1. Add a unique index/constraint covering non-null game_statistics_meta(import_source, external_match_id) so one provider report cannot belong to two local games.
2. Add player-level provenance for manual agent corrections. A practical minimal field is agent_manually_edited_at on game_player_statistics, because agent identity is stored in game_lineups but import conflict ownership is per player/game.
3. Preserve imported all-null rows instead of deleting them implicitly.

If implementation proves agent provenance belongs better in a small dedicated per-player provenance table, that is acceptable, but do not build a general audit subsystem.

### Agent-only manual edits

saveGameAgents() must update the player's agent manual-edit provenance when the agent actually changes after an import.

Do not mark unrelated statistics as edited solely because the agent changed.

Review UI may conservatively group stat conflicts per player, but agent conflict must be distinguishable from stat conflict.

### Imported all-null manual-clear rows

Current Phase 4 behavior deliberately keeps an imported row if the operator clears all imported stat fields to null.

That row blocks silent lineup identity replacement, which is correct, but Phase 7 must provide an explicit resolution path.

Add an operator action such as:

- Discard Saved Player Statistics / Resolve Imported Player Data.

It must:

- clearly identify the local player and current provider association;
- require confirmation;
- delete only that player's canonical stats/provenance row;
- not silently alter the lineup;
- bump the game revision transactionally;
- leave the rest of the imported game intact.

After the explicit discard, normal lineup correction rules may permit the player identity change.

A later reimport must review mapping against the corrected lineup again.

### Focused proof

- duplicate external report association rejected at DB/service layer;
- agent-only edit creates agent conflict but not fake stat edits;
- clearing all imported metrics retains a protected row;
- explicit discard removes the protection only for that player;
- stale discard rejected;
- transaction rollback preserves row on failure.

---

## Task 5 — Build the import preview and conflict engine

Do not import directly from the provider response.

Create a proposed import object from the normalized report + approved mapping.

For each local player show:

- provider identity;
- local player identity;
- agent: current -> proposed;
- K/D/A: current -> proposed;
- Performance Score;
- Trades;
- First Bloods;
- Plants;
- Defuses;
- source availability;
- conflict markers.

### Conflict semantics

First import:

- existing manual values that differ from proposed imported values are conflicts;
- null local value -> known provider value is non-destructive fill;
- known local value -> provider null must not erase the local value by default.

Reimport of the same source + external match ID:

- unchanged provider values are idempotent;
- imported values may refresh when no later manual correction exists;
- any player with manual stat provenance newer than the prior import gets a conflict before replacing stat fields;
- any player with agent manual provenance newer than the prior import gets an agent conflict.

Provider replacement:

- changing source or externalMatchId is always explicit;
- preview all affected players;
- never treat existing imported values as permission to silently replace with a different provider/report.

### Replacement controls

Prefer explicit scoped choices rather than one dangerous force flag:

- Keep local/manual value;
- Use provider value for this conflicted player/field group;
- Cancel import.

If field-level resolution is unnecessarily complex for Phase 7, player-level resolution is acceptable, but agent and statistics must remain distinguishable.

Do not allow a stale review generated for an old game revision to be confirmed.

### Focused proof

- first import over blank stats;
- first import vs existing manual data;
- same report imported twice;
- same report after one player manual correction;
- agent-only correction;
- provider null vs local known value;
- provider replacement;
- stale review/revision.

---

## Task 6 — Implement the transactional import command

Suggested service:

    importPostGameReport({
        gameId,
        expectedGameRevision,
        reviewedReportTokenOrPayload,
        mappings,
        resolutions
    })

Do not trust client-supplied normalized statistics blindly. The server must bind confirmation to server-validated provider/report data and the current selected game/revision.

Implementation choices may use a short-lived server-side review token/cache or submit enough immutable provider identifiers for the server to refetch/revalidate before commit. Do not put secrets or an unrestricted raw trusted import object in hidden client form data.

### Transaction responsibilities

Within one transaction:

1. bump/lock the game revision;
2. verify tournament/game is writable under existing rules;
3. reload current lineup/current stats/meta;
4. verify mappings still target current lineup players/entries;
5. verify external source/report association uniqueness;
6. re-check manual conflict provenance against the reviewed baseline;
7. update approved agent mappings;
8. upsert canonical statistics;
9. update import source, externalMatchId and importedAt;
10. preserve manual timestamps as historical provenance while importedAt advances past explicitly resolved conflicts;
11. return refreshed canonical stats/revision.

Do not update:

- broadcast state;
- live provider mode;
- game MVP;
- tournament MVP;
- match MVP;
- final game score/result.

### Idempotency

Reconfirming the same unchanged report should produce no duplicate rows and no semantic corruption.

Whether a no-change reimport bumps the game revision may follow existing service conventions, but document and test the behavior. Prefer avoiding a revision bump if the command can prove there is no persisted change safely.

### Focused proof

- transaction rollback mid-import;
- duplicate source/report attached to another game;
- stale expected revision;
- lineup changed after review;
- manual edit after review;
- no-change reimport;
- replacement import.

---

## Task 7 — Extend the Post-Game Report operator UI

Keep the existing manual editor in the same tab.

Recommended layout:

    Post-Game Report

    [ HenrikDev — Recommended ]   [ ValoSpectra ]
    [ Manual Statistics editor below / alongside review ]

### HenrikDev card

Show:

- provider configured/unavailable status;
- anchor-player selector containing lineup players with Riot IDs;
- Fetch Recent Matches;
- candidate list;
- Refresh button only on explicit operator action;
- clear 429/auth/network feedback.

Candidate row/card should show enough to recognize the match:

- start time;
- map;
- score when known;
- queue/mode when useful;
- several participant Riot IDs or team summary.

Select Match opens/loads the shared review section.

### Spectra card

Show:

- configured group code or input;
- Fetch Report;
- pending state;
- bounded polling status;
- Stop/Cancel if polling is active;
- provider error without disabling manual entry.

### Shared review section

Show:

- provider + external match ID;
- map and time;
- local vs provider score;
- team mapping;
- all player mappings;
- unresolved mapping controls;
- proposed stats diff;
- manual-conflict warnings;
- Import/Replace confirmation only when validation permits.

Changing candidate, group code, mapping or game context invalidates the previous review confirmation state.

### Manual editor coexistence

Manual edits remain possible even if provider fetch fails.

If the operator manually saves while a review is open, invalidate or refresh the review because the game revision/provenance changed.

### Accessibility/operator clarity

- provider source labels are explicit;
- Recommended does not imply automatic selection;
- destructive replacement text names the existing and new source;
- error/pending states use text, not color alone;
- keyboard operation remains usable.

---

## Task 8 — Add provider-aware integration tests

### Server/provider tests

Cover HenrikDev:

- auth header;
- path encoding;
- timeout;
- 429;
- malformed JSON;
- candidate discovery;
- exact report.

Cover Spectra:

- success;
- pending;
- bounded polling;
- cancellation;
- malformed response;
- unavailable hosted service.

Mock outbound HTTP. Unit/integration tests must not depend on public network availability.

### Domain/import tests

Cover:

- wrong map;
- wrong player set;
- duplicate mappings;
- substitution;
- duplicate external report;
- first import;
- idempotent reimport;
- manual stat conflict;
- agent-only conflict;
- all-null manual-clear protection;
- explicit player-data discard;
- provider replacement;
- stale review;
- transaction rollback.

### Page/component tests

Cover:

- HenrikDev prioritized visually without hiding Spectra;
- no Riot ID state;
- candidate selection;
- manual mapping;
- diff visibility;
- conflict confirmation;
- manual editor remains usable during provider error;
- stale save preserves useful operator context.

### Browser journey

Create a deterministic Playwright route using mocked provider responses:

1. open a prepared game;
2. select Post-Game Report;
3. fetch HenrikDev candidates;
4. select the correct match among at least two;
5. review ten-player mapping;
6. confirm import;
7. verify canonical scoreboard;
8. manually correct one value;
9. refetch/reimport;
10. verify conflict prevents silent overwrite;
11. keep manual value or explicitly replace;
12. reload and verify persistence.

Repeat a shorter path for Spectra through the same review/import UI.

---

## Task 9 — Verify real provider behavior without overstating proof

### HenrikDev real acceptance

Before broadcast-ready status, verify with an authorized completed Valorant match representative of event operation:

- the intended Riot ID can discover the match;
- exact match detail is retrievable;
- custom/event queue behavior is understood;
- all ten players appear as expected;
- map/result identities match;
- required K/D/A and agent fields are present;
- round plant/defuse/kill event fields used for derived metrics are actually present and semantically correct;
- request count is well within the configured key limit.

Record sanitized observations/fixture shape without committing the API key or unnecessary personal data.

### Spectra real acceptance

When a completed Spectra-hosted report is available:

- verify hosted statistics endpoint access;
- verify pending -> ready behavior;
- verify group-code reuse behavior;
- verify external match identity;
- verify participant/team/stat shapes;
- compare normalized output against the same local game review pipeline.

Until this succeeds, Spectra post-game remains implemented from source/type/fixture evidence but not declared event-proven.

### Manual fallback acceptance

With both providers disabled/unreachable:

- Post-Game Report page loads;
- manual stats save/correction works;
- aggregation/graphics continue from canonical records;
- no provider secret/config is required for manual operation.

---

## Task 10 — Documentation and release checks

Update:

- docs/TECH-SPEC.md with final provider-neutral post-game ownership and verified endpoint details;
- docs/PLAN.md Phase 7 completion state;
- .env.example;
- operational README only where event setup needs environment variables;
- a Phase 7 verification document recording automated and real-provider proof separately.

Document:

- HenrikDev consent/use requirement;
- key location and server-only handling;
- actual configured affinity/platform;
- Spectra hosted stats dependency;
- manual fallback procedure;
- unresolved derived metrics, especially Trades;
- real provider verification status.

Run the normal repository checks:

    pnpm test
    pnpm check
    pnpm lint
    pnpm build

Add focused Playwright coverage and run the provider-import journey.

---

## Done when

Phase 7 is complete when all of the following are true:

1. HenrikDev and ValoSpectra appear side-by-side in Post-Game Report, with HenrikDev clearly recommended but neither used automatically.
2. HenrikDev recent-match discovery lets the operator choose the intended match and inspect exact detail.
3. Both providers normalize into one shared report contract before any local mapping/import logic.
4. Match/map/team/player identity is reviewed against the selected local game.
5. Manual/unresolved player mappings are explicit.
6. Imports populate the same canonical statistics records as manual entry.
7. The same provider report cannot be attached to two local games.
8. Duplicate/repeated import is idempotent.
9. Later manual stat corrections are never silently replaced.
10. Agent-only manual corrections have explicit conflict provenance.
11. An imported all-null manually cleared row has an explicit discard/resolution path before lineup identity replacement.
12. Provider null does not silently erase known local data.
13. Performance Score is not incorrectly populated from HenrikDev score.
14. Trades remain unavailable until an approved definition exists.
15. No import changes live HUD mode, broadcast selection, final game result or MVP.
16. Provider failure leaves manual entry fully usable.
17. HenrikDev has one recorded real-match acceptance result.
18. Spectra real hosted-report verification is recorded when available, or clearly remains an unresolved release dependency rather than being falsely marked proven.
19. Provider secrets remain server-only.
20. Tests cover late/stale responses, concurrency, duplicate association, mapping mismatch, manual conflicts and transaction rollback.

---

## Suggested commit checkpoints

    feat: add post-game provider contracts and config
    feat: add henrikdev post-game adapter
    feat: add post-game report mapping and review
    feat: add import provenance and conflict handling
    feat: add provider-neutral statistics import
    feat: add post-game provider controls
    feat: add spectra post-game adapter
    test: cover post-game provider import workflow
    docs: record phase 7 verification

These are logical checkpoints, not a requirement to force commits when the working tree should be preserved differently.
