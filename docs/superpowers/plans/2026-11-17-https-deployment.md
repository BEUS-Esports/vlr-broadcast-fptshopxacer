# HTTPS Deployment (Docker + Caddy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the app at `https://valorant-gfx.noibo.beusesports.vn` from this Linux laptop, using a publicly trusted certificate, so that VDO.Ninja camera iframes load on every OBS/vMix PC.

**Architecture:** Docker Compose runs two services. `app` is the adapter-node build with no published port, reading `ORIGIN` when it starts. `caddy` is a Caddy build with the Cloudflare DNS plugin; it gets the certificate through the DNS-01 challenge and reverse-proxies to `app:3000`. A Cloudflare A record (DNS-only) points the hostname at the laptop's LAN IP. Database, assets and the encryption key stay in the bind-mounted `./data`, so host-side `pnpm db:migrate` and `pnpm backup` work unchanged.

**Tech Stack:** SvelteKit 3 + `@sveltejs/adapter-node` 6.0.2, Docker 29 / Compose 5, Caddy 2.11.6 + `caddy-dns/cloudflare` v0.2.4, Cloudflare DNS.

**Spec:** No separate spec. The decisions were made in conversation on 2026-11-17 and are recorded under Global Constraints.

## Global Constraints

- Hostname: exactly `valorant-gfx.noibo.beusesports.vn`. Cloudflare A record → laptop LAN IP, **DNS-only** (grey cloud).
- This app gets its own certificate and its own Cloudflare token (Zone → DNS → Edit on `beusesports.vn`, nothing else). Never copy the shared web server's wildcard certificate, and never proxy through that server.
- `ORIGIN` is a runtime setting only. Remove `paths: { origin: process.env.ORIGIN }` from `vite.config.ts`. One image works for any address.
- Image pins: `node:26.13.0-bookworm-slim`, pnpm `12.16.1` (via `npm install -g`, because corepack is not bundled with Node 26), `caddy:2.11.6-builder` / `caddy:2.11.6`, `github.com/caddy-dns/cloudflare@v0.2.4`.
- The app container runs as user `node` (uid 1000, which matches the host user), `WORKDIR /app`, `CMD ["node", "build"]`, and runs as one process (SSE is process-local).
- Event database path: `data/broadcast.db` (inside `./data`, next to `assets/` and `settings.key`). `.env.example` keeps `file:local.db` for development.
- The Cloudflare token lives only in `deploy/caddy/caddy.env` (gitignored, mode 600). It never goes in `.env`, so the app never sees it.
- Migrations and backups run on the host with `DATABASE_URL=file:data/broadcast.db`, after `docker compose stop app`. Never use `db:push` on event data.
- Historical records (`docs/QA-BASELINE.md`, `docs/USABILITY-REVIEW.md`, past plans) are not edited.

## Review Focus

1. **The laptop's IP changes** (DHCP lease, Wi-Fi vs Ethernet use different MACs, a different venue subnet): the hostname then resolves to a dead address and every output goes blank. Expected: the docs require a DHCP reservation for the interface used on show day, and a pre-show check that `nslookup` matches `ip -4 addr`. Changing the IP needs only an A-record edit, no rebuild. Pinned in Task 3's docs and Task 4 Step 1.
2. **An operator opens `https://<IP>` or `http://localhost:3000`**: the IP gets a certificate error, and port 3000 isn't published. Even if it were, forms from another origin get 403. Expected: the docs say to always use the hostname. The 403 behaviour is pinned in Task 1 Step 4.
3. **SSE buffered by the proxy**: if Caddy held back the stream, outputs would show stale graphics. Expected: Show/Hide reaches an output page on a second PC within about a second. Pinned in Task 4 Step 3.
4. **Large asset uploads through the proxy** (`BODY_SIZE_LIMIT=32M`): expected to succeed up to 32 MB. Caddy has no default body limit. Pinned in Task 4 Step 4.
5. **Bind-mount ownership**: files the container writes must stay owned by uid 1000, or the host-side backup and migrate fail. Pinned in Task 2 Step 3.

---

### Task 1: Runtime `ORIGIN`

**Files:**

- Modify: `vite.config.ts:17` (delete the `paths` line)
- Modify: `README.md:31`, `docs/BROADCAST-OPERATIONS.md:47-55`, `docs/RHS-RUNBOOK.md:19`, `docs/LIVE-PROVIDERS.md:69`

**Interfaces:**

- Produces: `node build` honours `ORIGIN` from the environment, whatever environment the build ran in.

