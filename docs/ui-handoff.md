# UI Agent Handoff

Root is implementing backend, engine, persistence, Claude generation, and synchronization. UI ownership is available to the user's separate agent.

## Prompt Sandbox: Current Priority

The user approved freeform-by-default play and explicitly wants the map sandbox before quests or additional battle/UI subsystems. The prompt is the primary action input, not a default move/ability menu.

Backend creation accepts `preset: 'sandbox'`; send it explicitly to select this foundation. The separate UI/SDK worker has added sandbox support and is now exploring story creation too. Root's backend commit defaults to sandbox, while concurrent story work may change the omitted-preset default. Explicit legacy presets still create their existing chapters; old saves are not silently migrated.

```ts
POST /api/worlds
{ brief: { premise: '', tone: '', protagonist: '', messages: [] }, mode: 'demo', preset: 'sandbox' }

POST /api/worlds/:worldId/dm // same bearer authentication and response contract
{ requestId, expectedRevision: view.revision, text: 'I become a dragon and breathe fire forward.' }
```

The authored starter opens immediately with one 24x16 courtyard and 21 entities: two primary NPCs, an animal, dry wood, fire, water, vessels, cloth, food, tools, and fixtures. Both live/demo creation use this starter; the supplied brief becomes context, and the first player prompt invokes live Claude. This is not a newly generated map on every creation. No OpenAI key is required.

- Detect `view.sandbox?.enabled`; hide mandatory-goal framing when `view.goal` is empty. No default player abilities are granted.
- Keep the prompt prominent. Do not populate a new fixed action menu; authored ability strings in sandbox state are DM context, not callable legacy `useAbility` implementations. Submit their use as text through `/dm`.
- Low-level walking/click interactions remain available. `entity.facing` is saved (`north/east/south/west`) and direct movement updates it. The model uses it to resolve "forward".
- Entity updates, spawn/removal, transformations, ownership, mood, relationships, memories, and freeform `properties` arrive in the authoritative snapshot. Do not infer or calculate their effects independently in the renderer.
- Conditions are free-text strings. Optional `map.tileStates` stores descriptions keyed by `x,y`; base tiles still govern navigation. The sandbox starter uses `entity.properties.mp` and `maxMp` (20 each). Counted spawns create distinct IDs sharing one asset.
- Dialogue can start or end an encounter through the same prompt resolution. Render the canonical encounter through the existing modular battle screen; do not require a predefined attack first.
- A transform changes `entity.assetId`, description, form tag, and ability strings while preserving identity and inventory. Use the active asset ID on world/profile surfaces. New `form-*`/`sculpt-*` visuals use the existing asset-job route; keep proxies until ready. Full coherent portrait/model bundle upgrades remain a separate milestone.
- `view.sandbox.rules` stores versioned descriptive rules scoped to visible maps. They are interpreted by the DM on prompts, not executable client rules or an autonomous physics system.
- Removal retains a private tombstone so historical IDs remain valid; it disappears from `view.entities`. Reconcile the complete snapshot instead of requiring a target in every removal event.
- Sandbox objective completion does not end play. Separate battle presentation is unchanged and is not the focus of this milestone.

Backend test coverage includes two WebSocket subscribers seeing the same resolved prompt and reconnect recovery. UI selection has concurrent integration work; visual playback still needs that worker's browser verification. Root has not edited UI-owned files.

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

The client is being implemented by the separate worker. Root's checks use backend-scoped tests and `npx tsc --noEmit -p tsconfig.backend.json`; frontend build and visual verification remain separately owned.

Server returns structured action errors without advancing state. HTTP model failures have `{error: string}`; do not clear chat/intention input on failure. A live chapter can take several minutes including repair. Use a generous fetch timeout and visible pending state.

For authorized failed art retry, POST `/api/worlds/:worldId/assets` with bearer token and `{assetId}`. Successful retry returns 202; eventual update arrives as a WebSocket asset message.

## Synchronization Cursor

The protocol now includes `cursor` on create/snapshot/action success and WebSocket snapshot/commit. Store it separately from visible events. A private event can advance the cursor while producing an empty event list for this actor.

GET events and WebSocket snapshots also include `reset`. A true value means the backlog exceeded the bounded recent tail or the supplied cursor was ahead. Replace local state with the supplied authoritative view, discard stale animation queues, and adopt the returned cursor. Replay events are for presentation, never for locally reconstructing canonical state. On ordinary messages, do not regress cursor or view revision from out-of-order HTTP responses.
