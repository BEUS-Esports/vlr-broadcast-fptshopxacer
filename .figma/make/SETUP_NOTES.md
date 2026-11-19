# Initial import setup notes

Bootstrap preflight, mise, and install pass. The supervised Vite server also starts and
serves the application:

- `GET /` returns `301` to `/admin`.
- `GET /admin` returns `200`.
- The application completed its startup migrations and logged `server.started`.

However, `figma make verify-bootstrap` remains indefinitely in the `dev` step and
`figma make preview status` remains `starting`. A forced verification run behaved the
same way, and later normal verification joined that stuck run. The verifier never
emitted a terminal success or failure snapshot.

Setup changes attempted:

- Added executable `.figma/make/install` using the frozen pnpm lockfile.
- Added executable `.figma/make/dev` binding Vite to the supervised `$PORT`.
- Kept Node and pnpm pinned; changed pnpm's mise backend to `npm:pnpm` because the
  default aqua backend requested an asset name that does not exist for pnpm 12.16.1.
- Tried binding Vite directly to port 5173. Vite listened there, but the Figma preview
  continued probing its published port 3000 and could not connect, so the launcher was
  restored to the required supervised `$PORT`.

Deployment and deploy-preview verification remain intentionally deferred until
bootstrap reports terminal success.
