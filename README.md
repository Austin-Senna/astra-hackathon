# The House Remembers

A fresh AI-DM game foundation: deterministic simulation, persistent shared worlds, and replaceable presentation. The local DM runs through headless Claude Code using your existing login. OpenAI is optional.

## Run The Backend

Requires Node.js 24.12+ and Claude Code installed and logged in.

```sh
npm install
npm run dev:server
```

Backend: http://127.0.0.1:8790. Provider and asset information: http://127.0.0.1:8790/api/info.

The default model is `sonnet`. Optional environment settings are listed in `.env.example`; an existing `.env` is loaded by the server. No OpenAI API key is required for Claude mode. To check the local login transport:

```sh
node --import tsx scripts/smoke-model.ts
```

The smoke command makes a live model request. `scripts/smoke-adventure.ts` additionally generates a chapter, performs a DM action, and requests pixel artwork.

## UI Integration

The UI is being developed independently. Start with [the UI handoff](docs/ui-handoff.md), [client task](docs/client-task.md), and `public/fixtures/house.json`. The intended UI command is `npm run dev:client`, port 5174, once `apps/client/main.tsx` exists. Vite proxies API and WebSocket requests to the backend.

UI, networking, engine, and persistence must remain separate. Do not import server or engine modules into a production renderer. A different renderer consumes the same projected snapshots and submits the same intentions, including when presenting combat on a separate screen.

## Verify

```sh
npm test
npm run typecheck
node --import tsx scripts/build-assets.ts
```

While another agent is building the UI, verify the backend independently:

```sh
npm test -- apps/server packages/contracts packages/engine
npx tsc --noEmit -p tsconfig.backend.json
```

HTTP tests bind temporary localhost ports. SQLite's experimental warning is expected on Node 24.12. `npm run build` additionally requires the UI entrypoint and bundles the client; it is not a backend-only check.

## Data And Scope

Canonical saves, hashed membership credentials, command receipts, event history, and artwork jobs live in `data/worlds.sqlite`. Generated PNGs live in `data/generated`. Preserve the entire data directory for local backups. Browser local storage should hold session credentials and metadata, not authoritative world state.

This is a single-server local development architecture. It supports shared sessions and multiple engine actors; invitation/party onboarding, public deployment authentication, horizontal scaling, and additional renderers are not implemented. See [backend architecture](docs/backend-architecture.md) for concurrency and migration boundaries.

Art and sound attribution: [public/CREDITS.md](public/CREDITS.md). Original game implementation plan: [docs/implementation-plan.md](docs/implementation-plan.md).
