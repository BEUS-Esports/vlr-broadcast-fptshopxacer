# Phase 6 — Live providers and external-data HUD

Recorded: 2026-10-03

## Purpose

Phase 6 connects live VALORANT data to the broadcast controller without making either provider schema part of the graphics contract.

The application owns one normalized live-game model. ValoSpectra and GStack are adapters into that model. The In-Game and live Agent Select graphics consume only the normalized model plus the existing local broadcast snapshot.

The Phase 5/5.1 graphics have now been tested with the game. The existing native-HUD-safe In-Game treatment is therefore the known fallback path while Phase 6 adds the provider-backed external-data HUD.

This plan is intentionally provider-specific at the ingestion edge and provider-neutral everywhere else. Do not build a generic plugin framework.

## Decisions locked before implementation

1. The application data shape is authoritative for graphics. Spectra and GStack payload types must not leak into Svelte HUD components.
2. Saved tournament, match, game, lineup, veto, side, team, score, and operator records remain authoritative. Provider observations never silently rewrite them.
3. Persistent/prepared broadcast state and volatile live telemetry are separate data lanes.
4. Do not republish the complete Phase 5 BroadcastSnapshot for every telemetry update. Live telemetry receives its own stream and versioned decoder.
5. One server process owns one active upstream provider session. Opening more controller, Preview, Large Preview, or OBS pages must not create more Spectra/GStack upstream connections.
6. Missing telemetry is not zero. Blank/unavailable values normalize to null; a measured zero remains 0.
7. Missing Player/Expansion Client data is normal capability loss, not provider failure.
8. Provider health and the on-air HUD mode are independent. Recovery never automatically switches from native fallback back to the external-data HUD.
9. GStack left/right positions and Spectra presentation order are observations, not Match Team A/B identity.
10. Spectra supporter/license state is checked through GET /getOrgForKey?key=<ACCESS_KEY> on the extras service. Do not depend on undocumented license fields being present in match_data.
11. Provider credentials remain server-only. They must never appear in OBS URLs, BroadcastSnapshot, live telemetry SSE, browser console output, or View Data.
12. Spectra-Frontend-VAL26 is the main presentation/layout reference for the external-data HUD, adapted to Svelte and our own normalized model. Do not inherit its Angular data plumbing.
13. View Data is part of the Phase 6 operator workflow. It must expose enough current data to distinguish a provider problem from an adapter/mapping/rendering problem.

## Provider transport reference

Protocol-level details now live in [LIVE-PROVIDER-TRANSPORT.md](./LIVE-PROVIDER-TRANSPORT.md).

That document owns:

- ValoSpectra Socket.IO logon/`match_data` behavior;
- Spectra extras/supporter lookup;
- GStack `/livenow` full-state snapshots;
- GStack VHUD WebSocket ports and `[ExecuteScript]` / `[ExecuteJSON]` messages;
- the strict allowlisted GStack command parser;
- confirmed GStack shield and round-history encodings;
- snapshot + delta accumulator/reconnect behavior;
- remaining provider-specific verification items.

This Phase 6 plan should reference that contract rather than duplicate wire-level protocol details.

## Architecture

~~~text
                    server-only provider configuration
                                  |
                                  v
                +-----------------------------------+
                | LiveProviderCoordinator           |
                | - source generation/session token |
                | - health/retry/fallback state     |
                | - selected local-game binding     |
                +----------------+------------------+
                                 |
                 +---------------+---------------+
                 |                               |
                 v                               v
        SpectraProvider                  GStackProvider
        Socket.IO + extras               WS or one HTTP reader
                 |                               |
                 +---------------+---------------+
                                 |
                                 v
                         provider adapter
                                 |
                                 v
                        Normalized LiveGameState
                         /                     \
                        /                       \
                       v                         v
              Live telemetry SSE          View Data diagnostics
                       |
                       v
          In-Game / live Agent Select renderer
                       |
            +----------+----------+
            |                     |
            v                     v
      External-data HUD       Native fallback
~~~

The existing BroadcastSnapshot still supplies canonical context such as selected tournament/match/game, team branding, prepared lineup, presentation order, starting/current sides, series score and map information.

