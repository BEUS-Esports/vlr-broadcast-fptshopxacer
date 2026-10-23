# Live Provider Transport Reference

Last updated: 2026-10-24

## Purpose

This document is the transport-level source of truth for live VALORANT provider integration.

It records:

- how the application connects to each provider;
- which upstream messages are considered authoritative observations;
- how full snapshots and incremental updates are handled;
- which provider fields are known, optional, enhanced, or still unresolved;
- which upstream values are normalized into the shared `LiveGameState`;
- which provider-specific values remain diagnostic/raw only;
- reconnect and resynchronization expectations;
- security rules for provider credentials and executable-looking payloads.

Implementation order, UI work, and Phase 6 acceptance remain in
[2026-10-03-phase-6-live-providers-external-hud.md](./2026-10-03-phase-6-live-providers-external-hud.md).

The normalized application model owns the graphics contract. Neither ValoSpectra nor GStack payload structures may leak into HUD components.

---

## 1. Shared transport rules

### 1.1 One upstream session

The Node server owns the active provider connection.

Opening additional:

- Graphics Control pages;
- embedded Previews;
- Large Preview;
- OBS/browser sources;

must not create additional ValoSpectra or GStack upstream sessions.

Browser clients receive the application's own read-only live-data stream, not a direct provider connection.

### 1.2 Provider data is observational

Providers may report:

- names;
- agents;
- weapons;
- health/shield;
- economy;
- K/D/A;
- abilities;
- ultimate state;
- scores;
- spike state;
- round outcomes;
- provider-side/team positions.

They do not silently rewrite canonical:

- Tournament entries;
- Match Team A / Team B;
- saved Game lineups;
- Map Veto;
- saved Agent Select;
- local team/player branding;
- operator broadcast presentation.

Provider identity is joined to local identity through the explicit Phase 6 mapping layer.

### 1.3 Missing is not zero

Provider blanks, absent auxiliary-client fields, malformed optional values, or unsupported fields normalize to `null`.

An observed numeric zero remains `0`.

Missing enhanced fields do not by themselves indicate a dead provider.

### 1.4 Raw data retention

Keep only the current/latest raw provider state required by View Data and diagnostics.

Do not persist every live tick to SQLite.

Credentials, access keys, or private provider configuration must never be included in:

- live SSE;
- OBS output;
- browser console output;
- View Data;
- raw diagnostic JSON returned to clients.

---

## 2. ValoSpectra

### 2.1 Services

Current integration uses two server-side endpoints.

| Purpose                       | Default service | Protocol  |
| ----------------------------- | --------------- | --------- |
| Live match state              | port 5200       | Socket.IO |
| Organization/supporter lookup | port 5101       | HTTP      |

Recommended configuration:

```text
SPECTRA_SOCKET_URL=http://localhost:5200
SPECTRA_EXTRAS_URL=http://localhost:5101
SPECTRA_ACCESS_KEY=
```

The exact host may be remote/configured; the access key is server-only.

### 2.2 Live Socket.IO session

The client connects with a Socket.IO-compatible library.

On connect:

```js
socket.emit(
	'logon',
	JSON.stringify({
		groupCode
	})
);
```

The server responds with `logon_success`.

After successful logon, consume `match_data` events.

Do not substitute a raw WebSocket client for Socket.IO.

A successful logon must be followed by usable `match_data` within five seconds. An acknowledgment alone does not establish usable telemetry; malformed data does not extend that deadline.

### 2.3 match_data handling

Treat each valid `match_data` event as the latest Spectra observation.

The Spectra adapter converts only the fields consumed by the application into `LiveGameState`.

The adapter should retain enough raw input in memory for View Data, but the raw object is never forwarded directly to OBS/browser SSE.

Provider-side team order is not Match Team A/B identity.

Prefer stable provider player identifiers where available, then join them to the selected local lineup through the mapping layer.

### 2.4 Player Client / auxiliary capabilities

Spectra can remain healthy while some player-detail fields are unavailable.

Player-side auxiliary / ValoSpectra Player Client availability controls richer fields such as:

- HP;
- ability availability/charges;
- other auxiliary player details exposed by the current Spectra model.

Capability availability is per player.

A match where only some players expose auxiliary data is valid.

The HUD must therefore render fields independently:

```text
provider connected             != every field available
player mapped                  != Player Client available
health null                    != player has 0 HP
ability data null              != player has 0 charges
```

### 2.5 Supporter / attribution verification

Supporter state is verified separately from live match transport:

