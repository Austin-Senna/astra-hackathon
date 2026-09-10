# Persistent AI DM Game: Modular, Multiplayer-Ready Architecture

## Summary

Build a fresh browser game where players brainstorm an adventure with an AI dungeon master, create a character, and enter a persistent world. Each adventure initially targets 10-15 minutes, four connected locations, and one clear goal. The House Remembers is the first suggested premise; the creation conversation can produce other settings and stories.

The server owns the canonical world. Clients present that world and submit intentions. Separate simulation, persistence, networking, and presentation so another AI can independently build a 2D, 2.5D, or 3D client. Multiplayer uses this same architecture. A separate battle screen remains a supported addition.

## Module Boundaries

| Module | Responsibility |
| --- | --- |
| packages/contracts | Versioned schemas and types for worlds, actors, actions, events, encounters, assets, and client messages. No UI, database, or model dependencies. |
| packages/engine | Deterministic simulation, action validation, interactions, abilities, encounters, and objective evaluation. No rendering, networking, database, or API calls. |
| apps/server | Session access, world generation, AI DM orchestration, authoritative command processing, persistence, asset jobs, and client synchronization. |
| packages/client-sdk | Connection management, synchronized client state, action submission, reconnect handling, and a renderer-neutral subscription API. |
| apps/client | Creation chat, dialogue, inventory, journal, settings, and composition of the selected game renderer. |
| packages/presentation | Renderer interfaces, asset resolution, animation events, and the initial PixiJS adapter. Future adapters can use Three.js. |

- Use TypeScript, Zod, Vite, React, PixiJS, and rot.js. Logical map coordinates and elevation must never contain pixel or camera assumptions.
- GameViewAdapter mounts, receives snapshots and events, resizes, and disposes. Adapters emit PlayerIntent through the SDK.
- BattleViewAdapter consumes EncounterView; selecting overworld or dedicated battle presentation cannot change combat rules.
- Provide fixtures, a mock SDK, representative event sequences, and a renderer development screen for independent UI work.
- Asset variants include sprite, portrait, icon, and optional 3D model. 3D initially presents the same logical simulation; full 3D physics is a separate feature.

## Authoritative Shared State

- Every adventure has a worldId and every participating character an actorId. The server verifies membership. No global current session.
- Maps persist tiles, entrances, occupancy, lighting, discoveries, environmental conditions, and history. Revisits load saved state.
- Entities persist stable IDs, definitions, asset references, coordinates, ownership, contents, health/durability, and statuses. An item belongs to exactly one map or holder.
- Characters persist abilities, stamina, needs, emotions, relationships, intentions, knowledge, and memories referencing actual events. Abilities impose hard limits; personality is adaptable.
- Serialize mutations per world. Requests carry idempotency keys and expected revisions. Validate, resolve, and commit state, receipts, RNG, and events transactionally. Reject invalid batches without partial mutations.
- Use server-owned SQLite behind WorldRepository. Persist worlds, memberships, snapshots, receipts, events, and asset jobs. Clients share a server; browsers do not own authoritative saves. Use one server process initially; implement a PostgreSQL repository before horizontal scaling.
- HTTP provides creation, snapshots, and actions. WebSockets broadcast committed updates with revisions/sequences. Reconnect resumes from a cursor or fresh snapshot. Filter secrets and private knowledge per actor.
- The server owns simulation phases, encounter turns, and DM pauses. A local menu cannot pause the shared world.
- Support multiple memberships, actors, independent connections, authorization, and concurrent action tests initially. Invitation UX and party onboarding may follow the initial single-human flow.

Actor commands: move, inspect, interact, pickUp, drop, give, use, push, attack, useAbility, wait. Validated consequences: spawn, destroy, transform, damage, heal, statuses, tile changes, discoveries, relationships. The DM proposes actions and introductions, never overwrites snapshots. Fixed mechanics include matching locks, switches, pushing, fire/water, food/rest, inventory, and bounded ability effects. No live JavaScript laws.

## Adventure And Presentation

- Begin with a short conversation establishing setting, tone, character, abilities, and stakes. Include Surprise me, Begin adventure, and saved adventures. Save an AdventureBrief.
- Generate a WorldBlueprint with four furnished maps, about three significant NPCs, 8-12 interactables per map, hidden facts, an engine-checkable objective, and alternative approaches.
- Validate references, connectivity, placement, capabilities, and executable solution sequences. Allow two repair attempts; preserve the brief on failure. Never regenerate existing saved rooms.
- WASD/arrows, click-to-walk, nearby interaction, click pickup, and inventory-to-target use. Ordinary actions need no model call.
- The local runtime defaults to Claude Code headless, as requested during implementation; retain GPT-6 Astra via OpenAI as an optional provider. Shared prompts interpret unusual intentions, play NPCs, introduce discoveries, and develop consequences. Give them canonical state, capabilities, relevant memories, and rejection reasons. Narrate committed outcomes.
- Opening speech/thought communicates one goal; discoveries unfold gradually. Journal records knowledge instead of multiplying quests. Thoughts and reactions reference witnessed conduct.
- Lightweight conflict uses shared entities and abilities. EncounterState references participants, phase, round, acting character, and outcome. A battle adapter can replace presentation without copying health or inventory.
- Bundle at least 100 tagged catalog assets based on compatible CC0 Tiny Dungeon/Tiny Town packs, supplemented with original art. Gameplay definitions remain separate from visuals.
- Missing artwork creates a persistent job and a recognizable proxy. Generate transparent raster with gpt-image-2.5-flare, normalize dimensions and anchors, cache it, and notify all clients. Failure retains the proxy and permits retry.
- Readable overhead environments, expressive portraits, distinct room palettes, contextual animation, large bottom dialogue boxes with reserved space. Reference screenshots are composition references only.
- Sound includes footsteps, pickups, locks, impacts, ambience, and musical transitions with separate volume controls. Full voice synthesis is deferred.
- Autosave every committed action. Model failure offers retry without altering state; artwork jobs run asynchronously. Checkpoints support defeat/failed-objective recovery. Recorded demos are explicitly separate from live generation.

## Implementation Order

1. Contracts, fixtures, renderer interfaces, mock network, development screen.
2. Simulation, transactional storage, subscriptions, reconnection, multiple-client synchronization.
3. Playable client, dialogue, inventory, journal, sound, lightweight combat, battle-adapter fixture.
4. Creation chat, blueprint validation/repair, live DM, character memory, asset generation.
5. Desktop/mobile polish and end-to-end demo with persistent consequences across travel and reload.

## Acceptance

Test deterministic replay, inventory/location invariants, atomic rejection, duplicate requests, concurrent clients, actor authorization, reconnect, hidden-state filtering, generated solution paths, persistent memory, model/art failures, and combat state across presentations. Browser tests cover desktop/mobile, nonblank rendering, focus, interactions, dialogue clearance, and complete journeys. Run live Astra/image smoke tests when credentials are available. Deliver setup docs and a local URL.

Defaults: original product code, no old-save migration, one initial renderer and human-player flow. Multiplayer onboarding, additional renderers, and a dedicated battle screen are extensions with explicit integration boundaries.
