# FPT Shop x Acer — Valorant Broadcast Controller

## Document status

- Recorded: 2026-09-27. Target: the November 2026 broadcast; the exact event date is not fixed here.
- This specification records the approved planning baseline. Implementation began after a separate explicit request on 2026-09-27.
- [PLAN.md](./PLAN.md) describes the implementation sequence and acceptance checks.
- The requirements below supersede older README suggestions where they differ, particularly direct Riot API integration and roster roles.
- Technical defaults and unresolved integration checks are identified explicitly. Phase 5/5.1 graphics have passed real Valorant/OBS composition testing. Spectra live source behavior has been inspected from the current public server/frontend source, and a real GStack `/livenow` payload/schema has been supplied; each provider still requires a recorded real Phase 6 session before broadcast-ready status.

## 1. Overall goal

Build one application for preparing and operating FPT Shop x Acer Valorant broadcasts. Operators must be able to manage event data, prepare matches and games, control graphics, and supply OBS browser sources across a LAN. Online hosting is also supported, but must not be required for local management or manual graphics operation.

The complete November scope includes management, individual accounts, game resources, all seven graphics, live-provider integration, post-game statistics, and manual fallbacks. The first implementation milestone is a usable management foundation, independently of graphics or live data.

The design team supplies final layouts and assets. Development initially supplies functional test templates that exercise the same data and controls as the final graphics.

### First milestone acceptance

An operator can create teams and players, prepare a tournament and its rosters/map pool, create matches, add games individually, save the setup, and reopen it after an application restart. This must work without an OBS page or a live-provider connection.

### Out of scope

- Direct Riot API integration, RSO, and player account-linking flows.
- Automatic tournament brackets, seeding, advancement, or standings engines. Match preparation is operator-driven.
  - Reason: This app just adds the matches into the server, not doing everyhing like Seeding, Matching, Advancement Rules, etc...
- Automatic MVP selection or a new player-rating algorithm.
  - Technically, automatic MVP can be selected by picking the player in the winning team with highest Combat Score.
- Our own OCR client. Retain this as a future possibility if provider limitations or manual workload justify it.
- Creating the final broadcast visual identity, or building a general plugin system, distributed backend, or multiple independent broadcast channels for the initial release.

Public/static game-asset catalogues are separate from the excluded Riot match-data integration. Their suitability must be verified before choosing an import source.

## 2. Users and permissions

| Actor              | Access                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Administrator      | All operational features plus User Management.                                                                         |
| Operator           | All team/player, tournament, match/game, resource, integration, statistics, and graphics features. No User Management. |
| OBS/browser output | Read-only broadcast data and rendering. No management or mutation access.                                              |

User Management includes creating individual accounts, changing roles, resetting passwords, and disabling accounts. There is no public player-registration or player-login flow in this scope.

Implementation defaults: administrator-created accounts, database-backed sessions, established password-hashing primitives, and no email-service dependency for account setup/reset. Disabling an account or resetting its password invalidates its existing sessions. Prevent accidental removal of the last usable administrator.

Authorization must be enforced on the server for every protected read/write, not only by hiding navigation. Credentials and provider secrets must never reach OBS URLs or broadcast responses. Cookie/session protection and CSRF handling must work with the selected deployment; online hosting requires HTTPS.

## 3. Terminology and ownership

| Term                      | Meaning and responsibility |
| ------------------------- | -------------------------- |
| Player / Team             | Reusable profiles and branding, identified by stable application IDs. |
| Tournament entry / roster | A team's participation in one tournament and its plain list of available players. |
| Match                     | A series between two tournament entries, including its best-of format and series-wide map veto. |
| Match Team A / Team B     | Competition-order slots. Team A starts the standard map veto; a grand-final upper-bracket team may ban twice first as A or B. Saved veto actors remain editable. These identities are not attacker/defender colors or a broadcast left/right override. |
| Game / lineup             | One played map within a match, with its own selected five players per team, sides, scores, and result. |
| Broadcast left / right    | Presentation order. Default A-left/B-right; an operator may swap presentation without changing Match A/B identity, veto ownership, scores, or lineups. |
| Attacker / Defender       | Current gameplay side. Attacker is always blue and Defender is always red in broadcast graphics; color changes do not move a team between left and right. |
| Broadcast selection       | The shared game currently selected for graphics. Its match and tournament follow from the game relationship. |

