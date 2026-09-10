# UI Agent Handoff

Root is implementing backend, engine, persistence, Claude generation, and synchronization. UI ownership is available to the user's separate agent.

## Read First

- `docs/client-task.md`: complete proposed UI/SDK/renderer brief and HTTP/WebSocket contract.
- `packages/contracts/index.ts`: executable schemas and types. Treat as the shared boundary; coordinate changes rather than changing silently.
- `docs/commands.md`: canonical payload fields and action/retry semantics.
- `docs/implementation-plan.md`: product and architecture rationale.
- `public/fixtures/house.json`: projected example world, actorId, and asset catalog for independent renderer development.

## Ownership

UI agent may own `apps/client/**`, `packages/client-sdk/**`, `packages/presentation/**`, and its own UI docs. Root will not modify those during backend work. Root owns `apps/server/**`, engine/contracts, root integration config, and assets; ask before changing these boundaries.

UI visual direction is open; the previous brief is a concrete starting point, not a requirement to reproduce an existing design. Preserve the modular renderer boundary, authoritative state, large dialogue region, direct interactions, and optional separate battle view.

## Available Now

- 301 catalog assets at GET `/api/info`, including 37 original 32px object/character PNGs at `/art/hero/{id}.png`.
- CC0 packs `/art/town/tile_0000.png` through `0131`, and same for dungeon.
- Audio `/audio/rpg/*.ogg`; licenses in `public/CREDITS.md`.
- Original full-bleed cover `/art/house-cover.png`.
- Model provider defaults to headless Claude Code with existing local login. No OpenAI key needed. Live smoke passed.
- Vite configuration: client port 5174, proxy API and WebSocket to backend 8790. Root index.html expects `apps/client/main.tsx`.

## Launch

```sh
npm run dev:server
npm run dev:client
```

The client does not yet exist at this handoff. `npm run build` will only succeed once the UI entrypoint is supplied. Backend checks use `npm test` and `npm run typecheck`.

Server returns structured action errors without advancing state. HTTP model failures have `{error: string}`; do not clear chat/intention input on failure. A live chapter can take several minutes including repair. Use a generous fetch timeout and visible pending state.

For authorized failed art retry, POST `/api/worlds/:worldId/assets` with bearer token and `{assetId}`. Successful retry returns 202; eventual update arrives as a WebSocket asset message.

## Synchronization Cursor

The protocol now includes `cursor` on create/snapshot/action success and WebSocket snapshot/commit. Store it separately from visible events. A private event can advance the cursor while producing an empty event list for this actor.

GET events and WebSocket snapshots also include `reset`. A true value means the backlog exceeded the bounded recent tail or the supplied cursor was ahead. Replace local state with the supplied authoritative view, discard stale animation queues, and adopt the returned cursor. Replay events are for presentation, never for locally reconstructing canonical state. On ordinary messages, do not regress cursor or view revision from out-of-order HTTP responses.
