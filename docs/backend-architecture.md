# Backend Architecture And Integration

## Boundaries

| Module | Owns | Must Not Own |
| --- | --- | --- |
| contracts | Zod schemas, world/entity/action/event/session types | Rendering, storage, model calls |
| engine | Pure simulation, validation, seeded RNG, visibility projection | HTTP, database, pixels, clocks |
| server/model | Bounded headless Claude transport; optional OpenAI | World mutations |
| server/generation | Compact adventure design compilation and executable solution checks | Rendering or live code evaluation |
| server/service | Actor authorization, per-world orchestration, projections | Presentation |
| server/repository | SQLite transactions, saves, receipts, memberships, events, art jobs | Mechanics |
| server/http | HTTP and WebSocket transport | Game rules |
| server/assets | Persistent raster artwork jobs | Gameplay definitions |
| assets | Tagged visual definitions | Entity behavior |

The client SDK and presentation packages are reserved for the UI agent. Their contract is `docs/client-task.md`.

## Why TypeScript And Node

TypeScript lets the engine, server, and browser share one set of checked action/state types. Zod validates values at the network and model boundaries; TypeScript alone is not runtime validation. JSON-serializable contracts keep alternate clients possible even if they do not use TypeScript.

Node's asynchronous I/O suits model subprocesses and persistent WebSocket connections. Claude runs in separate processes, not on the JavaScript event loop. Expensive model work is bounded to two active requests and eight waiting requests per ModelProvider. Artwork jobs are processed sequentially and share the model limiter in Claude mode.

Each world has an independent mutation lock. During a DM request, that world's competing mutation returns `WORLD_BUSY`; unrelated worlds can continue. Every command request includes an expected revision and unique request ID. Database revision checks remain the final guard. A retry with the same ID and payload returns its committed outcome without executing again; reusing the ID for different work rejects.

SQLite uses WAL and synchronous transactions. Simulation, JSON serialization, and SQLite operations currently execute on the event loop; large workloads can therefore pause other requests. This is deliberately a small local starting point, not a throughput claim. Load-test before capacity commitments. For horizontal scaling, replace the repository with asynchronous PostgreSQL transactions and database-backed per-world coordination; add shared publication/subscription and shared job workers. Do not merely start several current servers against one SQLite file and assume the in-memory locks coordinate them.

## Model Boundary

Default: `MODEL_PROVIDER=claude-cli`, `CLAUDE_MODEL=sonnet`, `CLAUDE_BIN=claude`.

The subprocess uses argument arrays without a shell, disabled tools, no project settings or MCP configuration, no persistent session, structured JSON output, and a deadline. Prompts arrive through stdin. Login failures and timeouts are explicit; there is no silent demo fallback. The subprocess inherits local Claude authentication and requires an already logged-in installation.

The optional OpenAI path uses JSON object mode with the contract schema included in the prompt, then parses and validates the output locally with Zod. It does not claim provider-enforced strict Structured Outputs for schemas with optional fields. Its SDK request construction is covered offline; live OpenAI operation remains unverified without credentials.

Adventure creation receives a compact four-room design, then compiles actual coordinates, entities, locks, alternative tools, facts, and an objective. Structural validation and a replayed solution run before persistence. Invalid designs receive up to two repair attempts. Maps and furnishing are model-authored within a conservative connected topology; this is not arbitrary procedural topology or unrestricted physics.

The DM proposes a bounded command batch. Simulation validates it atomically; rejection can trigger one repair attempt. Character abilities constrain real actions, while personality and memories inform dialogue. Text is not executable code. Speech/thought/narration creates events without consuming simulation time; physical actions advance mechanics.

Current character development is driven by persisted witnessed memories and relationship changes. Initial numeric personality traits are context, not a trained or automatically calibrated behavior model. More sophisticated personality learning is a follow-on engine policy; it must not silently add or remove hard abilities.

Claude artwork is constrained palette-indexed 16x16 data, enlarged with nearest-neighbor sampling into a 32x32 PNG. No model-authored JavaScript, SVG, or HTML executes. Missing art has a proxy and persisted status; failure can be retried. The optional OpenAI provider can generate raster art directly.

## Commands And Mechanics

Player actions: `move`, `inspect`, `interact`, `pickUp`, `drop`, `give`, `use`, `push`, `attack`, `useAbility`, `wait`.

DM additions: `spawn`, `setNpcIntent`, `say`, `think`, `narrate`. The DM cannot replace a world snapshot. Unsupported commands are rejected.

Current fixed mechanics include adjacent movement and travel, matching keys and lever tools, switches, containers, ownership and inventory capacity, food, water/fire, rest/mending, pushing, relationships and witness memories, seeded combat, defeat, and objective completion. Damage, consumption, and discoveries are consequences, not unrestricted DM setters. General transform/tile-edit commands and autonomous NPC pathfinding are not implemented.

There is one active encounter per world. The initial turn model supports the acting player against NPCs; unrelated actors can continue elsewhere but cannot attack into the encounter for free. Multiple simultaneous encounters and full party turn ordering require an engine extension, not a UI-only change.

## Storage And Security

Session tokens are random 32-byte values, stored only as SHA-256 hashes in SQLite memberships. Each request authenticates a world/actor pair. WebSocket credentials are sent in the subscription body, never in a URL. No public list of saved worlds is exposed.

Clients receive actor-filtered snapshots, not canonical worlds. Private memories and undiscovered objects must also be filtered from event streams and DM context. Existing map exploration is shared, while personal knowledge remains actor-specific. The database and server logs must not be exposed as static files.

The server binds loopback by default and rejects nonlocal browser origins. This is not a substitute for public deployment authentication, CSRF policy, TLS, account management, global abuse limits, or robust DNS-rebinding defenses. Keep it local until those are implemented.

## Recovery

Every successful command commits state, RNG, events, and idempotency receipt in one transaction. A disconnect does not undo a committed command. Reconnect begins with an authoritative snapshot; presentation should reconcile to its revision and deduplicate replayed event IDs. Do not infer global progress from the presence of visible events alone because some events are private.

The server sends an authoritative `cursor` independently of event visibility. Reconnect returns the newest bounded raw-event tail, then filters it by actor; `reset` indicates history truncation or an invalid future cursor. This deliberately recovers current state rather than promising unlimited offline animation replay. The client must adopt the snapshot and cursor even if the visible event list is empty.

Initial world creation saves a checkpoint. Owner restore resets chapter state at a new revision, preserving monotonically increasing commit history and request receipts. Other memberships cannot restore. Party checkpoint semantics need explicit agreement before enabling onboarding.

## Test Coverage

Focused suites cover deterministic replay and atomic rejection; inventory and reference integrity; key and lever solutions; combat boundaries; witness privacy; blueprint reachability; persistent SQLite reopening; authorization and stale/duplicate requests; different-world concurrency; two-client WebSocket updates and reconnect; model transport parsing and bounded work; raster validation; artwork failure/retry/restart; generated chapter compilation and replay.

Live smoke scripts complement those deterministic tests. They are not part of `npm test` and require a working local model login. UI usability, canvas rendering, browser journeys, and a frontend production bundle remain the UI integration stage.
