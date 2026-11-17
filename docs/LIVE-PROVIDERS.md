# Live providers and external HUD

Real Spectra and GStack sessions and external HUD/OBS composition still need separate acceptance. Neither provider is declared broadcast-ready.

## Setup

1. Apply migration 0008, then sync **Agents** in Game Resources to download ability icons into the local asset store. Existing agents keep their IDs and artwork. Measurements a provider doesn't supply stay blank in the HUD.
2. Set the shared ValoSpectra **Group Code** in the collapsible section of **Global Graphics Settings** (`/admin/graphics`).
3. In **Settings** (`/admin/settings`), configure the provider, then save and connect a source.

The application server opens the provider connections, so the endpoints must be reachable from it:

| Provider    | Endpoints                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ValoSpectra | Europe, North America or a custom HTTP/HTTPS host. Socket.IO match output on port 5200, supporter lookup on port 5101. The Org/access key may be blank for a custom server. |
| GStack      | Default `http://localhost:57780/`. `/livenow` seeds the state; the VHUD command stream is a WebSocket on port 57770 (57773 for HTTPS).                                      |

The GStack reference folder is ignored by Git, and none of its code or assets are bundled.

## Attribution

- GStack outputs have no watermark.
- Spectra's logo and “Powered by Spectra” credit occupy the top-edge sponsor position unless the server verifies supporter status. Unknown or invalid-key responses keep the watermark.
- Saved Spectra reports carry attribution into Post-Game, Player Stats and MVP whether or not a live connection exists. Graphics captured before this feature need **Hide → Show** to include report provenance.

## Running the external HUD

- In **In-Game** control, confirm both provider teams and the observed players against the selected saved game, then **Enable external HUD**. Local player and team branding always wins.
- Source None/disconnect and **Use native HUD** are shared across controllers.
- After 30 s without valid data, the server reopens the provider session for a fresh snapshot. Quiet periods alone don't count as failure.
- Failed synchronization retries after 1, 2, 4 and 8 s. After four failed retries, the HUD falls back to native and stays native until an operator re-enables the external HUD.
- **View Data** shows normalized data, redacted raw data and connection/mapping state, with Copy JSON.
- Agent Select may show transient observed picks but never saves them automatically.
- A server restart starts disconnected in native mode and requires mapping review.
- All browser clients subscribe to the app's SSE and share one upstream session, so run one Node process.

## Settings and credentials

- Provider settings live in the database (migration 0011). The ValoSpectra Org/access key and HenrikDev API key are encrypted at rest with AES-256-GCM.
- The encryption root is `SETTINGS_ENCRYPTION_KEY`, or the Git-ignored `data/settings.key` the server creates. Back it up separately, alongside the database: without it, saved credentials can't be decrypted.
- On first use only, a legacy `data/live-provider.json` and the old Phase 7 environment variables are imported. The legacy plaintext file is deleted only after the saved settings validate and decrypt.
- If that legacy file is unreadable or invalid, settings initialization stops without saving defaults or deleting the file. Fix the file (or the `LIVE_PROVIDER_CONFIG_FILE` override) and restart.
- Raw diagnostics stay behind the trusted-LAN admin boundary. Credentials never appear in output URLs, public SSE or form responses.

## Spectra connection diagnostics

Live-provider log events include the endpoint, provider, session generation, selected game, connection stage, elapsed milliseconds and safe nested network/TLS errors. Retry events add the delay, retry count, health and HUD mode. Only the first usable packet of each attempt is logged.

Start with `live.session.failed` and its `stage`:

| Stage        | What completed                               | What to investigate                                                                                           |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `connect`    | Socket.IO has not connected                  | DNS, port 5200, TLS certificate, proxy, or Socket.IO handshake; inspect the nested error code/message         |
| `logon`      | Socket.IO connected and the app sent `logon` | Group code and Spectra login acknowledgment                                                                   |
| `match-data` | Spectra acknowledged login                   | Spectra producer/group and incoming usable match data; `live.spectra.invalid-data` indicates rejected packets |

- Each startup stage has a 5-second deadline. `elapsedMs` counts from the start of the whole attempt.
- `live.session.ready`: first usable data.
- `live.retry.scheduled`: why a retry or native fallback happened.
- `live.session.resync`: a fresh snapshot attempt after 30 s without valid data.
- `live.spectra.supporter.*`: the separate port 5101 supporter lookup and attribution, not match data.

Endpoints and TLS:

- The Node server makes the connection, so the controller page can use HTTP while Node connects to an HTTPS provider.
- EU and NA use `https://<region>.valospectra.com:5200/`. Socket.IO starts with HTTPS polling and can upgrade to WSS.
- A custom host's scheme must match its exposed endpoint. An HTTPS website on port 443 doesn't prove that port 5200 supports TLS. See [Socket.IO connection troubleshooting](https://socket.io/docs/v4/troubleshooting-connection-issues/).

To capture logs, enable `LOG_DIR` ([Logging](./LOGGING.md)), or tee the terminal output of a production build made with your `ORIGIN`:

```powershell
node --env-file=.env build 2>&1 | Tee-Object -FilePath "$env:TEMP\vlr-live-provider.log"
```
