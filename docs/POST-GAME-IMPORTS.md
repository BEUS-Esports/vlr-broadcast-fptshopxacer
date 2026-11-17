# Post-game imports

Requires migrations 0010, 0011 and 0012. Configure both providers in **Settings** (`/admin/settings`). An import never finalizes scores or results, picks the MVP or changes the live HUD.

## HenrikDev (recommended alongside ValoSpectra)

Settings: Riot affinity (`ap`, `br`, `eu`, `kr`, `latam` or `na`), PC/console, base URL, candidate count, request timeout and the encrypted API key. Legacy Phase 7 environment values only bootstrap an empty settings table.

Only query participants whose data use is authorized under HenrikDev's current consent and use requirements.

1. Open the saved game's **Post-Game Report**.
2. Choose a saved lineup Riot ID, fetch recent matches and select the intended candidate.
3. The exact match detail opens the shared mapping and change review. Missing or renamed Riot IDs need explicit saved-player mappings.

## Spectra

Spectra imports use its separate hosted statistics service. Running the outgoing live server alone doesn't provide it.

- Group Code: the shared one from **Global Graphics Settings**, or a per-fetch override for an older report.
- The hosted base URL, poll interval and maximum attempts are database-backed settings, independent of the live socket region/host.
- Polling is bounded and can be stopped. A reused group code can return a different match, so check the returned match identity.
- Existing installations keep the live group code, falling back to the former post-game default when no live code exists. Saving updates both legacy database columns together.

## Reviewing an import

- Check map, time, teams, score, agents, every metric and source availability before confirming.
- Replacing the report with one from a different provider or report needs explicit confirmation.
- Statistics and agent conflicts each have **Keep local** / **Use provider**. Kept corrections stay protected on later reimports.

## Data rules

- Blank means unknown; zero means measured zero.
- Performance Score is independent of the provider's combat score. Trades are unavailable from these adapters.
- Missing or incomplete round events, including the verified surrender shape, leave derived metrics blank.
- Responses are capped at 20 MiB of decompressed body before JSON parsing, including recent-match discovery and each Spectra poll. Oversized responses are cancelled and reported as invalid; fetch fewer HenrikDev candidates or enter the data manually. Live-provider HTTP responses have their own 1 MiB cap.
- Provider errors leave the manual editor available.
- Never put provider credentials in public variables, fixtures, OBS URLs or client-visible data.

## Correcting a protected lineup identity

Explicitly discard only that player's saved statistics and provenance, then use the normal lineup correction flow. Other players, lineup agents and the report association are unaffected.