The live stream supplies only volatile observations.

## Shared normalized contract

The exact type names may change during implementation, but the semantics should remain close to the following.

~~~ts
type LiveProviderId = 'spectra' | 'gstack';

type LiveGamePhase =
  | 'unknown'
  | 'lobby'
  | 'agent-select'
  | 'buy'
  | 'combat'
  | 'post-round'
  | 'game-end';

type LiveProviderHealth =
  | 'disabled'
  | 'connecting'
  | 'live'
  | 'retrying'
  | 'fallback'
  | 'ready'
  | 'error';

type LiveAbilityState = {
  grenade: number | null;
  ability1: number | null;
  ability2: number | null;
};

type LiveUltimateState = {
  ready: boolean | null;
  current: number | null;
  required: number | null;
};

type LiveShieldState = {
  raw: string | null;
  kind: 'none' | 'light' | 'heavy' | 'regen' | 'standard' | 'unknown';
  current: number | null;
  extra: number | null;
};

type LivePlayerCapabilities = {
  health: boolean;
  abilities: boolean;
  enhancedHealth: boolean;
  enhancedShield: boolean;
  scoreboard: boolean;
};

type LivePlayerState = {
  providerKey: string;
  providerSlot: number | null;

  playerId: string | null;
  entryId: string | null;

  observedName: string | null;
  agent: string | null;
  weapon: string | null;

  alive: boolean | null;
  observed: boolean | null;
  hasSpike: boolean | null;

  health: number | null;
  extraHealth: number | null;
  shield: LiveShieldState;

  kills: number | null;
  deaths: number | null;
  assists: number | null;
  credits: number | null;

  ultimate: LiveUltimateState;
  abilities: LiveAbilityState;
  capabilities: LivePlayerCapabilities;
};

type LiveTeamState = {
  providerSide: 'left' | 'right' | 'team-0' | 'team-1';
  entryId: string | null;
  observedName: string | null;
  score: number | null;
  attacking: boolean | null;
  players: LivePlayerState[];
};

type LiveSpikeState = {
  state: 'unknown' | 'carried' | 'dropped' | 'planted' | 'defused' | 'detonated';
  carrierPlayerId: string | null;
  raw: string | null;
};

type LiveGameState = {
  version: 1;

  provider: LiveProviderId;
  generation: number;
  selectedGameId: string | null;

  phase: LiveGamePhase;
  roundNumber: number | null;
  map: string | null;

  spike: LiveSpikeState;
  teams: LiveTeamState[];

  roundHistory: {
    leftRaw: string | null;
    rightRaw: string | null;
  };

  receivedAt: number;
};
~~~

Important rules:

- The normalized contract may preserve provider raw fragments for fields whose semantics have not yet been verified, but renderers must not interpret undocumented values.
- GStack empty string -> null.
- GStack string "0" -> numeric 0 when that field is numeric.
- KDA should be parsed only when the complete shape is valid.
- Ultimate Points such as 2/8 normalize to current=2 and required=8.
- Shield R/X/numeric encodings are retained in raw even after a known normalized representation is derived.
- SpikeCarrier and round-history strings remain raw until their encoding is confirmed with fixtures/real sessions.
- Never infer provider death/disconnect from unchanged stats.

## Static and volatile broadcast lanes

Phase 5.1 introduced held per-graphic program publications. Preserve that behavior.

For In-Game:

- static/canonical context comes from the current prepared/publication snapshot;
- live observations come from LiveGameState;
- saving team/game preparation may update Preview without silently replacing a held program publication;
- telemetry continues to update while the live external HUD is on air;
- switching to native fallback stops external live presentation without destroying canonical prepared data.

The live provider stream must not increment controlRevision/dataRevision merely because telemetry changed.

Add a separate versioned envelope and decoder, analogous to the existing broadcast stream:

~~~ts
type LiveGameEnvelope = {
  version: 1;
  stream: {
    epoch: string;
    sequence: number;
  };
  state: LiveGameState | null;
};
~~~

A likely route is:

~~~text
/api/live-game/events
~~~

The exact path is flexible, but it must remain read-only and credential-free.

## Task 0 — Close Phase 5 and establish Phase 6 boundaries