Tournament rosters have **no main/substitute classification**. A player's inclusion in a game's five-player lineup does not change tournament membership or another game's lineup.

Saved rosters, lineups, results, and statistics must not disappear through cascading deletion of a reused profile. Archive or restrict deletion of referenced records; permit removal of unused records. Full historical snapshots of every name, portrait, and logo are not an initial requirement: reusable profile edits can affect their presentation in older views.

## 4. Management requirements

### 4.1 Teams and players

Baseline profile fields for implementation are:

| Record            | Fields                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Team              | Name, short tag, and normal/white/black logo assets.                                                                                    |
| Player            | In-game/display name, optional full name, portrait, and optional manually entered Riot ID.                                              |
| External identity | Provider identifiers discovered or mapped during integration, associated with the existing player/game. No account-linking requirement. |

Profiles are reusable across tournaments. Tournament membership is stored separately; do not make a player's single current `teamId` the source of historical event rosters.

Asset uploads need validated file types/sizes and safe generated storage paths. Missing portraits or logos must have usable test-template placeholders.

### 4.2 Tournaments, rosters, and map pools

- A tournament has a name and a unique, URL-safe slug. The slug participates in custom graphics resolution.
- Add participating teams, then maintain each entry's available players as a plain list.
- A player can belong to only one team's current roster in a tournament, enforced during roster saves. Profiles remain reusable across tournaments. Use searchable player selection with a selected-player preview; disable players already assigned to another entry in this tournament. To transfer a player, save their removal from the previous roster first; saved game lineups remain unchanged.
- Choose the tournament's editable map pool from Game Resources. Catalogue updates must not silently replace this selection.
- Roster changes preserve already saved game lineups. Existing references remain readable when a player is no longer available for a new lineup.
- Reject or explicitly resolve edits that invalidate existing match, veto, or game references. Do not silently rewrite the competition setup.

### 4.3 Matches and vetoes

A match contains its tournament, two distinct participating teams, match text/label, and one of **BO1, BO2, BO3, or BO5**.

| Format | Completion rule                                                               |
| ------ | ----------------------------------------------------------------------------- |
| BO1    | One completed game determines the winner.                                     |
| BO2    | Both games are played. Results are 2–0, 1–1, or 0–2; 1–1 is a completed draw. |
| BO3    | First team to two game wins.                                                  |
| BO5    | First team to three game wins.                                                |

Incomplete games do not contribute a winner to the series score. Correcting a completed game's result updates the series result consistently. Do not reuse a generic `ceil(bestOf / 2)` winner calculation for BO2.

The map veto belongs to the **entire match**, not an individual game. Store ordered ban/pick/decider information, the map, the acting team when applicable, and the target game number for a selected map.

**Team A / Team B is semantically meaningful. Team A starts the standard map veto sequence.** The better-seeded team chooses A or B, or that choice is decided at random when there is no seeding. In a double-elimination grand final, the upper-bracket team may make the first two bans whether it chose A or B. The Match editor must explain A/B and allow a swap while participants are still mutable. The Map Veto editor may fill the Riot-based BO1, BO3, BO5, or grand-final order as a draft, but every action remains editable. Saved `actingEntryId` values determine the actual sequence; graphics must not derive actors from A/B or screen position. BO2 remains manual because the cited procedures do not define it.

Do not use Team A/B to encode attack/defense or broadcast screen position. Side-choice information may be recorded with the selected map and applied when its game is prepared.

Veto selections use the tournament's map pool and cannot accidentally use a map twice in the same sequence. Corrections are supported, with conflicts against already prepared/played games surfaced explicitly. A picked map can be assigned to Game 1, Game 2, and so on **before those game records exist**.

### 4.4 Games and lineups

Operators create games **one at a time as needed**, under the selected match. Do not generate all possible BO games automatically. Game numbers are unique within a match and are distinct from the editable display name, such as `Game 1`.

Game information includes map, starting attacker and defender, each team's round score, and winner/result state. The two starting sides must refer to the match's two teams. Store scores against stable team identities; halftime or overtime side swaps must not transfer scores between teams.

Normal results use MR12 regulation: 12 rounds per half, first to 13. Valid regulation finals are 13–0 through 13–11. At 12–12, overtime uses one round per half and repeats until a team wins both rounds of a pair: 14–12, 15–13, and so on, with no overtime cap. Enforce these rules on finalization and corrections. Drafts may hold unknown or unfinished scores, but cannot continue beyond a winning score; they do not contribute a series win until explicitly finalized.

