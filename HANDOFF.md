# Backend Handoff

## User Direction

- Implement the fresh game plan in `docs/implementation-plan.md`.
- Use headless Claude Code with the local login by default. Do not ask for an OpenAI key; OpenAI is optional.
- Root now focuses on backend, simulation, persistence, and synchronization. The user's other agent owns the UI direction. Do not overwrite its work.
- User explicitly authorized commit and push to `https://github.com/Austin-Senna/astra-hackathon`. Git is initialized on `main`, with that `origin`; the remote was initially empty. Use normal pushes, never force-push.
- Preserve specs and handoffs across context compaction.

## Next Extension

Latest decision, September 10: **freeform by default**. The user explicitly approved immediate creative transformations and open-ended actions, not class/progression gates. The updated dynamic-mechanics spec supersedes earlier protected quest paths, mandatory primary-goal policy, and social-only first delivery. Build toward a dense reactive sandbox: new form plus directional ability authored and executed together, persistent object/NPC consequences, optional causal story threads, and continued play after objective completion. Do not ask again whether default play should be freeform. Technical validation and multiplayer authority remain required; a small fixed ability enum is not the intended end state.

Concurrent work now touches contracts, engine, model, assets, generation, and service as well as UI-owned paths. It includes a dragon transform and fixed fireBurst implementation in the working tree. These changes belong to the other worker; read and preserve them, coordinate integration, and do not sweep them into a root docs commit. They have not been verified by root and do not establish that the general dynamic-definition harness exists.

User approved AI-authored data-defined mechanics above trusted primitives, and added modifiable reactions: fire/water extinguishing, wind spreading fire, chicken transforming to roasted chicken, and fast new output visuals. Expanded design: `docs/superpowers/specs/2026-09-10-dynamic-mechanics-reactions-design.md`. This is a design for review, not implemented functionality. Next step after design review is the implementation plan; coordinate contract changes with the separate UI/SDK agent.

Latest requested additions: player form transformations must synchronize the in-world model, portrait, profile icon, and abilities; build a controlled AI tool harness with TTS, SVG/image requests, ability grants, typed character/profile updates, and story-objective creation. The expanded design now covers versioned appearance bundles, stale-art rejection after reversion, allowed tool schemas, transactional side-effect outbox, local/headless tool dispatch without shell access, and explicit provider availability. These remain specifications, not shipped tools.

Latest concrete pain point: 'I kiss the sentinel' has no supported social state transition. User also requested emoji/emote, SFX, and VFX primitives. First-slice plan: `docs/superpowers/plans/2026-09-10-social-reactions-first-slice.md`. It proposes generic social outcomes with persisted NPC mood/relationship/attributed memory plus separate typed presentation cues, not one hardcoded verb per gesture. This plan is for implementation review; no social command or cue renderer has been added yet.

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