- Record the completed real Valorant/OBS GFX test as the acceptance point for the Phase 5 native/test package.
- Preserve the current native-HUD-safe In-Game implementation as the fallback visual.
- Update PLAN.md and TECH-SPEC.md so Phase 6 is no longer described as speculative future HUD work.
- Correct the Spectra license section so /getOrgForKey is the supported license/supporter lookup. Do not require match_data to contain organization/license fields.
- Record GStack's supplied /livenow, /mapbans and /controlpanel schemas and the Expansion Client behavior.
- Record Spectra-Frontend-VAL26 as the Phase 6 external-HUD visual/layout reference.
- Do not copy bundled third-party fonts or artwork merely because they are present in the reference repository. If source code/assets are actually copied from the ELv2 repository, preserve all required license/notices and mark modifications. Prefer an independent Svelte implementation using our existing resource catalogue.

## Task 1 — Create the live-data domain and strict normalizers

Create a dedicated live-data area rather than expanding BroadcastSnapshot with provider fields.

Suggested boundary:

~~~text
src/lib/live/
  types.ts
  decoder.ts
  selectors.ts

src/lib/server/live/
  coordinator.ts
  publisher.ts
  mapping.ts
  providers/
    spectra.ts
    gstack.ts
~~~

Exact filenames are flexible.

Implement:

- strict normalized types;
- runtime validation of outgoing live envelopes;
- provider-specific parsers that return normalized values or explicit parse errors;
- string/blank/null handling;
- safe KDA and ultimate parsing;
- shield raw preservation;
- per-player capabilities;
- source generation/session number to reject obsolete callbacks;
- fixture builders for both providers.

Keep raw provider types inside their provider modules.

### Acceptance

Unit fixtures can feed equivalent Spectra and GStack observations and receive semantically equivalent LiveGameState values.

Malformed fields cannot crash the coordinator or graphics process.

## Task 2 — Add server-only provider configuration and operational session state

Separate infrastructure credentials from show operation.

### Server-only configuration

Make a new Settings link at the Sidebar. Allow the user to configure between:

- ValoSpectra: either `eu.valospectra.com`, `na.valospectra.com`, and custom. From there, allow the user to set the key (allow blanks if self-hosted/custom) and the Group Code (must not be empty), hit Connect, it will check if we can get the connection. If not, then something is wrong.
  - Once set, the ports are: 5100 for ingesting data from the Spectra Client to the Server (this is not needed); 5200 for the frontend to connect to the frontend (this is used to get the game data from the server); and 5101 is Status Check and other stuff (does not do much if self-hosted).

- GStack: default to `http://localhost:57780`.

Names may be adjusted to project conventions.

The Spectra access key must remain server-only.

### Operator/session configuration

The Graphics Control workspace should allow:

- Source: None / ValoSpectra / GStack
- Spectra group code
- Connect / Disconnect or Enable / Disable provider session
- team/player mapping review
- native fallback / external live HUD mode
- connection/health state
- retry state and next action
- provider attribution state
- View Data

Provider operational state should be server-owned so multiple controllers see one truth.

A new provider selection, endpoint-affecting configuration change, group-code change, or selected local game must increment the source generation and invalidate old timers/callbacks/data.

Do not expose secrets in load data, form responses, SSE, logs, or client-side HTML.

## Task 3 — Implement ValoSpectra

Add the Socket.IO client dependency deliberately; raw WebSocket is not protocol-compatible.

Reference repo: <https://github.com/ValoSpectra/Spectra-Server>

### Live session

- Connect to configured Spectra Socket.IO endpoint.
- On connection emit logon with JSON containing groupCode.
- Handle logon_success.
- Consume match_data.
- Parse JSON defensively.
- Normalize only fields used by our current HUD/Agent Select.
- Preserve missing auxiliary values as null.
- Use Spectra's per-player auxiliary availability to describe capability availability where possible.
- Do not treat unavailable Player Client data as source failure.

### Supporter / watermark lookup

When a Spectra session is configured, call:

~~~text
GET <SPECTRA_EXTRAS_URL>/getOrgForKey?key=<server-only access key>
~~~

Map:

- HTTP 200 + isSupporter=true -> supporter confirmed;
- HTTP 200 + false -> attribution required;
- 401 -> key invalid / attribution required and controller warning;
- unavailable/unsupported/unknown -> supporter not confirmed; attribution-required safe path.

Cache the result for a reasonable session/configuration lifetime; do not call it every telemetry tick.

The access key must never enter View Data.

### Session identity

A single Group Code can be used for multiple matches and tournaments; after all, it only helps to distinguish other users in Spectra.

Group code alone is not sufficient evidence that every received state belongs to the selected local game. Require the configured provider session + selected local game binding and verified team/player mapping before enabling the external HUD.

## Task 4 — Implement GStack

### Transport

Follow [LIVE-PROVIDER-TRANSPORT.md](./LIVE-PROVIDER-TRANSPORT.md).

Use GStack as a snapshot + delta source:

- `/livenow` seeds/resynchronizes the full state;
- the VHUD WebSocket supplies low-latency incremental `[ExecuteScript]` / `[ExecuteJSON]` updates;
- parse `[ExecuteScript]` through a strict static allowlist; never execute vendor script text;
- reconnect/resync with `/livenow` before considering the accumulator fully synchronized;
- browser/OBS clients never connect to GStack directly.

### /livenow normalization

Normalize the supplied schema.

Specific requirements:

- TeamLeft/TeamRight stay provider slots until mapped.
- Player1..Player5 stay provider slots until mapped.
- empty values -> null;
- numeric strings -> safe finite integer/number where appropriate;
- KDA -> kills/deaths/assists only if valid;
- Ultimate Points -> current/required only if valid;
- Skill 1/2/3 -> null when blank;
- XHP/XShield -> null when blank;
- Shield raw value is always preserved;
- confirmed Shield mapping is `X` none, `25` Light, `50` Heavy, `R` Regen;
- ScoreTeamLeft/Right -> nullable numeric score;
- SpikeState -> preserve raw until codes are verified;
- SpikeCarrier -> preserve raw until mask/slot encoding is verified;
- RoundHistoryTeam1/2 -> parse the confirmed `0/1/2/3/4` mapping (`0` none, `1` defuse, `2` elimination, `3` time, `4` detonation) while retaining raw strings;
- PlayerPOV -> diagnostic/live observation only unless a concrete graphic consumes it.

### Expansion Client semantics

Base GStack can remain healthy with ability-charge/XHP/XShield fields unavailable.

When Expansion Client data appears, capability flags should update per player. A player can therefore have richer live fields without changing provider health.

### /controlpanel

Read only when needed for mapping/diagnostics.

Useful observations include configured left/right team names, tags/logos and map labels. They may help the operator identify which GStack side corresponds to which local tournament entry.

They must not update canonical Team/Match/Game/Veto records.

### /mapbans

Diagnostic/comparison only in Phase 6. Our existing map-veto record is authoritative.

## Task 5 — Implement explicit provider-to-local identity mapping

The external HUD needs local branding/identity and provider live observations joined safely.

Mapping order should favor strong evidence and require confirmation when ambiguous.

### Team mapping

The coordinator needs:

~~~text
provider left/team-0 -> local tournament entry
provider right/team-1 -> local tournament entry
~~~

Never convert this into Team A/B ownership automatically.

If provider team names/tags clearly match, prefill a suggested mapping but allow operator review.

### Player mapping

Map each provider player to one of the five players in the selected local game lineup.

Prefer stable provider player IDs where Spectra provides them.

For GStack, names/slots may be the only available evidence. Normalized name matching can suggest a mapping but should not silently select an ambiguous duplicate.

Persist confirmed mapping for the selected game/provider session if required so reconnect does not scramble the HUD.

### Invalid mapping

External HUD cannot enter Live mode when required team mapping is unresolved.

Partial player mapping may still be displayed diagnostically, but any unmapped player must be visibly flagged in control/View Data rather than attached to an arbitrary local player.

Changing selected local game immediately invalidates prior live-state binding and mapping until the new game is valid.

## Task 6 — Add provider health, retry, and sticky native fallback

Implement one server-owned state machine.

Required sequence after an unexpected active-source failure:

~~~text
live
  -> wait 1s -> reconnect attempt
  -> wait 2s -> reconnect attempt
  -> wait 4s -> reconnect attempt
  -> wait 8s -> reconnect attempt
  -> fallback after fourth failed attempt
~~~

The waits total 15 seconds; connection/request timeout adds to elapsed time.

While fallback is active:

- continue bounded background recovery attempts;
- cap the initial repeated recovery delay at 8 seconds unless real provider behavior justifies another value;
- once valid data returns, state becomes ready;
- remain in native fallback;
- require explicit operator action to Enable Live.

Manual fallback is immediate and sticky.

### Health rules

Health may use:

- transport connection/disconnection;
- explicit request failure;
- malformed payload threshold;
- missing required session/mapping identity;
- failed upstream heartbeat only if the provider actually defines one.

Health must not use:

- unchanged KDA;
- unchanged score;
- no kills for a period;
- a pause/buy phase;
- missing health/abilities caused by absent auxiliary clients.

Every asynchronous callback/timer carries the provider generation. A callback from an old source configuration must be discarded.

## Task 7 — Publish volatile live telemetry separately

Build a small process-local publisher for normalized live state.

Requirements:

- immediate latest-state delivery on subscribe;
- monotonically increasing stream sequence;
- process epoch so reconnect can accept a sequence restart;
- heartbeat comments;
- strict browser decoder;
- no raw payload;
- no credentials;
- no canonical management mutation;
- coalesce/cap publication rate if the upstream emits faster than the browser needs.

A target of roughly 10 Hz is appropriate for the initial HUD unless real visual testing proves a different rate is needed.

Do not create one provider connection per subscriber.

The current project already requires one Node process for process-local SSE. Keep that deployment rule. Shared pub/sub/provider ownership is a later prerequisite for multiple app workers.

## Task 8 — Add View Data diagnostics

Add a View Data action to the In-Game Graphics Control provider area. It may also be reachable from a shared provider-status component.

Open it as an admin dialog/lightbox rather than navigating away from show control.

### Tabs / sections

1. Normalized Game Data
   - current LiveGameState as formatted JSON;
   - selected local game;
   - current mappings;
   - per-player capability flags;
   - normalized provider/team/player identities.

2. Raw Provider Data
   - latest Spectra match_data payload, or
   - latest GStack /livenow payload/message.
   - optional separate read-only sections for GStack /controlpanel and /mapbans when fetched.

3. Connection
   - provider;
   - generation;
   - connected/live/retrying/fallback/ready state;
   - retry number;
   - last successful receive time;
   - last parse/transport error;
   - mapping readiness;
   - attribution/supporter state.

### Safety and performance

- Never display access keys or server credentials.
- Keep only the current/latest raw payload in memory by default; do not create an unbounded telemetry log or database table.
- Raw provider data must not be included in public OBS/live SSE.
- A Copy JSON action is useful.
- The JSON viewer may update at a slower UI cadence than the HUD so a 100 ms provider does not constantly rebuild a large debug tree.
- If parsing fails, keep the raw payload visible alongside the parse error.
- If normalized output is missing a field that exists raw, the operator can immediately identify the adapter as the likely fault.

This tool is considered part of Phase 6 acceptance because real provider integration is difficult to diagnose without it.

## Task 9 — Build the provider-backed In-Game HUD

Use Spectra-Frontend-VAL26 as the primary layout/behavior reference, implemented independently in Svelte against LiveGameState.

Recommended component split:

~~~text
src/lib/broadcast/live/
  InGameHud.svelte
  MatchHeader.svelte
  PlayerRails.svelte
  PlayerCard.svelte
  HealthBar.svelte
  ShieldIndicator.svelte
  AbilityTracker.svelte
  UltimateTracker.svelte
  SpikeState.svelte
  RoundHistory.svelte
  EconomyPanel.svelte
  ProviderAttribution.svelte
~~~

Names are illustrative.

### Presentation direction

Preserve the already approved Phase 5.1 direction:

- the overlay wraps the VALORANT game UI rather than replacing every native element;
- two team rails remain at the top;
- series/game-win indicators belong near the team rails where they remain legible;
- external player rails/panels use live provider data;
- native timer/killfeed/other retained elements must remain unobstructed where the final composition relies on them;
- the existing Phase 5 native-safe graphic remains the fallback treatment.