- [ ] **Step 1: Show the bug.** Run `ORIGIN=http://localhost:4173 pnpm build`, then start the build with `ORIGIN=https://gfx.example.test PORT=4399 HOST=127.0.0.1` against scratch copies (set `DATABASE_URL` to a copy of `local.db`, and point `ASSET_DIR` and `SETTINGS_ENCRYPTION_KEY_FILE` at a temp dir). Expected: the log prints `ORIGIN is ignored because the SvelteKit configuration ... was set to http://localhost:4173`.
- [ ] **Step 2: Delete `paths: { origin: process.env.ORIGIN }`** from the `sveltekit({...})` options in `vite.config.ts`.
- [ ] **Step 3: Rebuild with `ORIGIN=http://localhost:4173 pnpm build`** (the trap stays in place on purpose) and restart as in Step 1. Expected: no "ORIGIN is ignored" line.
- [ ] **Step 4: Probe the cross-site form check.**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: https://gfx.example.test' \
  -H 'Content-Type: application/x-www-form-urlencoded' --data 'a=1' \
  'http://127.0.0.1:4399/admin/settings?/nonexistent'   # expect 404 (passed CSRF)
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: http://127.0.0.1:4399' \
  -H 'Content-Type: application/x-www-form-urlencoded' --data 'a=1' \
  'http://127.0.0.1:4399/admin/settings?/nonexistent'   # expect 403
```

- [ ] **Step 5: Update the docs.** Each passage should say that `ORIGIN` is read at startup and that changing the address needs only a restart, not a rebuild. In `BROADCAST-OPERATIONS.md`, move `$env:ORIGIN` after `pnpm build` in the PowerShell example. In `RHS-RUNBOOK.md:19`, drop "rebuild" and set `$env:ORIGIN` next to `HOST`/`PORT`. In `LIVE-PROVIDERS.md:69`, change "a production build made with your `ORIGIN`" to "started with".
- [ ] **Step 6: Run `pnpm check`, `pnpm lint` and `pnpm test:e2e`.** Expected: all pass (e2e runs without `ORIGIN`, using the `Host` header).
- [ ] **Step 7: Commit:** `fix(build): read ORIGIN at runtime instead of baking it into the build`

### Task 2: App container image

**Files:**

- Create: `Dockerfile`, `.dockerignore`

**Interfaces:**

- Consumes: Task 1 (an image built once works with any `ORIGIN`).
- Produces: an image that listens on `0.0.0.0:3000` and has `/app/data` owned by `node`. Relative paths in `.env` (`./data/assets`, `./data/settings.key`) resolve under `/app`.

- [ ] **Step 1: Write the `Dockerfile` with three stages on `node:26.13.0-bookworm-slim`.** Every stage runs `npm install -g pnpm@12.16.1`.
  - `build`: copy `package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc`, run `pnpm install --frozen-lockfile`, copy the source, run `pnpm build`.
  - `deps`: same manifests, then `pnpm install --prod --frozen-lockfile`.
  - `runtime`: `ENV NODE_ENV=production`, `WORKDIR /app`. Copy `package.json`, `deps:/node_modules` and `build:/build`. Run `mkdir -p /app/data && chown node:node /app/data`, then `USER node`, `EXPOSE 3000`, `CMD ["node", "build"]`.
  - `.dockerignore` lists: `.git node_modules build .svelte-kit coverage test-results data *.db .env .env.* !.env.example deploy/caddy/caddy.env design design_reference .codegraph .superpowers`.
- [ ] **Step 2: Build and smoke-test with a scratch data dir** (`$S` = a new temp dir holding a copy of `local.db` saved as `broadcast.db`, plus `assets/`):

```bash
docker build -t vlr-gfx .
docker run --rm -d --name vlr-smoke -p 127.0.0.1:3999:3000 --env-file .env \
  -e ORIGIN=http://localhost:3999 -e DATABASE_URL=file:data/broadcast.db -v "$S":/app/data vlr-gfx
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3999/admin               # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3999/gfx/live/composite  # expect 200
docker logs vlr-smoke | grep 'Server started'                                       # expect one line
```

- [ ] **Step 3: Check ownership.** Expected: `stat -c %u "$S"/settings.key` (created on first use if blank) and any file under `"$S"/assets` show `1000`. Then run `docker stop vlr-smoke`.
- [ ] **Step 4: Commit:** `build: add app container image`

### Task 3: Caddy, Compose and the deployment runbook

**Files:**

- Create: `deploy/caddy/Dockerfile`, `deploy/caddy/Caddyfile`, `deploy/caddy/caddy.env.example`, `compose.yaml`
- Modify: `.gitignore` (add `/deploy/caddy/caddy.env`), `docs/BROADCAST-OPERATIONS.md` (new "Linux HTTPS deployment" section under "Production deployment"), `README.md` (one line linking to it)

**Interfaces:**

- Consumes: the Task 2 image, built by Compose from `.`.
- Produces: `docker compose up -d --build` serves `https://valorant-gfx.noibo.beusesports.vn`.

