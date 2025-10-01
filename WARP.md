# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project: Orbits PDS — a TypeScript/Node.js Personal Data Server (PDS) for the AT Protocol with custom "Orbits" lexicons.

Common commands (pwsh/Windows and cross-platform)

- Install dependencies
  - pwsh: npm install
- Environment setup
  - Copy a template and adjust values as needed
    - pwsh: Copy-Item .env.development .env
    - See .env.example for required values, especially: DATABASE_URL, PDS_HOSTNAME, JWT_SECRET, ADMIN_PASSWORD; optional PORT (defaults to 3100).
- Development server
  - npm run dev
  - Starts PDS on http://localhost:3100 with AT Protocol endpoints under /xrpc
- Build
  - npm run build
- Start (after build)
  - npm start
- Tests / health checks
  - Quick smoke test (Node): node test-lexicons.js
    - Verifies PDS is responding at /xrpc/com.atproto.server.describeServer
  - Windows (PowerShell): .\test-lexicons.ps1
  - Bash: ./test-lexicons.sh
  - Full AT Proto flow (create account, login, create/list records): bash ./lexiconTest.sh (requires jq)
- Run a single test (examples)
  - Health check (pwsh): Invoke-WebRequest -Uri "http://localhost:3100/xrpc/com.atproto.server.describeServer"
  - Health check (curl): curl -s http://localhost:3100/xrpc/com.atproto.server.describeServer

Notes

- No linter config is present (e.g., ESLint/Prettier). Formatting/lint commands are not configured in package.json.
- Scripts available: build (tsc), dev (ts-node src/server.ts), start (node dist/server.js), test (node test-lexicons.js).

High-level architecture

- Runtime and entrypoint
  - src/server.ts is the canonical entrypoint. It reads environment variables (dotenv), maps them via @atproto/pds envToCfg/envToSecrets, and boots a PDS instance (PDS.create(...).start()).
  - Port is taken from PORT (default 3100). On startup, the server logs configuration, service DID, and availability of AT Protocol endpoints at /xrpc.
- AT Protocol integration
  - The PDS serves standard endpoints under /xrpc/com.atproto.* (e.g., server.describeServer, server.createAccount, server.createSession, repo.createRecord, repo.listRecords, repo.getRecord).
  - Custom record types for Orbits are defined via lexicons and are handled through the standard com.atproto endpoints (e.g., creating org.chaoticharmonylabs.orbit.record via com.atproto.repo.createRecord). See lexiconTest.sh for an end-to-end example.
- Lexicons (custom schema)
  - Location: lexicons/org/chaoticharmonylabs/orbits/
  - Defines the Orbits domain: orbit.record as the primary collection plus related schemas (e.g., feed, lens, profile, graph/friend, etc.). These JSON lexicon files describe schemas and methods used by the PDS to validate and serve records.
- Legacy/experimental server (reference)
  - src/Old_server.ts shows an alternative approach that manually mounts Express/XRPC routes for org.chaoticharmonylabs.orbit.* (list/get/create/update) and uses src/auth.ts for simple admin header checks. This file is not wired into the current package.json scripts and serves as historical/reference code.
- Auth helper
  - src/auth.ts exports requireAdmin and xrpcError utilities used by the legacy server to guard admin-only endpoints via headers (e.g., x-admin-secret).
- Build and output
  - TypeScript is compiled via tsc using tsconfig.json (CommonJS, ES2020). Output goes to dist/. The dev flow uses ts-node for live TypeScript execution.
- Deployment
  - deploy.sh provides a simple flow for Linux servers: npm ci → npm run build → start with pm2 if available, otherwise npm start. Ensure DATABASE_URL and PDS_HOSTNAME are set in the environment before running.

Key files to be aware of

- src/server.ts — Main PDS bootstrap
- tsconfig.json — Compiler flags (CJS, ES2020), outDir dist, rootDir src
- lexicons/org/chaoticharmonylabs/orbits/** — Orbits-specific lexicon definitions
- test-lexicons.js / test-lexicons.ps1 / test-lexicons.sh — Smoke/integration testing helpers
- lexiconTest.sh — End-to-end flow using standard AT Protocol endpoints
- deploy.sh — Minimal production deployment helper