Each game has an ordered selection of five distinct players per team, drawn from that team's tournament roster. A player cannot occupy multiple slots or both teams' lineups in the same game. Draft preparation can be incomplete; a ready lineup requires all five selections. Test graphics must render incomplete preparation gracefully rather than crash or invent players.

The game setup flow is **Info → Lineup → Map Veto**. The Map Veto view edits the parent match's shared veto. Lineup controls edit the game's saved lineup, not a second graphics-only roster. Management can link to the same editor without creating another copy of its state.

## 5. Graphics and broadcast control

### 5.1 Graphics inventory

| Graphic       | Data and operator controls                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Player Lineup | Selected game's ordered five-player lineups, names, portraits, and team branding.                                  |
| Player Stats  | Operator-selected game/series/tournament scope using saved statistics, with single Player-to-Watch and head-to-head modes sharing one read/control model. |
| Map Veto      | Selected match's ordered bans/picks/decider, acting teams, and map assets.                                         |
| Agent Select  | Selected game's players and agent selections; provider updates where supported, with manual preparation available. |
| In-Game       | Provider-backed live HUD or the native-spectator-HUD fallback.                                                     |
| Post-Game     | Saved game result and statistics, imported or manually entered.                                                    |
| MVP           | Operator-selected player and relevant statistics for the chosen scope. No automatic candidate selection.           |

Each graphic receives an authenticated control page and a separate read-only OBS output. Only expose controls needed by that graphic, including content selection and visibility where applicable. Operator control of a graphic must not require editing source code.

### 5.2 Shared live selection

Every graphics control page has the same **Tournament → Match → Game** selector. There is one shared broadcast selection for the initial application, visible across operator accounts, tabs, and OBS clients.

Persist the selected game ID and derive its match/tournament, rather than persisting an inconsistent independent triple. While an operator is changing the parent dropdowns, clear invalid child choices locally and retain the previous on-air selection. Commit the change when a valid complete selection is made. Selecting a game changes the live OBS graphics; ordinary navigation through management records does not.

Broadcast updates must be persisted and published consistently. Handle concurrent operator edits with transactions and a revision/version check so stale forms cannot silently overwrite newer selections or data. After switching games, ignore late live updates from the previous game's connection. A delayed post-game import remains associated with the game it was requested for.

All graphics must consume broadcast updates through one **shared, importable, typed broadcast client library**. That library owns the app-level SSE connection contract, snapshot decoding, newest-revision handling, reconnect/resynchronization behavior, and shared read helpers. Individual graphics and later tournament-specific templates must not duplicate raw `EventSource`, payload parsing, or revision logic. Keep the browser-safe client library separate from server-only snapshot construction/publication code.

Presentation order is independent from match identity and gameplay side. Test graphics default to Team A on the left and Team B on the right, with an explicit **Swap Left/Right** broadcast override for stage/camera presentation mistakes. This override must never rewrite Match Team A/B, veto actors, scores, results, or lineup ownership. Across the graphics system, **Attacker is blue and Defender is red**. When teams switch gameplay sides, their colors change while their left/right positions remain fixed unless the operator explicitly changes the presentation-order override.

### 5.3 URLs, templates, and assets

Use stable OBS live URLs, for example `/gfx/live/<graphic>`. The output resolves the active game's tournament slug and chooses the corresponding custom layout, falling back to the functional test template when no custom layout exists. The exact route spelling is an implementation detail; operators must not replace every OBS URL between games.

The existing MLBB example demonstrates slug-based graphics routing, but its game-specific links are a reference, not the complete shared-live-selection design required here.

The current scaffold uses a transparent 1920×1080 graphics canvas; retain that as the initial template default. Final layout dimensions, safe areas, typography, animation, and assets come from the design team. Separate data/control behavior from visual templates so supplied designs can replace presentation without rewriting management or integrations.

### 5.4 Live and fallback HUD behavior

Phase 5 implements the **native-HUD-safe In-Game mode first**. In this mode the application assumes Valorant's full spectator HUD can be visible, so the test overlay must avoid covering critical native elements such as the minimap, timer/score area, killfeed, abilities, weapon/ammo information, and player/economy strips. The application supplies only safe supplementary branding/context that is useful without reconstructing live player values.