Borrow useful VAL26 interaction/presentation patterns:

- symmetric five-player rails;
- agent identity;
- health/shield state;
- weapon/economy information;
- ability availability dots;
- ultimate progress/readiness;
- alive/dead treatment;
- attacker/defender color semantics;
- score/round/spike context;
- shopping/buy presentation where reliable fields exist.

Do not couple the renderer to Spectra names such as IMatchData or auxiliaryAvailable. The renderer receives our model only.

### Missing enhanced telemetry

When HP is unavailable:

- do not render 0 HP;
- keep the player card valid;
- omit/neutralize the HP-specific indicator according to the chosen layout.

When abilities are unavailable:

- show the ability icons if the agent is known;
- leave the small availability dots blank/hidden;
- do not imply zero charges.

When XHP/XShield are unavailable:

- hide their enhanced visual treatment;
- retain base health/shield if available.

### Local identity wins

Use local Team/Player branding from the prepared broadcast snapshot once provider slots are mapped.

Observed provider names belong in diagnostics and mapping. They should not unexpectedly replace approved broadcast display names.

## Task 10 — Feed live provider observations into Agent Select without changing ownership

Where the provider supplies agent-selection state, allow the Agent Select graphic to use transient observed picks.

Rules:

- local saved lineup determines player identity/order;
- provider agent observations may update the live Agent Select output;
- provider data does not silently save agent assignments;
- existing manual Agent Select editor remains fully usable;
- losing provider data falls back to saved/manual agent preparation;
- Post-Game Report continues to use saved canonical agent assignments.

If later desired, an explicit operator action can copy confirmed observed agents into the saved Agent Select editor, but that is not required to make Phase 6 live graphics work.

## Task 11 — Provider attribution

Create one provider-attribution component/policy rather than scattering source-specific checks across player cards.

### Spectra

Supporter state comes from /getOrgForKey.

- confirmed supporter -> follow the applicable Spectra policy;
- non-supporter -> watermark/attribution shown;
- unknown/error -> conservative attribution-required path.

Do not infer supporter status from the absence/presence of an incidental match_data field.

### GStack

Verify the event license/attribution requirement against the version/license being used. Keep the renderer capable of showing GStack attribution without changing HUD layout.

Reserve a predictable safe area so attribution does not collide with native VALORANT UI, sponsors, or critical live data.

## Task 12 — Fixtures, failure tests, and real provider verification

### Unit / adapter fixtures

Spectra:

- valid logon/match payload;
- invalid JSON;
- missing optional auxiliary data;
- some players with auxiliary health/abilities and some without;
- player/team side changes;
- stale generation callback;
- disconnect/reconnect;
- extras lookup supporter true/false/401/unavailable.

GStack:

- supplied real /livenow example;
- all blank enhanced fields;
- Expansion Client enhanced fields populated;
- Shield X/R/numeric values;
- valid/invalid KDA;
- valid/invalid Ultimate Points;
- score zero vs blank;
- malformed player record;
- side/team mapping changes;
- transport failure/recovery;
- stale generation callback.

### State-machine proof

Use controlled timers to prove:

1. live;
2. failure;
3. 1s retry;
4. 2s retry;
5. 4s retry;
6. 8s retry;
7. fourth failure -> fallback;
8. background recovery;
9. valid data -> ready;
10. remains native;
11. operator enables live.

Also prove manual fallback never auto-restores.

### Multi-client proof

With one provider session active:

- open two Graphics Control sessions;
- open embedded Preview and Large Preview;
- open the OBS In-Game output;
- verify exactly one upstream Spectra/GStack session/reader exists;
- reconnect browser clients without restarting upstream provider unnecessarily.

### View Data proof

- raw input and normalized output update;
- secrets are absent;
- malformed raw payload remains inspectable;
- parse error is shown;
- Copy JSON uses the visible redacted data;
- closing/opening the dialog does not alter provider or broadcast state.

### Real-game verification

Run separate real-provider sessions for Spectra and GStack before declaring either broadcast-ready.

Verify:

- team/player mapping;
- side swaps;
- scores;
- agent identities;
- health;
- shield/Regen Shield behavior where available;
- overheal/XHP where available;
- ability dots with and without Player/Expansion Clients;
- ultimate state;
- weapons/economy;
- spike state/carrier if normalized;
- round history if normalized;
- provider disconnect;
- native fallback;
- recovered-but-still-native state;
- manual re-enable;
- OBS alpha/composition and native UI safe areas;
- View Data during the same session.

Record unavailable capabilities honestly rather than marking them failed.

## Recommended implementation order

1. Documentation/status corrections and Phase 6 branch.
2. Normalized types, parsers and fixtures.
3. Live publisher/decoder separated from BroadcastSnapshot.
4. Provider configuration/session coordinator.
5. Spectra adapter + /getOrgForKey.
6. GStack adapter and transport verification.
7. Identity mapping.
8. Health/retry/native-fallback state machine.
9. View Data.
10. External-data In-Game HUD.
11. Live Agent Select integration.
12. Attribution policy/rendering.
13. Full automated regression.
14. Real Spectra session verification.
15. Real GStack session verification.

This order intentionally puts View Data before the full HUD so real payload problems can be diagnosed while the renderer is still being built.

## Likely implementation areas

Existing code to preserve/refactor rather than bypass:

~~~text
src/lib/broadcast/types.ts
src/lib/broadcast/client.ts
src/lib/broadcast/LiveGraphic.svelte
src/lib/broadcast/templates/test/InGame.svelte

src/lib/server/broadcast/publisher.ts
src/lib/server/broadcast/snapshot.ts

src/lib/components/admin/graphics/GraphicsWorkspace.svelte
src/lib/components/admin/graphics/GraphicsGlobalSetup.svelte
src/lib/components/admin/graphics/GraphicControls.svelte
src/lib/components/admin/graphics/GraphicPreview.svelte

src/routes/admin/graphics/[graphic]/
src/routes/api/broadcast/events/+server.ts
src/routes/gfx/live/[graphic]/
~~~

Expected new ownership boundaries:

~~~text
src/lib/live/
src/lib/server/live/
src/lib/server/live/providers/
src/lib/components/admin/live/
src/lib/broadcast/live/
src/routes/api/live-game/events/
~~~

Database additions should be limited to configuration/mapping/control state that truly must survive restart. Do not persist every telemetry sample.

## Verification commands

Use the existing project pattern:

~~~text
pnpm check
pnpm exec vitest run --project server <focused tests>
pnpm exec vitest run --project client <focused tests>
pnpm exec playwright test <phase-6 tests> --workers 1
pnpm exec prettier --check <changed files>
pnpm lint
pnpm build
~~~

When Svelte components are written, follow AGENTS.md: consult the relevant current Svelte/SvelteKit documentation first and run the Svelte autofixer before handoff.

## Done when

Phase 6 is complete when:

- Spectra and GStack feed the same normalized LiveGameState contract.
- No HUD component needs provider-specific payload knowledge.
- The provider session is server-owned and not duplicated per browser/OBS client.
- Saved local match/lineup/veto/team identity remains authoritative.
- Blank/missing enhanced telemetry never becomes a fake zero.
- Player/Expansion Client absence does not falsely mark the provider dead.
- Spectra supporter state is checked server-side through /getOrgForKey and credentials never leave the server.
- Team/player mappings are explicit, safe, and invalidated when the selected local game/source changes.
- Provider health follows the reviewed 1/2/4/8 retry and sticky fallback rules.
- A recovered provider never automatically restores the external HUD.
- View Data clearly exposes current raw, normalized, mapping, capability, connection and error state without exposing secrets.
- The external-data In-Game HUD follows the approved VAL26-inspired layout direction while using our Svelte architecture and local resources.
- Missing HP/abilities/XHP/XShield degrade visually without breaking player cards.
- Live Agent Select can consume provider observations without silently rewriting saved agents.
- Provider attribution is handled centrally and safely.
- Automated fixtures prove malformed/missing/stale/reconnect/multi-client behavior.
- Spectra and GStack each have a separately recorded real-session verification before being declared broadcast-ready.
