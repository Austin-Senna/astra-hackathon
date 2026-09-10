# Social Reactions And Expressive Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an open-ended social intention such as kissing the sentinel produce a validated, persistent NPC reaction and structured emoji, sound, and VFX cues.

**Architecture:** The model proposes a typed social outcome; the server validates and commits it through the existing deterministic engine. Mechanical consequences are distinct from transient presentation events. This is the first independently testable slice of the broader harness, not the entire dynamic-definition system.

**Tech Stack:** Existing TypeScript, Zod, Node, SQLite, Vitest, and Claude Code transport. No new generation provider is required for built-in emotes, sounds, or VFX.

**Spec:** `docs/superpowers/specs/2026-09-10-dynamic-mechanics-reactions-design.md`, especially First Delivery: Social Actions And Expressive Feedback.

## Global Constraints

- Player clients cannot directly grant themselves abilities or install rules.
- Speech/thought/narration remains presentation-only and does not advance simulation ticks.
- Preserve stable actor identity, ownership, inventory, memories, and current action compatibility.
- No arbitrary property patches, generated code, external asset URLs, or model-driven renderer code.
- Root owns engine/server/contracts. Coordinate UI/SDK changes with the user's separate agent; do not overwrite its uncommitted files.
- Use an explicit scoped test command while UI modules are in progress: `npm test -- apps/server packages/contracts packages/engine`.
- Use `npx tsc --noEmit -p tsconfig.backend.json` for backend verification.
- Stage exact owned paths and normally push reviewed commits to `Austin-Senna/astra-hackathon`; never force-push.

## Scope

Implement persistent emotion/relationship/memory consequences, one generic social-outcome command, a small DM tool boundary for it, and typed presentation cues. Full definition installation, player forms, quest creation, TTS, and novel asset generation remain separately planned subsystems. This slice does not claim to deliver those capabilities.

## Task 1: Social And Presentation Contracts

**Files:**
- Create `packages/contracts/social.ts`.
- Modify `packages/contracts/index.ts` and `packages/contracts/index.test.ts`.
- Create `packages/contracts/social.test.ts`.

**Interfaces:**
- Produces `SocialOutcomeSchema`, `SocialOutcome`, `PresentationCueSchema`, and `PresentationCue`.
- Add SocialOutcomeSchema to DMCommandSchema, not PlayerIntentSchema; only the server DM path may submit resolved outcomes.
- Add optional `actorId` and `targetId` attribution to MemorySchema without changing existing saved memories.
- Add a bounded canonical `socialHistory` field through a documented backward-compatible default during server load; new saves persist it. Omit this server-only cooldown/history data from WorldView. Coordinate the new attributed-memory fields with the SDK agent before deployment.

Canonical command shape:

```ts
type SocialOutcome = {
  type: 'resolveSocial';
  targetId: string;
  verb: string;
  mode: 'contact' | 'speech' | 'gesture';
  outcome: 'welcomed' | 'declined' | 'neutral';
  emotion: string;
  relationshipDelta: number;
  npcIntent: 'idle' | 'follow' | 'guard' | 'hostile' | 'flee' | null;
  memory: string;
  reply: string;
  cues: PresentationCue[];
};
type PresentationCue =
  | { kind: 'emote'; preset: string; anchorId: string; durationMs: number; audience: 'witnesses' | 'actor' }
  | { kind: 'sfx'; preset: string; anchorId: string; gain: number; audience: 'witnesses' | 'actor' }
  | { kind: 'vfx'; preset: string; anchorId: string; color: string; intensity: number; durationMs: number; audience: 'witnesses' | 'actor' };
```

- [ ] Write schema tests rejecting absent target/verb, out-of-range relationshipDelta, arbitrary cue URLs, excessive cues, and malformed color strings. Require relationshipDelta integer -2..2, verb 1..80 characters, emotion 1..80, memory/reply 1..1000, at most 3 cues, duration 100..3000ms, gain/intensity 0..1. Preset strings must resolve through the catalog in Task 2.
- [ ] Confirm the new tests fail before adding schemas. Test that `PlayerIntentSchema.safeParse({ type: 'resolveSocial', ...fields }).success` remains false.
- [ ] Implement strict schemas, exported types, and optional memory attribution. Use explicit required fields in the model-facing schema; npcIntent uses nullable rather than an ambiguous missing field.
- [ ] Add positive parsing and draft-7 JSON-schema export tests, including this accepted fixture:

```ts
const attempt = {
  type: 'resolveSocial', targetId: 'sentinel', verb: 'kiss', mode: 'contact',
  outcome: 'neutral', emotion: 'surprised', relationshipDelta: 0,
  npcIntent: null, memory: 'Rowan attempted a kiss; I was surprised.',
  reply: 'That was unexpected.',
  cues: [{ kind: 'emote', preset: 'surprise', anchorId: 'sentinel', durationMs: 1200, audience: 'witnesses' }],
};
expect(SocialOutcomeSchema.parse(attempt)).toEqual(attempt);
```

- [ ] Run `npm test -- packages/contracts` and the backend TypeScript check; commit only this task's files after review.

## Task 2: Persistent Social Resolution

**Files:**
- Create `packages/engine/social.ts` and `packages/engine/social.test.ts`.
- Modify `packages/engine/index.ts`, `packages/engine/fixtures.ts`, and existing engine tests where compatibility is required.
- Create `packages/assets/presentation-presets.ts` with semantic emote IDs, registered local sound mappings, and renderer-neutral VFX presets.

**Interfaces:**
- Consumes SocialOutcome and current WorldState.
- Produces `applySocialOutcome(world: WorldState, actorId: string, command: SocialOutcome, hooks: SocialHooks): void`, used only on the engine's private working clone. The helper has no database, model, rendering, or clock dependencies. Export SocialHooks from the same module with `emit(type: string, text: string, targetId: string | null, data: Record<string, unknown>): WorldEvent`, `speak(text: string, speaker: Entity | null, kind: 'speech' | 'thought' | 'narration'): WorldEvent`, and `remember(event: WorldEvent, kind: Memory['kind']): void`. Imports come from shared contracts; hooks close over the existing batch's revision/event allocator.
- Produces `presentationPresets` containing initial emotes affection/surprise/confusion/annoyance/sadness/laughter, SFX soft-chime/reaction-pop/impact, and VFX blush/hearts/sparks/glow/impact.
- Existing applyCommandBatch remains the atomic public entrypoint.

- [ ] Write failing tests against createDungeonWorld with Rowan adjacent to sentinel. A welcomed fixture changes emotion, applies relationship +1, records attributed memories for actor and target, and produces social/dialogue/cue events. A declined fixture is still `ok: true` and records its actual response.
- [ ] Add rejection tests for an out-of-reach contact, hidden/dead target, target of kind player, forged anchor, unregistered preset, and direct non-DM submission. Compare JSON snapshots to prove no mutation on rejection.
- [ ] Implement same-map contact reach 1 and non-contact reach 8 with the engine's existing visibility/reach policy. Validate targets through own-property lookup. Restrict cue anchors to the acting character or selected NPC.
- [ ] Apply emotion and bounded relationship changes, clamping social scores to -10..10. Append attributed memory events to both participants and permitted witnesses. Persist recent social-history tuples `{actorId,targetId,verb,tick,eventId}` with a 64-entry bound and omit them from client projections. Suppress repeated positive relationship gain for the same actor/target pair within 5 simulation ticks, even if the verb is rephrased; keep the declared response and memory.
- [ ] Integrate resolveSocial as one time-consuming command. Emit its reply and all cues inside that command so they do not create extra hunger/fire/retaliation ticks. Presentation cue emission itself must not change health or relationships.
- [ ] Add replay and serialization assertions:

```ts
const first = applyCommandBatch(world, 'rowan', [attempt], { dm: true });
const replay = applyCommandBatch(world, 'rowan', [attempt], { dm: true });
expect(first).toEqual(replay);
expect(first.ok && first.world.tick).toBe(world.tick + 1);
expect(JSON.stringify(world)).toBe(before);
```

- [ ] Update later NPC interactions to recall attributed relevant social memories without matching names in arbitrary strings or exposing another actor's private history. Existing keeper/locket behavior must continue passing.
- [ ] Run `npm test -- packages/engine packages/contracts`; review and commit exact changed paths.

## Task 3: DM Resolution And Safe Network Cues

**Files:**
- Create `apps/server/dm-tools.ts` and `apps/server/dm-tools.test.ts`.
- Modify `apps/server/service.ts`, `apps/server/service.test.ts`, and `apps/server/http.test.ts`.
- Modify `apps/server/repository.ts` only for backward-compatible social-history normalization and corresponding persistence tests.