The later custom HUD may retain selected native elements such as the timer, killfeed, and skills while replacing other presentation with provider-backed graphics. If custom live data becomes unavailable, fallback restores the native spectator HUD rather than attempting manual reconstruction of health, weapons, abilities, economy, or other live details.

Provider health and on-air HUD mode are separate state. A healthy recovered connection does not imply permission to restore the live HUD.

| Event                                     | Required behavior                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider failure while using the live HUD | Start one server-owned retry sequence with waits of **1s, 2s, 4s, and 8s**, each followed by an attempt. Show connection state in the controller; allow immediate manual fallback. |
| Fourth reconnect attempt fails            | Switch to fallback. The waits total 15 seconds; network attempt timeouts add to elapsed time.                                                                                      |
| Already in fallback                       | Keep bounded background recovery attempts. Proposed initial delay cap: 8 seconds. This does not reset the manual fallback choice.                                                  |
| Valid data for the intended game returns  | Show **Live feed ready**. Remain in fallback until an operator explicitly enables the live HUD.                                                                                    |
| Operator changes mode                     | Manual fallback is immediate and remains selected after recovery. Enabling live requires usable data for the selected game.                                                        |

The four-attempt rule applies to the active upstream provider connection, not independently to every open browser. App-to-browser reconnect behavior is a separate transport concern. New source selections invalidate obsolete retry timers and callbacks.

Do not equate unchanged statistics with a dead source: pauses, buy phases, and lobbies can legitimately have little activity. Final source-health rules and request timeouts must be checked against real provider behavior. Starting without a provider must still offer a usable fallback.

During rehearsal, verify that the captured native spectator HUD is actually available beneath/alongside the fallback. A browser overlay cannot itself enable an in-game spectator setting or change an OBS capture source.

## 6. Data providers and statistics

### 6.1 Ownership boundary

Our saved tournament entries, match participants, game lineups, vetoes, and operator decisions are authoritative. Providers supply observations and statistics; they do not silently replace those records.

Use small provider-specific readers/mappers feeding shared application data shapes. A general plugin framework is not required. Match provider IDs/slots to existing application teams and players using explicit identifiers or operator-confirmed mappings. GStack left/right positions must not become permanent team identities.

### 6.2 Provider contracts and verification status

Transport-level details, ports, wire formats, command mappings, snapshot/delta behavior, and provider-specific parser requirements are maintained in [LIVE-PROVIDER-TRANSPORT.md](./LIVE-PROVIDER-TRANSPORT.md). This specification keeps the product ownership, capability, security, and acceptance rules.

| Source            | Source-code/documentation evidence                                                                                                                                                                                     | What remains unverified                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ValoSpectra live  | The current public server exposes Socket.IO output on the outgoing service: emit `logon` with a group code, receive `logon_success`, then consume `match_data`. The current frontend models per-player auxiliary availability for health/abilities/scoreboard. | Real event-session field availability, side changes, disconnect/recovery behavior, and Player Client coverage. |
| GStack live       | A concrete `/livenow` schema and real sample are available from port 57780. Player/game values are largely strings; enhanced `Skill * Points`, `XHP`, and `XShield` may remain blank without the Expansion Client. `/controlpanel` and `/mapbans` schemas are also known. | Exact live WebSocket contract for the event build, cadence/disconnect behavior, and verified meanings for remaining encoded fields such as round history/spike masks. |
| Spectra post-game | Both linked frontend variants request `https://stats.valospectra.com/getStats?code=<groupCode>` and poll every 15 seconds until player data arrives. Team presentation is obtained separately from an extras endpoint. | Hosted-service availability/access for the chosen setup and a successful completed-game response.         |
|HenrikDev System's Third Party API| Includes: Get MMR, MMR History, *Live and Cached Match List*, *Live and Historical Match Detail (positions, round detail, etc...)*, etc..., fit for Post-Match, generous Free Tier (30 req/s), requires API Key. | Nothing yet |

#### ValoSpectra's Post-Match

Spectra's post-game response types include match identity, player identities, combat score, K/D/A, damage, hit counts, economy, rounds, and kill events. Its frontend derives additional values such as ACS. The public server contains integration calls to a separately configured statistics backend; running the public server alone does not establish that this service is available.

Use the group code to locate a candidate report, then verify returned match identity and player/team mappings against the intended game. A reused group code must not import another map's result into the selected game. If an expected external match ID is not yet available, require explicit operator verification before associating the report.