```text
GET <SPECTRA_EXTRAS_URL>/getOrgForKey?key=<ACCESS_KEY>
```

Expected successful shape:

```ts
type SpectraOrganization = {
	id: string;
	name: string;
	isSupporter: boolean;
};
```

Interpretation:

| Result                                       | Application treatment                                                |
| -------------------------------------------- | -------------------------------------------------------------------- |
| HTTP 200 + `isSupporter: true`               | supporter confirmed                                                  |
| HTTP 200 + `isSupporter: false`              | attribution-required path                                            |
| HTTP 401                                     | invalid/unaccepted key; attribution-required path + operator warning |
| endpoint unavailable / unsupported / unknown | supporter not confirmed; conservative attribution-required path      |

Do not depend on organization/supporter fields incidentally appearing in serialized `match_data`.

Do not call `getOrgForKey` on every telemetry event. Cache/reuse it for the current provider configuration/session.

### 2.6 Reconnect

Unexpected live transport failure enters the shared Phase 6 retry state machine.

Changing:

- provider;
- group code;
- endpoint configuration;
- selected local game;

invalidates the current provider generation. Late Socket.IO callbacks from an earlier generation are discarded.

Recovery can make the provider `ready`, but never automatically returns the output from native fallback to the external HUD.

---

## 3. GStack

### 3.1 Services discovered from the supplied VHUD scripts and API data

GStack exposes separate full-state HTTP and low-latency WebSocket paths.

| Purpose                                     | Endpoint                           |
| ------------------------------------------- | ---------------------------------- |
| Full live state                             | `http://<host>:57780/livenow`      |
| Control-panel diagnostics                   | `http://<host>:57780/controlpanel` |
| Map-ban diagnostics                         | `http://<host>:57780/mapbans`      |
| VHUD command stream over HTTP/file contexts | `ws://<host>:57770`                |
| VHUD command stream over HTTPS contexts     | `wss://<host>:57773`               |

The supplied GStack VHUD client reconnects the WebSocket automatically after close.

### 3.2 Transport strategy

Use GStack as a **snapshot + delta** source.

```text
/livenow full state
        |
        v
GStack state accumulator <---- WS [ExecuteScript] / [ExecuteJSON] deltas
        |
        v
normalized LiveGameState
```

Recommended behavior:

1. establish the server-owned GStack WebSocket;
2. obtain a full `/livenow` snapshot for current state;
3. use WebSocket messages for low-latency incremental updates;
4. on reconnect, obtain a fresh `/livenow` snapshot before considering state fully synchronized again;
5. if real-session testing shows a missed-delta/startup race, add a low-frequency reconciliation snapshot rather than moving browser clients to polling.

The application does not expose REST-vs-WS as an operator choice.

### 3.3 WebSocket message families

The supplied VHUD client recognizes two message prefixes.

#### ExecuteScript

Example:

```text
[ExecuteScript]: SetPlayerKDA(0,5,'3','0','1')
```

or:

```text
[ExecuteScript]: SetPlayerWeapon(1,4,'Classic','auto 25px')
```

The stock VHUD client executes the received string with the JavaScript `Function` constructor.

**Our application must never do this.**

Treat `[ExecuteScript]` as a small command protocol:

1. strip the prefix;
2. parse function name + literal arguments;
3. accept only explicitly supported command names;
4. validate argument count/types/ranges;
5. apply the command to the in-memory GStack accumulator;
6. retain unknown/unsupported commands in diagnostics without counting them as malformed data; malformed supported commands also count toward the bounded session failure threshold.

Do not use `eval`, `Function`, dynamic imports, or arbitrary property execution.

#### ExecuteJSON

The supplied client also recognizes:

```text
[ExecuteJSON]: { ... }
```

and merges JSON sections into internal:

```ts
{
  Team_Left: {},
  Team_Right: {},
  Scoreboard: {},
  Spike: {}
}
```

If this message family appears in the event build:

- parse with `JSON.parse`;
- validate the object;
- merge only known sections/fields into the raw GStack accumulator;
- never treat an arbitrary JSON property as executable behavior.

A valid safe object containing only unsupported fields is diagnostic-only: it must not publish telemetry, count toward the malformed threshold, or trigger reconnect/fallback. Mixed supported/unsupported objects apply only the supported fields. Invalid JSON, unsafe properties and malformed known section/field shapes remain rejected and count toward the threshold.

Until real captures establish its exact payload shape, `ExecuteJSON` remains supported defensively but is not required for the normalized HUD contract.