- [ ] **Step 1: Manual prerequisites (the user does these):**
  1. Create the Cloudflare token: Zone → DNS → Edit, restricted to `beusesports.vn`.
  2. Add an A record `valorant-gfx.noibo` → the laptop's LAN IP (from `ip -4 addr`), DNS-only.
  3. Add a DHCP reservation for that interface.
  4. `cp deploy/caddy/caddy.env.example deploy/caddy/caddy.env && chmod 600 deploy/caddy/caddy.env`, then fill in the token.
- [ ] **Step 2: Write the Caddy image.** `deploy/caddy/Dockerfile`: `FROM caddy:2.11.6-builder AS builder`, `RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.4`, `FROM caddy:2.11.6`, `COPY --from=builder /usr/bin/caddy /usr/bin/caddy`. `caddy.env.example` holds one line: `CLOUDFLARE_API_TOKEN=`. The Caddyfile is exactly:

```caddyfile
valorant-gfx.noibo.beusesports.vn {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
		# Check DNS-01 propagation against public DNS, not the LAN resolver.
		resolvers 1.1.1.1
	}
	reverse_proxy app:3000
}
```

- [ ] **Step 3: Write `compose.yaml`.**
  - `app`: `build: .`, `env_file: .env`, `environment: { ORIGIN: https://valorant-gfx.noibo.beusesports.vn, DATABASE_URL: file:data/broadcast.db }`, `volumes: [./data:/app/data]`, `restart: unless-stopped`, no `ports`.
  - `caddy`: `build: deploy/caddy`, `env_file: deploy/caddy/caddy.env`, `ports: ["80:80", "443:443"]`, volumes `./deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro`, `caddy_data:/data`, `caddy_config:/config`, `depends_on: [app]`, `restart: unless-stopped`.
  - Declare the named volumes `caddy_data` and `caddy_config`. `caddy_data` holds the certificate and account key; losing it means getting a new certificate.
  - Expected: `docker compose config` exits 0.
- [ ] **Step 4: Bring it up on the real network.** First stop any host `node build` on port 3000. To keep the current data, run `cp local.db data/broadcast.db` while nothing is running. Then:

```bash
docker compose up -d --build
docker compose logs caddy | grep -i 'certificate obtained successfully'   # expect the hostname
curl -sI https://valorant-gfx.noibo.beusesports.vn/admin | head -1         # expect HTTP/2 200, no -k
curl -sI http://valorant-gfx.noibo.beusesports.vn/admin | grep -i location # expect https:// redirect
```

- [ ] **Step 5: Write the runbook section in `BROADCAST-OPERATIONS.md`.** It covers:
  - The prerequisites from Step 1.
  - First start (Step 4) and the rule to always use the hostname, never the IP or `localhost`.
  - Upgrade: `git pull`, `docker compose stop app`, backup, then `DATABASE_URL=file:data/broadcast.db pnpm db:migrate` on a disposable copy first, then for real, then `docker compose up -d --build`.
  - Backup: `docker compose stop app`, then `DATABASE_URL=file:data/broadcast.db pnpm backup -- --output <dir> --app-stopped`, then `docker compose start app`.
  - Logs: `docker compose logs -f app`.
  - IP change: edit the A record only.
  - Renewal: needs internet about every 60 days. Bring the stack up before travelling, and certificates stay on `caddy_data`.
  - GStack: inside Docker `localhost` means the container, so use the GStack PC's LAN IP.
  - Troubleshooting: `nslookup valorant-gfx.noibo.beusesports.vn` on each graphics PC. If it fails, the router is blocking private-IP answers; add a router DNS override or a hosts entry.
  - Expected: `pnpm lint` passes (Prettier formats the YAML and Markdown).
- [ ] **Step 6: Commit:** `feat(deploy): serve over HTTPS with Caddy and Cloudflare DNS-01`

### Task 4: Acceptance from a second PC

No code. Record the results in the PR description. Use one OBS/vMix PC on the show network.

- [ ] **Step 1: DNS.** `nslookup valorant-gfx.noibo.beusesports.vn` returns the laptop's current `ip -4 addr` address.
- [ ] **Step 2: Secure context.** Open `https://valorant-gfx.noibo.beusesports.vn/admin/player-cameras`. Expected: no certificate warning, and the secure-context indicator is green. A booth camera (a phone pushing a seat link is enough) plays inside an OBS browser source of the output URL.
- [ ] **Step 3: Live push through the proxy.** With an output page open in OBS, use Show/Hide on a graphic from the laptop's controller. Expected: OBS updates within about a second. After `docker compose restart caddy`, it reconnects without being reloaded by hand.
- [ ] **Step 4: Upload.** Upload a roughly 20 MB image as a team or player asset. Expected: it saves and renders.
