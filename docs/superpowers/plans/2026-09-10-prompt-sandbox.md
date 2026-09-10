# Prompt-First Map Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the tightly coupled contract, resolver, and service changes. Track progress here.

**Goal:** Make a populated, persistent map playable through open-ended prompts without a default ability menu or mandatory quest chain.

**Architecture:** The AI resolves a prompt against authorized state into typed entity changes and dialogue. A pure server resolver validates the entire proposal and commits one revision through the existing SQLite/receipt/WebSocket path. Determinism applies to resolving and replaying that proposal, not to forcing identical model output for repeated prose.

**Tech Stack:** Existing TypeScript, Zod, SQLite, Vitest, rot-js, and headless Claude Code.

**Spec:** `docs/superpowers/specs/2026-09-10-dynamic-mechanics-reactions-design.md`, Freeform By Default. This plan delivers the prompt-first map foundation, not the complete reusable reaction interpreter, media harness, or story-thread subsystem.

## Global Constraints

- Work in the existing shared workspace to integrate with the user's active UI direction; preserve its concurrent edits. Root stages only its own changes.
- Headless Claude remains tools-disabled. Model output cannot execute source code, SQL, or network requests.
- Model receives only actor-visible state; no hidden objects, other player inventories, or private thoughts.
- Do not implement a new battle screen, mandatory quests, or new default move menu.
- Existing direct action APIs remain compatible. Sandbox prompts are the main creative interaction path.
- Failed proposals leave state, events, and database unchanged. Retry IDs replay one committed outcome.

## Task 1: Typed Sandbox Resolution

Files: create `packages/contracts/sandbox.ts`, `packages/engine/sandbox.ts`, `packages/engine/sandbox.test.ts`; add optional sandbox metadata to `packages/contracts/index.ts`.

Interface: `resolveSandboxTurn(world: WorldState, actorId: string, proposal: SandboxProposal): EngineResult`. Proposal contains bounded edits (spawn, update, relocate, remove), public speech/private thoughts, and durable world rule descriptions. Edits cannot modify membership, IDs, holder/inventory links directly, other players, hidden entities, or remote maps. Relocation validates map bounds and occupancy; walk uses existing rot-js pathfinding, while explicit teleport/flying movement may relocate without a walk path. Transfer uses its own ownership-checked operation.

```ts
const result = resolveSandboxTurn(world, 'rowan', proposal);
expect(result.ok).toBe(true);
expect(result).toEqual(resolveSandboxTurn(world, 'rowan', proposal));
expect(world.revision).toBe(0);
```

- [x] Write failing tests for freeform transformation and object changes, exact replay, failed-batch rollback, hidden/remote/other-player rejection, transfers and inventory preservation, position validation, and presentation-only timing.
- [x] Run `npm test -- packages/engine/sandbox.test.ts` and confirm missing behavior.
- [x] Implement strict schemas and pure resolver. New forms and abilities are data strings, not a fixed enum. Preserve actor identity and history. Persist descriptions of invented rules for subsequent DM prompts; automatic trigger execution remains a separate extension.
- [x] Run targeted tests and backend typecheck.

## Task 2: Dense Sandbox Map And Service

Files: create `packages/engine/sandbox-fixture.ts`, `apps/server/sandbox-dm.ts`, `apps/server/sandbox.test.ts`; integrate `apps/server/service.ts`, `apps/server/http.ts`, and a small sandbox non-ending guard in `packages/engine/index.ts`.

Interface: `createSandboxWorld(id?: string, seed?: number): WorldState`; `resolveSandboxPrompt(model, world, actorId, text, targetId?)` returns an engine result, with bounded repair from validation errors. `preset: 'sandbox'` becomes the API default; explicit legacy house/dungeon remain supported.

```ts
const created = await service.create(brief, 'demo', 'sandbox');
expect(Object.keys(created.view.maps)).toHaveLength(1);
expect(created.view.entities.rowan.abilities).toEqual([]);
expect(created.view.status).toBe('active');
```

- [x] Test map population, no required goal, prompt persistence across reload, duplicate delivery, stale revision, model failure, and sandbox completion not ending play.
- [x] Implement a reachable courtyard with a water source, flammable objects, tools, food, containers, and two reactive NPCs. Use catalog proxies and existing asynchronous asset jobs.
- [x] Implement a sandbox-specific prompt with no fixed ability or quest restrictions, explicit concrete state changes, stateful NPC reactions, and narration tied to edits. Keep legacy prompt handling for explicitly selected chapters.
- [x] Ensure initial live sandbox creation uses the map immediately; do not run the old four-room quest compiler. Store the supplied brief as context; the first player prompt starts the live DM rather than an automatic model turn during creation.
- [x] Run scoped server/engine/contracts tests and backend typecheck.

## Task 3: Verification And Handoff

Files: create `scripts/smoke-sandbox.ts`; update `HANDOFF.md`, `docs/ui-handoff.md`, and this plan.

```ts
await service.dm(id, token, {
  requestId: 'dragon', expectedRevision: 0,
  text: 'I become a dragon and breathe fire forward, igniting the wooden crates.'
});
```

- [x] Run a live Claude prompt against an isolated saved sandbox; inspect canonical form/object/NPC changes, then reconnect and replay the request without another resolution.
- [x] Run full scoped regression tests, backend typecheck, and `git diff --check`.
- [x] Give the UI agent exact creation/input/state contracts. No claim that new UI controls or presentation cues render until that integration is verified.
- [ ] Commit only owned changes and normally push to `Austin-Senna/astra-hackathon`.

## Progress

- Baseline: 96 backend/contracts/engine tests passed September 10 before root sandbox edits.
- Approved direction: prompt-first, freeform by default, map sandbox before other subsystems.
- Execution note: contract/resolver/service changes are tightly coupled and executed inline; the user's separate UI agent retains UI ownership.
- Independent review caught remote reference mutation and metadata projection risks; fixed with private tombstones and view filtering. Follow-up review found multi-object artwork starvation; fixed queue persistence and added a regression.
- Live smoke: dragon transformation, two crates ignited, sentinel reacted, water extinguished both, retry deduplicated, SQLite reopen preserved revision/state. Subsequent spawn fix permits non-solid fire on solid-object tiles.
- Scope decision: the map is an immediate authored starter personalized through stored brief context and subsequent prompts. No automatic model call on world creation, no promise of a freshly generated map.
- Astra comparison: free-text conditions and tile descriptions, remote prompt transfers, arbitrary resource properties, counted spawning (up to 64 instances per operation), and dialogue-driven encounter outcomes replace gameplay allowlists. Safety bounds protect consistent state, not fictional plausibility.
- Live additional acceptance: weightlessness/telekinesis/flowering-wall passage passed in 11 seconds; exactly ten new chickens consumed with HP 3 -> 23 and MP 1 -> 20 passed in 23 seconds. Existing chicken remained untouched. Counted-spawn identities and asset sharing are regression-tested.
- Encounter review: unrelated players cannot advance another party's encounter round or indirectly end it by rewriting a participant. Two regressions were observed failing before the fix.
- Final staged-only verification: 108 tests in 13 files passed; backend TypeScript passed. Snapshot `/tmp/astra-sandbox-stage-20260910-1320` excludes overlapping story/UI work. Review approved the narrow encounter fixes.