Spectra post-game polling is distinct from live-HUD reconnect/backoff. A report that is still pending must not change the current on-air HUD mode. Retrieval timeouts or unavailable reports leave manual entry usable.

**NOTE**: Spectra attribution/watermark behavior must follow the applicable Spectra license/service rules. Phase 6 handles this through one centralized provider-attribution policy rather than hard-coding provider checks throughout the HUD.

Use the extras service to verify the access key/supporter state:

~~~text
GET /getOrgForKey?key=<ACCESS_KEY>
~~~

Default extras-service port is 5101. A successful response is:

~~~json
{
  "id": "organization-id",
  "name": "Organization Name",
  "isSupporter": true
}
~~~

The access key is server-only. HTTP 200 with `isSupporter: true` confirms supporter state; false, 401, unavailable, or unknown state must not silently suppress required attribution.

Live match data remains a separate Socket.IO contract on the outgoing service, normally port 5200:

~~~js
socket.emit(
  "logon",
  JSON.stringify({
    groupCode,
  }),
);
~~~

Listen for `logon_success`, then `match_data`. Do **not** require `match_data` to expose organization/supporter fields merely because current server object serialization may contain them.

The Phase 6 external-data HUD uses [Spectra-Frontend-VAL26](https://github.com/nobiiVAL/Spectra-Frontend-VAL26/) as a layout/behavior reference while adapting the presentation to our Svelte components and provider-neutral live-data contract. Missing Player Client auxiliary data is a per-player capability condition: HP/ability information can be unavailable while the Spectra source remains healthy.

#### GStack live-data details

Treat `/livenow` as the telemetry source. It contains left/right player slots, score, spike state/carrier, round-history strings, and POV, with many values represented as strings.

Rules:

- blank strings normalize to unknown/null, never zero;
- numeric strings may normalize to numbers where the field meaning is established;
- `Shield` must preserve raw values because observed values include `R`, `X`, and numeric strings;
- `XHP`, `XShield`, and `Skill 1/2/3 Points` are enhanced fields supplied when the Expansion Client provides them;
- missing enhanced fields are not a provider failure;
- `/controlpanel` can assist team/slot mapping and diagnostics but cannot overwrite local team/map records;
- `/mapbans` is diagnostic/comparison input only because the app's saved veto is authoritative;
- preserve unresolved spike encodings raw until confirmed; GStack round-history codes are now confirmed and documented in the live-provider transport reference.

#### HenriksDev Third Party Valorant API

Serves as ***almost*** a replacement for the Riot's Official APIs. Provides a lot of match data. Example schema (`https://api.henrikdev.xyz/valorant/v4/match/{region}/{matchUuid}`), fetched from my own game data:

```typescript
export interface JSONSchema {
    status: number;
    data:   Data;
}

export interface Data {
    metadata:  Metadata;
    players:   Player[];
    observers: any[];
    coaches:   any[];
    teams:     Team[];
    rounds:    Round[];
    kills:     Kill[];
}

export interface Kill {
    time_in_round_in_ms: number;
    time_in_match_in_ms: number;
    round:               number;
    killer:              Killer;
    victim:              Killer;
    assistants:          Killer[];
    location:            Location;
    weapon:              Weapon;
    secondary_fire_mode: boolean;
    player_locations:    PlayerLocation[];
}

export interface Killer {
    puuid: string;
    name:  Name;
    tag:   string;
    team:  TeamID;
}

export enum Name {
    REDACTED1 = "Player1Redacted",
    REDACTED2 = "Player2Redacted",
    REDACTED3 = "Player3Redacted",
    REDACTED4 = "Player4Redacted",
    REDACTED5 = "Player5Redacted",
    REDACTED6 = "Player6Redacted",
    REDACTED7 = "Player7Redacted",
    REDACTED8 = "Player8Redacted",
    REDACTED9 = "Player9Redacted",
    USECRookieNguyen = "USECRookieNguyen",
}

export enum TeamID {
    Blue = "Blue",
    Red = "Red",
}

export interface Location {
    x: number;
    y: number;
}

export interface PlayerLocation {
    player:       Killer;
    view_radians: number;
    location:     Location;
}

export interface Weapon {
    id:   string;
    name: null | string;
    type: Type;
}

export enum Type {
    Ability = "Ability",
    Bomb = "Bomb",
    Weapon = "Weapon",
}

export interface Metadata {
    match_id:          string;
    map:               Map;
    game_version:      string;
    game_length_in_ms: number;
    started_at:        Date;
    is_completed:      boolean;
    queue:             Queue;
    season:            Season;
    platform:          Platform;
    premier:           null;
    party_rr_penaltys: PartyRrPenalty[];
    region:            string;
    cluster:           string;
}

export interface Map {
    id:   string;
    name: string;
}

export interface PartyRrPenalty {
    party_id: string;
    penalty:  number;
}

export enum Platform {
    PC = "pc",
}

export interface Queue {
    id:        string;
    name:      string;
    mode_type: string;
}

export interface Season {
    id:    string;
    short: string;
}

export interface Player {
    puuid:                  string;
    name:                   Name;
    tag:                    string;
    team_id:                TeamID;
    platform:               Platform;
    party_id:               string;
    agent:                  Map;
    stats:                  PlayerStats;
    ability_casts:          PlayerAbilityCasts;
    tier:                   Tier;
    customization:          Customization;
    account_level:          number;
    session_playtime_in_ms: number;
    behavior:               Behavior;
    economy:                PlayerEconomy;
}

export interface PlayerAbilityCasts {
    grenade:  number;
    ability1: number;
    ability2: number;
    ultimate: number;
}

export interface Behavior {
    afk_rounds:      number;
    friendly_fire:   FriendlyFire;
    rounds_in_spawn: number;
}

export interface FriendlyFire {
    incoming: number;
    outgoing: number;
}

export interface Customization {
    card:                   string;
    title:                  string;
    preferred_level_border: null | string;
}

export interface PlayerEconomy {
    spent:         LoadoutValue;
    loadout_value: LoadoutValue;
}

export interface LoadoutValue {
    overall: number;
    average: number;
}

export interface PlayerStats {
    score:     number;
    kills:     number;
    deaths:    number;
    assists:   number;
    headshots: number;
    bodyshots: number;
    legshots:  number;
    damage:    Damage;
}

export interface Damage {
    dealt:    number;
    received: number;
}

export interface Tier {
    id:   number;
    name: string;
}

export interface Round {
    id:           number;
    result:       Result;
    ceremony:     string;
    winning_team: TeamID;
    plant:        Defuse | null;
    defuse:       Defuse | null;
    stats:        Stat[];
}

export interface Defuse {
    round_time_in_ms: number;
    location:         Location;
    player:           Killer;
    player_locations: PlayerLocation[];
    site?:            string;
}

export enum Result {
    Defuse = "Defuse",
    Detonate = "Detonate",
    Elimination = "Elimination",
    Surrendered = "Surrendered",
}

export interface Stat {
    player:           Killer;
    ability_casts:    StatAbilityCasts;
    damage_events:    DamageEvent[];
    stats:            StatStats;
    economy:          StatEconomy;
    was_afk:          boolean;
    received_penalty: boolean;
    stayed_in_spawn:  boolean;
}

export interface StatAbilityCasts {
    grenade:   null;
    ability_1: null;
    ability_2: null;
    ultimate:  null;
}

export interface DamageEvent {
    player:    Killer;
    bodyshots: number;
    headshots: number;
    legshots:  number;
    damage:    number;
}

export interface StatEconomy {
    loadout_value: number;
    remaining:     number;
    weapon:        Weapon | null;
    armor:         Map | null;
}

export interface StatStats {
    score:     number;
    kills:     number;
    headshots: number;
    bodyshots: number;
    legshots:  number;
}

export interface Team {
    team_id:        TeamID;
    rounds:         Rounds;
    won:            boolean;
    premier_roster: null;
}

export interface Rounds {
    won:  number;
    lost: number;
}

```

#### General Notes

No direct Riot API or RSO work is reintroduced through these provider adapters. Do not assume the separate Spectra backend's implementation or ultimate data source from the frontend contract alone.

### 6.3 Manual entry, import, and correction

Manual post-game entry is a required feature even when imports work. Both paths populate the same saved per-player, per-game records. Operators can save incomplete work and correct mistakes.

The baseline manual scoreboard supports agent, kills, deaths, assists, Performance Score, trades, first bloods, plants, and defuses — the fields intended for convenient entry from the spectator end-game screen. Performance Score is an opaque Riot-facing value: do not calculate it locally, alias it to ACS, or map HenrikDev `players[].stats.score` to it unless that relationship is explicitly verified. Rounds played, combat score/ACS, damage, hit counts, economy, and detailed events are provider-enhanced or future inputs to add only when a graphic or approved import requirement consumes them.

Retain source identity, external match ID when known, import time, and enough provenance to distinguish manual corrections from imported values. Reimporting the same report must not duplicate records. When a reimport conflicts with operator-edited data, preview the conflict and require an explicit replacement action; do not silently clobber the edit.

Keep missing values nullable. An absent OCR/provider field is not zero. Invalid numbers, incomplete identities, or unsupported fields should be reported or omitted, not guessed. Only publish the statistics needed by the graphic, not the provider's entire raw response.

### 6.4 Statistical scopes

Support **individual game, complete series, and tournament-wide** views. Broader views derive from saved game records rather than independently editable aggregate copies. Draft games and duplicate imports must not inflate totals.

| Metric family                        | Aggregation rule                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counts, such as K/D/A, trades, first bloods, plants, and defuses | Sum the relevant recorded values. Report incomplete coverage when contributing games are missing data. |
| Performance Score                    | Display the saved value directly for game scope. Leave it unavailable for series/tournament scope until an authoritative aggregation rule is approved. |
| Future ACS / ADR                     | If added later, use total combat score / rounds and total damage / rounds respectively when those inputs exist. Do not take an unweighted mean of displayed per-game averages. |
| Future hit-based headshot percentage | If added later, divide total headshots by total recorded hits using a consistent definition. Do not average game percentages. |
| Only a rounded manual average exists | Preserve its reported precision. Any aggregate derived from rounded values must be marked approximate; do not invent exact raw totals. |
| Event-derived metrics                | Require the necessary round/kill events or explicit manual values. Do not infer clutches, trades, or retakes from aggregate K/D/A. |

Zero denominators and unavailable inputs produce an unavailable/empty metric rather than a division error or fabricated value. MVP remains an operator's selection regardless of any statistical ranking displayed elsewhere.

### 6.5 Future OCR client

An independently developed OCR client is a deferred option. Decide between post-game screenshot extraction and live capture only when a concrete need exists. Its future output should use the same validation, mapping, and saved-data path; do not build OCR scaffolding in the initial app.

## 7. Game resources

Maintain the reference data and assets needed by the templates, initially maps and agents plus live-HUD equipment assets as required. Allow operators to inspect/manage available resources and identify missing assets.

Use existing catalogues or imports where suitable; verify Valorant coverage before choosing a source merely because it appears in the README. Resource refreshes are deliberate operator actions, with locally available assets for rehearsal/LAN use. Updating a catalogue must not erase referenced resources or replace tournament map pools.

Custom tournament branding and design-team assets remain separate from provider telemetry and game-resource data.

## 8. Application architecture and screen map

### Existing foundation and proposed defaults

| Layer           | Direction                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application     | Existing TypeScript, SvelteKit 3, Svelte 5, pnpm, Skeleton UI, and Tailwind setup.                                                                                                                     |
| Persistence     | Existing Drizzle and SQLite/libSQL client. Use a persistent local database for the initial single-host deployment; do not require a cloud database.                                                    |
| Server          | Existing Node adapter. One application process owns persistence, provider connections, and shared broadcast updates. No Redis or separate job service by default.                                      |
| Browser updates | Proposed: server-sent events for shared live state, with ordinary authenticated HTTP actions for controls. Reconnect loads a current snapshot/revision. Use the provider's required protocol upstream. |
| Assets          | Durable uploads/resource storage served through controlled asset routes. Include it in backup/restore alongside the database.                                                                          |

Management and graphics-control screens use the established TFT Broadcast application layout as their primary UI reference: a Skeleton AppBar, grouped sidebar navigation, scrollable content, and token-styled cards, forms, and status messages. Use Skeleton's Cerberus theme and styling tokens rather than hard-coded colors or radii. OBS graphic outputs keep their separate broadcast templates and design-team artwork.

Broadcast state is intentionally shared. User authentication/session state is not. Avoid creating provider connections in each graphics component or using account-specific mutable globals during rendering.

Persist configuration, operational decisions, and saved results. Keep high-frequency provider snapshots in the server runtime rather than writing every telemetry tick to SQLite. Transactions and version checks protect multi-record changes and stale operator saves.

```text
Management
├─ Teams and Players
├─ Tournaments
│  └─ Tournament
│     ├─ Participants and rosters
│     ├─ Map pool
│     └─ Matches
│        └─ Match: details, series veto, games
├─ Game Resources
└─ Users — administrators only

Graphics Controls
├─ Shared Tournament → Match → Game selector
├─ Provider status and Live / Fallback controls
├─ Game setup: Info → Lineup → Map Veto
│  └─ Map Veto edits the parent match's veto
└─ Player Lineup / Player Stats / Map Veto / Agent Select /
   In-Game / Post-Game / MVP

OBS Outputs
└─ Stable live URLs → selected tournament layout or test template
```

Use accessible labels, keyboard navigation, visible validation errors, and text status alongside colour indicators on controller pages. Do not render internal connection errors or operator-only UI on the broadcast output.

## 9. Reliability, security, and release acceptance

### Data and access

- Validate IDs and ownership at every write: tournament entry, match, game, lineup, map pool, and provider mapping must agree.
- Enforce uniqueness and references in the database where possible; use transactions for lineup replacement, result updates, imports, and broadcast changes.
- Reject stale edits with a useful reload/review path. Concurrent operators must not silently lose each other's work.
- Protect sessions, uploads, secrets, and provider configuration. Provider requests go only to deliberately configured destinations; OBS routes must not become an arbitrary URL-fetch proxy.
- Broadcast responses use explicit field allowlists and read-only routes, not unrestricted database/provider serialization.

### Operational acceptance

- All seven test templates operate with local saved/manual data. Production design handoff changes presentation without changing ownership or control behavior.
- A BO2 draw, consecutive same-team map picks, lineup substitutions between games, and side swaps all preserve correct results and identities.
- Multiple controllers and OBS clients follow one valid selection. Restart/reconnect recovers context without leaking another game's old data or bypassing the fallback recovery rule.
- A real provider outage exercises the four retries, fallback rendering, background recovery, and explicit operator return to live. Lobby/paused/unchanged data is not falsely treated as disconnect evidence.
- Backup/restore, persistent assets, a production build, and the actual LAN/OBS/native-HUD capture setup pass rehearsal before the November broadcast.

Synthetic fixtures prove application behavior, not provider availability. Keep fixture checks, production-build checks, and real provider/OBS rehearsal results distinct in release reporting. Exact provider health thresholds, runtime access, design assets, and the event date remain validation inputs, not reasons to block source-independent implementation planning.

## 10. References

### Project and framework

- [README](./README.md), [repository instructions](./AGENTS.md), and [implementation plan](./PLAN.md).
- [Local MLBB reference project](./examples/mlbb-hud-road-to-asiad-2026/): management flow, game lineups, and slug-based graphics links. Reuse fitting patterns, not game-specific assumptions.
- [SvelteKit 3 documentation](https://next.svelte.dev) and [migration notes](https://next.svelte.dev/docs/kit/migrating-to-sveltekit-3).
- [Skeleton UI documentation](https://www.skeleton.dev/docs/svelte/get-started/introduction).

### Provider evidence inspected during planning

- [Spectra live output](https://github.com/ValoSpectra/Spectra-Server/blob/main/src/connector/websocketOutgoing.ts).
- [GStack VHUD API documentation](https://gstack.app/API/VHUD.html).
- [Spectra map breakdown](https://github.com/ValoSpectra/Spectra-Frontend/blob/main/src/app/overlays/map-breakdown/map-breakdown.ts) and [VAL26 variant](https://github.com/nobiiVAL/Spectra-Frontend-VAL26/blob/master/src/app/overlays/map-breakdown/map-breakdown.ts).
- [Spectra endpoint configuration](https://github.com/ValoSpectra/Spectra-Frontend/blob/main/src/app/shared/config.ts) and [post-game response types](https://github.com/ValoSpectra/Spectra-Frontend/blob/main/src/app/components/breakdown/StatsApiMapping.ts).
- [Spectra backend connector](https://github.com/ValoSpectra/Spectra-Server/blob/main/src/connector/databaseConnector.ts) and [match lifecycle](https://github.com/ValoSpectra/Spectra-Server/blob/main/src/model/Match.ts).

External links describe the source inspected during planning and can change. Confirm the supported contracts when integrating; the project has not yet validated them against a real match.
