# Backend Handoff

## User Direction

- Implement the fresh game plan in `docs/implementation-plan.md`.
- Use headless Claude Code with the local login by default. Do not ask for an OpenAI key; OpenAI is optional.
- Root now focuses on backend, simulation, persistence, and synchronization. The user's other agent owns the UI direction. Do not overwrite its work.
- User explicitly authorized commit and push to `https://github.com/Austin-Senna/astra-hackathon`. Git is initialized on `main`, with that `origin`; the remote was initially empty. Use normal pushes, never force-push.
- Preserve specs and handoffs across context compaction.

## Next Extension

### Prompt Sandbox Foundation Implemented

User clarified determinism means shared consistent saved state, not a fixed player move list, and requested the map sandbox first. Current implementation plan: `docs/superpowers/plans/2026-09-10-prompt-sandbox.md`.

- New `packages/contracts/sandbox.ts`, `packages/engine/sandbox.ts`, and `packages/engine/sandbox-fixture.ts` provide a typed atomic prompt resolution and a 21-entity courtyard. Changes cover freeform forms/ability strings/properties, object edits/spawns/removal, pathfinding/teleport/flying relocation, inventory transfer, and persistent social outcomes.
- `apps/server/sandbox-dm.ts` feeds projected current-scene state to headless Claude and repairs rejected proposals. New worlds with preset omitted or `sandbox` use this path; explicit house/dungeon and old saves retain legacy behavior.
- The starter map is authored and immediate, even in live mode. The creation brief is stored as context; live generation begins with player prompts, not the old four-room quest compiler.
- Rules are versioned descriptive DM context, NOT the future deterministic reaction interpreter. The model proposes each actual consequence, the server validates it, and the committed result is authoritative. Do not claim automatic fire/wind/contact simulation or full media/tool harness delivery.
- Sandbox objective completion no longer ends the world. Existing movement updates saved facing. Removed entities retain private tombstones, and sandbox metadata is filtered from unauthorized views.
- Asset enqueue no longer truncates a multi-object turn to two jobs; all missing non-hidden asset IDs are persisted once and processed by the existing serial queue.
- The separate UI/SDK worker has integrated sandbox selection and is now adding a story direction on top. Explicit `preset: 'sandbox'` is the stable integration route. Root did not edit or browser-verify its UI files.

Live Claude verification: `scripts/smoke-sandbox.ts` verified dragon form, two burning crates, sentinel emotional response, water extinguishing, idempotent retry without a second model call, and persistence after reopening SQLite. `scripts/smoke-sandbox-freeform.ts` passed in 11 seconds: weightless condition, remote telekinetic pickup without moving, and a wall becoming a flowering passage. `scripts/smoke-sandbox-consumption.ts` passed in 23 seconds: exactly ten NEW chickens spawned and consumed, existing chicken untouched, HP 3 -> 23 and MP 1 -> 20. An earlier live counting error led to a counted-spawn primitive and stronger assertions. Worlds are under ignored `data/smoke-sandbox/worlds.sqlite`; do not commit local credentials/data.

The latest Astra-inspired expansion removes fixed status enums and prompt pickup adjacency/eight-item limits. Free-text conditions, map `tileStates`, generic properties (starter MP/maxMP), counted spawning, and dialogue-driven encounter start/end are supported. Technical bounds, atomic ownership, hidden-state protection, and other players' agency remain enforced. Rules are still prompt-interpreted, not autonomous reaction scripts. Old explicit house/dungeon saves retain the legacy DM; start an explicit sandbox to exercise this foundation.

Final sandbox commit verification: staged-only snapshot `/tmp/astra-sandbox-stage-20260910-1320` passed 108 tests across 13 backend/contracts/engine files and `npx tsc --noEmit -p tsconfig.backend.json`. Independent review confirmed the two encounter authority fixes; all 22 sandbox engine tests passed. This excludes concurrent story/UI changes. A full-worktree typecheck during that work reported a `story.ts` memory-kind typing error, outside this commit; the other worker must verify its completed integration independently.

Latest decision, September 10: **freeform by default**. The user explicitly approved immediate creative transformations and open-ended actions, not class/progression gates. The updated dynamic-mechanics spec supersedes earlier protected quest paths, mandatory primary-goal policy, and social-only first delivery. Build toward a dense reactive sandbox: new form plus directional ability authored and executed together, persistent object/NPC consequences, optional causal story threads, and continued play after objective completion. Do not ask again whether default play should be freeform. Technical validation and multiplayer authority remain required; a small fixed ability enum is not the intended end state.

Concurrent work now touches contracts, engine, model, assets, generation, and service as well as UI-owned paths. It includes a dragon transform and fixed fireBurst implementation in the working tree. These changes belong to the other worker; read and preserve them, coordinate integration, and do not sweep them into a root docs commit. They have not been verified by root and do not establish that the general dynamic-definition harness exists.

User approved AI-authored data-defined mechanics above trusted primitives, and added modifiable reactions: fire/water extinguishing, wind spreading fire, chicken transforming to roasted chicken, and fast new output visuals. Expanded design: `docs/superpowers/specs/2026-09-10-dynamic-mechanics-reactions-design.md`. The prompt sandbox implements persistent model-adjudicated outcomes; the full reusable automatic reaction interpreter remains future work.