### 3.4 Confirmed ExecuteScript commands

The supplied `Main.js` defines the command functions below.

#### Player identity and equipment

```text
SetNamePlayer(team, player, name)
SetPlayerAgent(team, player, agent)
SetPlayerWeapon(team, player, weapon, cssAdjustment)
SetPlayerShield(team, player, shieldCode)
```

`cssAdjustment` is GStack VHUD rendering metadata and is not part of `LiveGameState`.

#### Player live stats

```text
SetPlayerHP(team, player, hpPercent)
SetPlayerKDA(team, player, kills, deaths, assists)
SetPlayerCreds(team, player, credits)
```

#### Ultimate

```text
SetUltiActive(team, player, active)
SetUltiPoints(team, player, current, required)
```

The VHUD presentation uses `SetUltiActive(..., 1)` to show the ultimate icon as active/ready and `0` to show the point-progress container.

#### Abilities

```text
SetSkillsPoints(team, skillIndex, player, current, capacity)
```

The VHUD renders up to the reported capacity and fills dots up to the current value.

Our normalized ability slots retain `{ current, capacity }`. Preserve both values from these deltas; blank pairs clear both. A scalar snapshot value or Spectra charge count has `capacity: null` unless the provider reports a maximum. The HUD uses dots for known capacities up to 10 and a numeric current/max display above that bound.

Known `skillIndex` values:

```text
0 -> first displayed basic ability slot
1 -> second displayed basic ability slot
2 -> third displayed basic ability slot
```

Map these to the normalized ability slots consistently with the GStack agent-resource ordering; do not infer Riot internal ability names solely from the index.

#### Enhanced / Expansion Client data

```text
SetExtraData(team, player, extraHP, extraShield)
```

The supplied function comments identify its final two arguments as HP and Shield. Its stock function body currently does not render them.

For our adapter, this command corresponds to the enhanced `XHP` / `XShield` data path already observed in `/livenow`.

Treat absent values as `null`.

The GStack Expansion Client is required for:

- enhanced HP;
- enhanced shield;
- ability-charge values.

A healthy base GStack connection can therefore leave these fields blank.

#### Score and spike

```text
SetRound(leftScore, rightScore)
SlideSpike(state)
SpikeTeam(team)
SpikePlayer(player)
```

`SetRound` updates the two live team scores.

`SpikeTeam` selects the GStack provider side associated with the carrier marker.

`SpikePlayer` uses:

```text
0 -> no player marker
1..5 -> player slot
```

Keep `SlideSpike` in a provider-specific raw/derived state until its exact gameplay-state meaning is confirmed against a live capture; do not infer planted/dropped semantics only from animation naming.

#### Match/control presentation commands

The VHUD also defines commands such as:

```text
SetNameTeams(...)
SetRefreshLogoTeam1(...)
SetRefreshLogoTeam2(...)
SetRefreshLogos(...)
SetTagTeams(...)
SetMapResult(...)
SetMapSelect(...)
SetMapLabels(...)
SetMapBanMode(...)
SetDefAtkBy(...)
TechnicalPause(...)
DefTimeOut(...)
AttTimeOut(...)
ShowTagTeams(...)
ShowTimeOutPoints(...)
```

These are useful for View Data and diagnostics but do not replace our canonical Team/Match/Game/Veto/control data.

### 3.5 Shield encoding — confirmed

The supplied VHUD maps:

| Raw `Shield` | Meaning      |
| ------------ | ------------ |
| `X`          | no shield    |
| `25`         | Light Shield |
| `50`         | Heavy Shield |
| `R`          | Regen Shield |

For Regen Shield, the stock HUD displays 25 active shield and uses the Regen Shield-specific artwork.

Normalize this into a semantic shield kind while preserving the raw value.

Example:

```ts
type LiveShieldState = {
	raw: 'X' | '25' | '50' | 'R' | string | null;
	kind: 'none' | 'light' | 'heavy' | 'regen' | 'unknown';
	current: number | null;
	extra: number | null;
};
```

### 3.6 /livenow normalization

Known top-level shape includes:

```text
TeamLeft
TeamRight
ScoreTeamLeft
ScoreTeamRight
SpikeState
SpikeCarrier
RoundHistoryTeam1
RoundHistoryTeam2
PlayerPOV
```

Each player currently supplies:

```text
Name
Agent
Weapon
Shield
HP%
KDA
Creds
Ultimate
Ultimate Points
Skill 1 Points
Skill 2 Points
Skill 3 Points
XHP
XShield
```