**Interfaces:**
- `buildDmContext(world: WorldState, actorId: string, targetId?: string): { world: WorldView; actorId: string; targetId?: string; sharedMemories: Memory[]; presentationPresets: typeof presentationPresets }` returns projected state plus memories attributed to this actor and jointly witnessed by the selected NPC. NPC authored public dialogue remains subject to the existing nearby-speaker filter. No canonical socialHistory or another player's private interaction is exposed.
- `validateDmPlan(value: unknown): { commands: DMCommand[] }` uses the shared DM command schema with the existing maximum 6 commands; no direct database writes occur inside the model adapter.
- Existing POST /dm, ActionResponse, and WebSocket message types remain the public transport. Cue events use `type: 'presentation'` and strictly validated PresentationCue payloads in data, with stable event IDs and actor/map visibility metadata.

- [ ] Write a mocked-model service test returning resolveSocial for 'I kiss the sentinel'. Assert a committed NPC change, not merely a successful narration. Add a declined example and a repeated request-ID example proving no duplicated relationship gain or effects.
- [ ] Write a privacy test with two actors and a private cue: the second actor receives neither its payload nor its text. Assert visibleEvents preserves all validated public cue fields instead of losing them through the current generic data-key filter.
- [ ] Extract only the DM schema/context/prompt responsibility from service.ts into dm-tools.ts. Explain that novel social verbs are attempts resolved through resolveSocial, not unsupported mechanical actions. Instruct the model to use NPC persona, relationship, mood, and permitted shared memories; do not guarantee reciprocation or let the player dictate an NPC's internal outcome.
- [ ] Keep structured rejection and rejectedCommands repair. Never execute raw model text or allow a social outcome to mutate health, inventory, ownership, or arbitrary properties.
- [ ] Add schema-aware cue projection and serialization. Actor-private cues follow the source actor; public cues require the existing same-map/witness visibility rules. Replay responses retain canonical snapshots and cursor/reset behavior.
- [ ] Test actual SQLite reopen with NPC emotion, relationship, social history, and attributed memory preserved. Test a pre-extension saved fixture without socialHistory loads with an empty history rather than failing or resetting the world.
- [ ] Run `npm test -- apps/server packages/contracts packages/engine` and `npx tsc --noEmit -p tsconfig.backend.json`; review and commit exact paths.

## Task 4: Live Acceptance And UI Integration Contract

**Files:**
- Create `scripts/smoke-social.ts` and `docs/social-cue-handoff.md`.
- Update `docs/commands.md`, `docs/ui-handoff.md`, and `HANDOFF.md`.
- Renderer/SDK implementation remains with the user's UI agent; coordinate changes rather than editing those paths concurrently.

- [ ] Build a deterministic presentation fixture containing a social attempt, persisted NPC response, public emote/SFX/VFX, private cue, duplicate event, and reconnect reset. Include it in the UI handoff with exact payload fields and registered preset resolution.
- [ ] Add a live smoke using ModelProvider, GameService, and a temporary dungeon repository. Request a kiss attempt next to the sentinel. Assert `ok`, one social event, an attributed sentinel memory, and a legal response. Do not assert affection must increase: refusal or neutral surprise is a valid outcome. Reopen the repository and ask a follow-up; capture its response without leaking private credentials.
- [ ] Run the live smoke through local Claude. If the model chooses narration without resolving the attempt, capture the exact proposal and fix the prompt/tool contract before calling the test successful. Validate the actual stored consequence independently of the prose.
- [ ] Hand the UI agent the requirements: anchor emotes/VFX to the intended entity, use bundled sound/particle presets immediately, respect mute/reduced motion, deduplicate event IDs, skip expired reconnect cues, and never infer mechanics from an animation.
- [ ] Require UI integration evidence before claiming visible effects work: the sentinel scene must show a cue and play the mapped sound once; reload must retain NPC state without replaying stale effects. If UI integration is not yet available, report the backend event contract as complete and the visual acceptance as pending.
- [ ] Run scoped tests, backend typecheck, and `git diff --check`; review the full slice. Commit owned files and push normally without staging the other agent's unrelated work.

## Review Gate

This plan is ready for implementation review. It deliberately addresses the user's currently blocked social interaction before the larger registry/forms/TTS/quest authoring work. Implementation starts after approval of this first slice; it is not represented as already delivered.