Latest requested additions: player form transformations must synchronize the in-world model, portrait, profile icon, and abilities; build a controlled AI tool harness with TTS, SVG/image requests, ability grants, typed character/profile updates, and story-objective creation. The expanded design now covers versioned appearance bundles, stale-art rejection after reversion, allowed tool schemas, transactional side-effect outbox, local/headless tool dispatch without shell access, and explicit provider availability. These remain specifications, not shipped tools.

Earlier pain point: 'I kiss the sentinel' had no supported social state transition. The sandbox now has a generic social operation for NPC mood, relationship, and attributed memory, tested with that example. User also requested emoji/emote, SFX, and VFX primitives. The broader media harness in `docs/superpowers/plans/2026-09-10-social-reactions-first-slice.md` is not part of this backend foundation; concurrent presentation work must be verified separately.

## Implemented

- Shared Zod contracts with action-specific required fields, world/entity state, events, assets, encounters, session credentials, and synchronization cursors.
- Pure deterministic engine, four-room house and dungeon fixtures, key/lever alternatives, direct interactions, inventory, abilities, combat, witness memories, actor projections, and blueprint validation.
- Authoritative SQLite repository with transactional state/events/receipts, optimistic revisions, hashed actor credentials, checkpoints, and artwork jobs.
- HTTP and WebSocket server with per-world serialization, actor-filtered updates, bounded reconnect history, explicit cursor/reset semantics, and local-origin checks.
- Claude subprocess transport with disabled tools, structured output, deadlines, and a bounded queue. Optional OpenAI uses JSON mode followed by local Zod validation; live OpenAI is not tested without credentials.
- Live four-room adventure compilation with executable solution replay and repair. DM command proposals are validated atomically; model failures leave state unchanged.
- Persistent missing-art jobs, failure/retry/restart handling, Claude 16x16 pixel data decoded to 32x32 PNGs.
- Catalog of 301 assets, including 37 original hero sprites; CC0 town/dungeon tiles and audio; original generated house cover. Credits in `public/CREDITS.md`.
- UI integration fixtures, command reference, protocol docs, and independent backend TypeScript configuration.

## Verification

Latest root verification on September 10:

- `npm test -- apps/server packages/contracts packages/engine`: 78 tests passed across 9 files.
- `npx tsc --noEmit -p tsconfig.backend.json`: passed.
- `npm audit`: zero vulnerabilities at last check.
- Live Claude adventure: The Star That Fell Wrong, 4 rooms, 42 entities, replayed solution passed. Stored in `data/smoke/worlds.sqlite`.
- Live Claude DM pickup: correct targetId, key actually held, revision 1, tick 1. `scripts/smoke-dm.ts`.
- Live Claude artwork: 22 seconds, valid 32x32 PNG, visually inspected at `data/smoke/eyepiece.png`. Initial larger pixel request timed out; failure was explicit and led to the smaller format.
- HTTP authored playthrough: 72 committed actions, four visited maps, completed objective, persistent remembered kindness. `scripts/smoke-api.ts`.
- Engine and backend review fixes approved. Reports: `docs/engine-report.md`, `docs/backend-fix-report.md`.

## Runtime

Backend is running at `http://127.0.0.1:8790` in exec session 98867 (`npm run dev:server`). Leave it available for the UI agent. Provider/asset check: `/api/info`.

Node 24.12 supports node:sqlite with an expected experimental warning. Local Claude login/network and localhost test listeners need tool escalation in this sandbox. Scripts can use `node --import tsx` to avoid the tsx CLI's sandbox IPC issue.

No model smoke process remains active. Only the intentional development server should remain running. Do not commit `.env`, `data`, reference screenshots, local generated-image caches, or credentials.

## UI Ownership And Remaining Work

The other agent is actively adding `apps/client`, `packages/client-sdk`, `packages/presentation`, `public/tabletop`, `docs/tabletop*`, and `scripts/import-tabletop-assets.py`. These are excluded from the backend commit. Shared package manifests preserve its Three.js dependency additions.

Read `docs/ui-handoff.md`, `docs/client-task.md`, `docs/commands.md`, and `public/fixtures/house.json`. UI clients must track authoritative cursor independently of visible events, adopt full snapshots on reset, and keep renderers separate from engine/network/database logic.

Full-workspace tests/typecheck can temporarily fail on unfinished UI modules; backend verification is isolated above. Production UI build and desktop/mobile browser verification remain the UI integration stage. No claim is made that the complete frontend game is finished.

The backend is local/single-process, not production multiplayer hosting. SQLite calls and simulation are synchronous. Public deployment needs authentication hardening and load testing; horizontal scaling needs an asynchronous shared repository and distributed world/job coordination. Party onboarding, multiple simultaneous encounters, and learned numeric personality policies remain future extensions.

## Publication

Backend implementation was pushed to `main` as `0929e0d`. Check `git log -1`, `git status`, and `origin/main` for later design/UI commits; the requested destination is `Austin-Senna/astra-hackathon`. Never sweep concurrent UI work into a backend commit or reset it away.