Normalization rules:

- empty string -> `null`;
- valid numeric string -> number for fields with confirmed numeric semantics;
- invalid numeric text -> `null` + diagnostic parse issue;
- KDA requires a valid `K/D/A` triplet;
- Ultimate Points requires a valid `current/required` pair;
- Shield uses the confirmed mapping above and preserves `raw`;
- `XHP` / `XShield` are enhanced values and may be blank;
- Skill point values may be blank without Expansion Client;
- left/right are provider presentation slots until mapped to local tournament entries.

### 3.7 Round history — confirmed

`RoundHistoryTeam1` and `RoundHistoryTeam2` are pipe-separated round result codes.

The supplied VHUD's dormant `RoundTeams` renderer and a real captured GStack payload are consistent with:

| Code | Round end reason                       |
| ---- | -------------------------------------- |
| `0`  | no recorded result for this team/round |
| `1`  | defuse / deactivation                  |
| `2`  | elimination                            |
| `3`  | time                                   |
| `4`  | spike detonation                       |

For each round, the non-zero entry determines the winning provider side and reason.

Normalize to:

```ts
type LiveRoundResult = {
	round: number;
	winnerProviderSide: 'left' | 'right';
	reason: 'defuse' | 'elimination' | 'time' | 'detonation';
};
```

Retain the original pipe strings in View Data.

If both sides are non-zero for the same round or a code is outside the confirmed mapping, mark that round malformed rather than guessing.

### 3.8 SpikeCarrier

A captured `/livenow` value may look like:

```text
00000;10000
```

This appears to encode per-team player slots, but the exact delimiter/side/bit ordering should remain unnormalized until confirmed against controlled carrier changes.

The WebSocket's `SpikeTeam` + `SpikePlayer` commands provide a more directly interpretable incremental carrier observation.

Until the REST encoding is verified:

- retain raw `SpikeCarrier`;
- use confirmed WS carrier commands when available;
- show both in View Data for comparison.

### 3.9 /controlpanel

Use only as optional mapping/diagnostic evidence.

Known useful values include:

- left/right team names;
- short names/tags;
- logo selection/swap state;
- configured map labels;
- timeout/technical-pause controls.

Never allow `/controlpanel` to silently rewrite canonical local records.

It may prefill or explain a suggested provider-side mapping.

### 3.10 /mapbans

`/mapbans` is diagnostic/comparison data only.

The application's saved Map Veto remains authoritative.

Do not import GStack map-ban state into Match Veto automatically.

---

## 4. Shared normalization target

Both adapters feed the same application contract.

Illustrative shape:

```ts
type LiveGameState = {
	version: 1;
	provider: 'spectra' | 'gstack';
	generation: number;
	selectedGameId: string | null;

	phase: LiveGamePhase;
	roundNumber: number | null;
	map: string | null;

	spike: LiveSpikeState;
	teams: LiveTeamState[];
	rounds: LiveRoundResult[];

	receivedAt: number;
};
```

Provider-specific raw data belongs in server-side diagnostics, not in rendering components.

The HUD should never branch on provider identity for ordinary player/team rendering.

Acceptable provider-specific rendering exceptions are limited to:

- attribution/watermark;
- diagnostics;
- a field that genuinely has no provider-neutral semantic equivalent.

---

## 5. GStack accumulator behavior

Because GStack WS messages are deltas, maintain an in-memory raw accumulator.

Conceptually:

```ts
type GStackAccumulator = {
	left: GStackPlayerRaw[];
	right: GStackPlayerRaw[];
	scoreLeft: string | null;
	scoreRight: string | null;
	spike: {
		stateRaw: string | null;
		carrierRaw: string | null;
		wsTeam: number | null;
		wsPlayer: number | null;
	};
	roundHistoryLeftRaw: string | null;
	roundHistoryRightRaw: string | null;
	playerPovRaw: string | null;
};
```

A full `/livenow` snapshot replaces/reseeds the accumulator.

Known WS commands mutate only their relevant fields.

After each accepted delta, derive/publish a new normalized `LiveGameState`, subject to the application's publication-rate cap/coalescing.

Unknown commands:

- do not mutate normalized state;
- are stored as the latest diagnostic unknown command;
- appear in View Data;
- may be added to the allowlist only after their arguments/meaning are understood.

---

## 6. View Data requirements for transport debugging

View Data should make transport behavior visible without exposing secrets.

### ValoSpectra

Show:

- last redacted `match_data`;
- parsed/normalized state;
- Socket.IO connection/logon state;
- group code;
- per-player capability availability;
- supporter lookup result without access key;
- last transport/parse error.

### GStack

Show:

- latest `/livenow`;
- latest raw WS message;
- parsed WS command name/arguments;
- latest unknown/malformed WS command;
- current raw accumulator;
- normalized `LiveGameState`;
- mapping state;
- last REST/WS error;
- last resync time.

Optional diagnostic sections may show the latest `/controlpanel` and `/mapbans` reads.

Do not run arbitrary incoming GStack script text merely to make View Data work.

---

## 7. Provider-health implications

Transport health and data capability are separate.

Examples that **do not** imply failure:

- no score change;
- no K/D/A change;
- pause/buy phase;
- Spectra player has no Player Client;
- GStack Expansion Client is absent;
- ability current/capacity values remain null;
- XHP/XShield remain null.

Examples that may imply failure:

- Socket.IO/WebSocket disconnect;
- HTTP snapshot repeatedly failing when required for resync;
- malformed-message threshold exceeded;
- provider session no longer matches selected configuration;
- required team mapping invalidated.

The shared retry/fallback state machine owns recovery behavior.

### Idle-session resynchronization

After 30 seconds without accepted normalized telemetry, the coordinator closes the current attempt and opens a new one with the same provider generation and mapping. Quiet time requests verification; it does not itself count as failure. The last usable frame remains available during verification and the existing bounded retry sequence.

- Spectra opens a new Socket.IO session and logs on again to obtain the current match snapshot. The inspected [Spectra server](https://github.com/ValoSpectra/Spectra-Server/blob/6e106b5/src/connector/websocketOutgoing.ts) handles `logon` once per socket. Its [send loop](https://github.com/ValoSpectra/Spectra-Server/blob/6e106b5/src/controller/MatchController.ts) emits subsequent data only when its event counter advances; silence alone is not a documented heartbeat failure.
- GStack reopens its WebSocket and obtains a bounded `/livenow` snapshot, replaying buffered deltas through the existing startup path.
- Valid snapshots keep the provider usable even when statistics, phase, or auxiliary availability are unchanged. Failed synchronization enters the existing 1/2/4/8-second retry sequence. After fallback, recovery stays native until the operator explicitly enables the external HUD.

Changing games/providers, disconnecting, or disposing the coordinator cancels the idle timer. Old attempts cannot publish data or reschedule checks.

This verifies session responsiveness and snapshot availability, not the freshness of the provider's own capture pipeline. A provider serving a valid cached snapshot cannot be distinguished from a paused match using these contracts. Real event sessions must still verify the synchronization deadlines and operator fallback procedure.

---

## 8. Open verification items

### ValoSpectra

Still verify in a real event session:

- actual field coverage with observer-only setup;
- Player Client availability behavior per player;
- side swaps;
- spike/round phases used by our HUD;
- reconnect behavior;
- supporter lookup behavior for the actual event account/server.

### GStack

Still verify:

- WS command cadence and whether all expected fields emit on change;
- startup/reconnect synchronization behavior with `/livenow`;
- exact `SpikeState` encoding;
- exact REST `SpikeCarrier` bit/side ordering;
- actual `SetExtraData` values with Expansion Client;
- any `ExecuteJSON` payloads emitted during a real match;
- any additional `Set*` commands not present in the supplied VHUD scripts.

Confirmed enough for implementation:

- WS ports and message prefixes;
- allowlisted command architecture;
- player/team slot arguments;
- name/agent/weapon/HP/KDA/credits commands;
- shield codes;
- ultimate commands;
- ability-point commands;
- score command;
- WS spike team/player slot commands;
- round-history result codes;
- `/livenow`, `/controlpanel`, and `/mapbans` roles.

---

## 9. Security requirement: never execute GStack script messages

The upstream reference client uses:

```js
Function(xData)();
```

That behavior is appropriate only inside the trusted vendor VHUD implementation that defines the called functions.

Our server must instead parse a restricted grammar and dispatch to a static allowlist.

Example conceptual parser result:

```ts
{
  command: 'SetPlayerKDA',
  args: [0, 5, '3', '0', '1']
}
```

Then:

```ts
switch (command) {
  case 'SetPlayerKDA':
    applyPlayerKda(...);
    break;
  // explicitly supported commands only
}
```

Any syntax outside the accepted literal-call grammar is rejected and exposed only as a diagnostic parse error.

This keeps the provider transport boundary data-only even though the vendor wire format is executable-looking JavaScript.
