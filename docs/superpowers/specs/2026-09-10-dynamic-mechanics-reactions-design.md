# AI-Authored Mechanics, Reactions, And Fast Visuals

Status: freeform-by-default direction approved September 10; broader harness not yet implemented. This document supersedes earlier quest-first and character-gating assumptions.

## Intent

Keep a deterministic, server-owned simulation while allowing the AI DM to invent and install new entity definitions, abilities, and reactions as validated data. The AI may change the rules of a particular adventure without editing or executing server source code. The user approved this boundary and explicitly requested mutable reactions and fast artwork for new results.

Examples to support:

- A new light projectile travels, strikes a target, deals bounded damage, and disappears.
- An existing fire with no water reaction can gain an extinguishing reaction.
- A newly introduced wind effect can spread fire downwind.
- A chicken entering fire can become a roasted-chicken item, with a newly requested visual if none exists.
- A player transforms into a demon form: the in-world representation, portrait, profile icon, and allowed form abilities update coherently without replacing the player's identity.

These examples are adventure rules, not universal physical or biological claims. Different worlds may define different reactions.

## Freeform By Default

The user explicitly chose unrestricted creative play as the default. Accept any gameplay intention for DM interpretation; do not reject it merely because it names a new form, ability, material, object, social verb, or story direction. No class unlock, prerequisite quest, established personality, genre convention, or protected solution path is required for a player-requested invention. Stricter adventure rules are opt-in, not the default. Character history informs reactions and dialogue rather than policing the player's choices.

When an intention needs missing mechanics, the DM authors the definitions and resolves the action in one validated transaction where possible. "I become a dragon and breathe fire forward" must change the character's form, grant an actual fire ability, and apply its directional effects to the world, not substitute a refusal, an unlock quest, narration alone, or a mandatory named enemy. Saved facing determines "forward"; movement updates facing, and an explicit direction can override it. Walls, affected objects, and downstream reactions resolve through canonical simulation rules.

Freeform means open-ended intentions and authoring, not unrestricted server execution or guaranteed outcomes. NPCs can respond according to their own state. Clients cannot forge world outcomes, edit credentials, or control another player's identity. Technical bounds prevent infinite reactions and unbounded computation; they must not become arbitrary gameplay restrictions such as "only mundane objects" or "only these six abilities." If an intention cannot yet be expressed by supported primitives, return a specific capability gap and a concrete supported alternative without claiming the original action happened.

The default world is a persistent reactive sandbox. An opening motivation provides context through characters, not a mandatory quest chain. Objectives are optional story threads arising from committed interactions, with causal event references and tracked resolutions. Merge related consequences into existing threads; do not generate a new task for every action. Players may ignore, change, complete, or invalidate a thread without freezing the world. Record the changed situation instead of protecting quest objects from gameplay or silently restoring a required solution.

World generation prioritizes things to do over quest count: reachable characters, portable objects, usable fixtures, materials with reactions, and spatial combinations. Every initial room must have multiple non-quest interactions with persistent effects. Generated objects should expose meaningful affordances, not just inspection text. Discover consequences through play and NPC responses.

The next integrated acceptance scenario is a small, dense sandbox: transform into a dragon; breathe fire forward across multiple eligible objects; extinguish it with water; spread it with authored wind; transform a cookable entity; interact socially with a witness; observe persistent memories, synchronized appearance, and emoji/SFX/VFX cues. A resulting story opportunity is optional, grounded in those actual events, and does not stop further play. This takes priority over delivering another isolated hardcoded ability or a quest-only chapter.

## Architectural Choice

Recommended: a versioned data-definition registry and bounded reaction interpreter above trusted engine primitives. This combines flexible content with deterministic execution and server validation.

An alternative is sandboxed generated scripts. That would support more arbitrary behavior, but introduces execution isolation, resource accounting, debugging, and replay complexity. It is deferred. Editing the live backend is not an available DM operation. A genuinely missing primitive becomes a developer-reviewed extension request rather than fabricated success.

## Definitions Are Not Artwork

Separate three concepts:

1. Entity definition: what a thing is, its gameplay tags/components, default state, permitted interactions, and asset reference.
2. Reaction/ability definition: when something happens and which engine effects it produces.
3. Asset definition: visual/audio variants used to present the entity or effect.

A fire sprite or model is not executable game logic. Multiple fire entities may share artwork while following different world rules. Adding a water reaction changes the world's active reaction registry, not a shared global image record. Existing fire instances immediately use the new rule for future qualifying events.

## Registry And AI Authoring

Introduce a renderer-independent mechanics package for definition schemas, validation, and compilation. The engine consumes only validated definitions and compiled primitive instructions.

Definitions have stable IDs, immutable versions, content hashes, provenance, and explicit dependencies. The world's registry points to its active versions. AI proposals can install entity, ability, status, and reaction definitions; replace an active reaction with a new version; or disable a rule. Definitions do not contain arbitrary expressions, JavaScript, filesystem paths, or network calls.

Activation is a server transaction with an expected world/registry revision and idempotency key. Validate the entire dependency bundle, including any new output item, before activation. Persist the definitions, activation event, and updated world together. Conflicting updates reject. Prior versions remain available for replay; replacing a rule never rewrites earlier events.

World generation can submit a complete rules bundle. During play, a DM proposal may install definitions and execute the triggering action in the same validated atomic batch. Player clients cannot directly grant themselves abilities or install rules; their freeform requests go through the authorized DM authoring path. Technical budgets, actor ownership, and state integrity still apply. Quest relevance and existing character abilities are not default authoring restrictions.

AI-generated changes apply within one world by default. Sharing content with a global library is a separate reviewed promotion operation, not a side effect of one session's DM.

## Trusted Primitives

Initial primitives should cover:

- Select a bounded set of entities by definition, tag, status, ownership, distance, or contact.
- Check typed conditions on approved state fields.
- Apply bounded damage/healing, consume resources, and add/remove timed statuses.
- Spawn, remove, transform, or displace an eligible entity while preserving world invariants.
- Create a projectile or area effect with logical position, direction, lifetime, and collision behavior.
- Schedule a bounded follow-up effect on a simulation tick.
- Emit a renderer-neutral visual/audio event.

Abilities compose these primitives with a targeting contract, character requirements, resource costs, range, and cooldown. Statuses compose supported modifiers rather than arbitrary property setters. Unknown primitive names reject with a structured capability-gap report that the DM can use to revise its proposal.

Limits are explicit and independent of prose: maximum targets, range, spawn count, damage, duration, scheduled work, and rule evaluations. Ownership, membership, and canonical identifiers cannot be overwritten by definition data. Quest references must remain historically valid when their targets change or disappear; this does not make quest targets invulnerable.

## Reactions

A reaction contains:

- Trigger: contact-enter, explicit application/use, projectile hit, status transition, destruction, or scheduled simulation tick.
- Participants: named selectors such as source=fire and other=water.
- Conditions: typed predicates such as intensity, direction, material tag, or missing wet status.
- Effects: an ordered list of trusted primitive operations.
- Resolution metadata: priority, exclusive group, repeat policy, and bounded cooldown where relevant.

Rules match semantic tags or definition IDs, not artwork names. New tags such as wind can be authored without extending a hardcoded element enum, but tags themselves do nothing until a rule consumes them.

Illustrative rule, not the final wire schema:

```json
{
  "id": "water-extinguishes-fire",
  "version": 1,
  "trigger": "contactEnter",
  "participants": {
    "source": { "tag": "fire" },
    "other": { "tag": "water" }
  },
  "priority": 100,
  "effects": [
    { "op": "removeEntity", "target": "source" },
    { "op": "emitVisual", "preset": "steam", "at": "source.position" }
  ]
}
```

Bindings capture required primitive values before mutation, so a visual can still refer to a removed entity's former position. Effects cannot dereference arbitrary deleted state.

### Required Example Behaviors

| Rule | Gameplay effect | Presentation |
| --- | --- | --- |
| Fire + water | Remove eligible fire; optionally consume a declared amount of water. | Steam and extinguish sound. |
| Fire + wind | Spawn limited fire on valid downwind flammable tiles, avoiding duplicate occupancy. | Leaning flame and wind streaks. |
| Chicken + fire | Transform the eligible non-player chicken into the installed roasted-chicken definition. | Replace its visual with a food proxy, then generated artwork when ready. |
| Sunshard hits target | Apply bounded damage to an eligible target; remove projectile. | Impact flash and sound. |

Persistent contact and contact-enter are different. A chicken does not repeatedly transform on every unrelated player action. Continuous effects require an explicit tick trigger/cadence. Wind direction is stored state, not inferred independently by each client.

## Determinism And Cascades

Resolve triggers from committed simulation actions, not rendering frames or model timing. Use world-owned logical ticks and seeded RNG where randomness is explicitly permitted. Existing actions advance ticks; presentation-only narration does not. The first implementation remains action-ticked rather than introducing an uncontrolled real-time scheduler.

Order candidates deterministically by priority, rule ID/version, and participant IDs. Define exclusive groups for competing outcomes. Extinguishing has priority over spreading for the same fire in the example bundle. Effects whose participants were removed or transformed by an earlier winning rule are skipped deterministically.

Track processed trigger/rule/participant tuples and bound reaction depth, evaluations, spawns, and scheduled effects. Newly spawned spread-fire cannot recursively spread indefinitely within the same tick. Invalid or over-budget cascades reject the entire action batch without a partial save. The DM receives the rejection and can repair; it must not narrate success first.

Rule changes affect future triggers. Existing unresolved actions can include a rule installation before their first resolution, but already committed contacts are not retroactively reinterpreted. Missing reactions normally mean no additional mechanical effect, not a model call on every collision. The DM can explicitly propose a new reaction when the story needs it.

## Transformation Invariants

Use an explicit transform primitive rather than arbitrary entity replacement. For the cooking example, preserve stable entity identity and location while changing its definition and permitted gameplay state. Record prior and new definition versions in the event so memory and provenance survive.

Every transform declares inventory handling: preserve only when compatible, otherwise spill contents to validated positions or reject. Do not silently delete held items. Clear incompatible AI intent/abilities/statuses according to a validated transformation policy. Relationships and historical references must not become dangling pointers. Player actors use the identity-preserving character-form path, not destructive item conversion. Objective sources may transform; update the affected story thread instead of prohibiting the transformation.

Validate the output definition before consuming or transforming the input. A missing visual is allowed; a missing gameplay definition is not. Repeated delivery of the same action/reaction cannot produce duplicate roasted items.

## Character Forms And Visual Identity

Character form changes are distinct from destructive item/entity conversion. An authorized ability or story event may apply a validated form to a player; an ordinary unprivileged environmental transform cannot turn a player into an unrelated item or remove their membership.

Keep the character's stable actor ID, owner, inventory, memories, relationships, and progression. A form defines explicit additions/modifiers, appearance, optional voice preset, duration, and reversion policy. Do not overwrite all abilities: track which grants belong to the form, so reverting removes those grants without deleting abilities earned elsewhere. Only validated mechanics change collision, targeting, or stats; a visually larger mesh cannot silently change simulation rules.

One appearance bundle links a versioned identity description and reference assets to the in-world sprite/model/recipe, dialogue portrait, profile icon, and optional voice profile. Every UI surface resolves the same active appearance version. The appearance description carries recognizable character traits and art direction so separate generation jobs do not independently invent different characters.

On transformation, commit the new form and a complete compatible fallback bundle together. A demon model/proxy must not coexist with an accidentally retained human portrait due to unrelated component state. Use cached demon-form variants or approved transformation recipes first; schedule missing variants in the background. Publish quality upgrades as a coherent bundle for the renderer's required surfaces. A native generated 3D model is optional when a compatible existing-model recipe or billboard satisfies the immediate presentation tier.

Persist bundle/version provenance and keep the previous form for explicit reversion. If demon artwork completes after the character has returned to human form, retain it in cache but do not activate it. Reject stale attachment requests using the character's expected appearance version. Old dialogue events can retain their original speaker appearance/voice version; present-day profile/world views use the current version.

## Controlled DM Tool Harness

The AI should operate a small, explicit server tool registry instead of a growing prompt that loosely describes every side effect. Each tool has a versioned schema, purpose, preconditions, permission scope, cost/latency class, deterministic validation, and structured result/error. The model adapter remains replaceable; game rules do not depend on Claude-specific tool syntax.

Suggested public tool surface:

| Tool | Responsibility and boundary |
| --- | --- |
| `readWorld` / `inspectEntity` | Read authorized actor-visible state and affordances, with a revision. No generic secret-bearing database access. |
| `defineEntity` / `defineAbility` / `defineReaction` | Propose versioned data definitions using available primitives. Return validated handles or precise rejection. |
| `performAction` | Submit a typed intention through the deterministic engine, never an arbitrary state patch. |
| `addAbilities` | Grant installed abilities through the authorized DM path, including abilities invented at the player's request. No default progression gate; clients cannot forge grants. |
| `transformCharacter` | Apply/revert a validated form and its coherent appearance bundle. Preserve actor identity and persistent history. |
| `updateCharacter` | Update explicitly allowed profile fields through typed sections, not arbitrary property paths. Mechanical changes use their dedicated commands. |
| `createStoryQuest` | Create or update an optional story thread grounded in committed events, with valid references and resolution conditions. Merge related consequences; never impose a mandatory quest chain or end the sandbox on completion. |
| `narrate` / `talk` / `think` | Commit appropriately scoped dialogue referring to real events. Thoughts remain actor-private. |
| `tts` | Request narration/dialogue audio for an authorized committed dialogue ID, with a speaker/voice version. Does not establish game facts or replay audio globally on reconnect. |
| `createSvg` / `createImage` | Request visual artifacts with an appearance/asset version, style, purpose, references, and fallback. Return a cached asset or persistent job handle, not a world mutation. |
| `attachAppearance` | Atomically attach a validated visual bundle to the expected character/form version. Cannot activate stale artifacts. |
| `getJob` | Inspect an authorized artifact job without exposing another world's hidden content. |

The exact wire schemas and naming will be fixed in the implementation plan. The important distinction is between authoring content, executing mechanics, committing narration, and requesting media. A tool such as `updateCharacter(section="profile", ...)` cannot mutate health, abilities, inventory, ownership, or credentials through a generic object patch.

### Execution And Transactions

Claude Code currently runs with its own shell/filesystem tools disabled. Keep that restriction. Initially the harness can receive structured tool-call batches from the existing headless transport and dispatch only registered server operations. It does not need to expose Bash, filesystem editing, or arbitrary MCP tools to the DM. A later native tool-calling provider can use the same registry.

Use a bounded plan/execute/result loop. Independent artifact requests may run concurrently within resource limits; dependent operations use typed handles from earlier results. Limit tool rounds, calls, depth, wall time, and cost. Stale revisions, missing definitions, illegal actions, unavailable media providers, and validation failures return structured errors that allow targeted repair.

Separate read-only tools, transactional world changes, and asynchronous external side effects. Validate and simulate world changes before commit. Write an outbox record for associated media work in the same database transaction; workers perform that work afterward. Failed world batches must not emit success narration, TTS, or leaked artifact attachments. Failed media jobs must not undo an already valid world change.

Tool calls carry idempotency keys. Retried commands cannot grant an ability twice, create duplicate quests, or enqueue duplicate image/audio generation. Record tool arguments, authorized actor, definition versions, validation/execution results, committed event IDs, job IDs, and timing for debugging. Do not log credentials or private model reasoning. Scope persisted traces and their content as carefully as world state.

### Voice And SVG Boundaries

`tts` is a harness capability backed by an adapter, not something Claude Code itself can synthesize. The first no-key path emits an explicitly identified browser-speech request for an authorized committed line; the client checks local availability and voice preferences. This does not promise identical voices across devices. A shared server-generated voice asset requires a separately configured speech provider and is an optional later adapter. Absent capability returns an explicit unavailable status while text dialogue still works. Use configured synthetic/licensed voices; do not infer real-person voice cloning from a profile image or character name.

Key audio by committed text, speaker/voice version, language, and synthesis settings. Queue playback by dialogue event, deduplicate IDs, and scope private thoughts to their intended actor. A voice failure cannot make the dialogue disappear. A narrator voice and an NPC voice are roles/presets, not separate sources of authoritative story state.

`createSvg` should accept a bounded scene description compiled by a trusted renderer for simple icons, portraits/proxies, and effects. If a provider emits SVG markup, validate a strict allowlist and rasterize in an isolated, resource-limited process; disallow scripts, foreign content, external fetches, event handlers, and unbounded structures. Never insert raw model SVG into the application DOM. Complex art uses `createImage`; choosing SVG does not make generation inherently instantaneous or higher quality.

### Demon Transformation Example

1. Install a validated demon form and any new abilities/reactions it references.
2. Validate the definition and actor authorization. A player-requested form is permitted by default without a prerequisite quest or class unlock.
3. Apply the form, its gameplay grants/modifiers, and the matching model/portrait/icon fallback bundle in one commit.
4. Emit a transformation event consumed by every connected client's world, profile, and dialogue surfaces.
5. Request missing visual variants and optional committed speech audio in the background, sharing one appearance description/reference set.
6. Attach a completed quality-tier bundle only if the intended form/version is still current. Reversion follows the same synchronized path.

This supports a rich harness without making a tool call equivalent to permission to change any backend field.

## Social Actions And Expressive Feedback

The existing engine cannot resolve an action such as kissing the sentinel into a changed relationship or emotional state. Its DM prompt disallows claiming unsupported actions happened, and its available command schema lacks a social-outcome operation. More creative prompting alone cannot fix that missing state transition.

The first delivery should support open-ended social intentions through a generic validated outcome, not add a hardcoded engine verb for every kiss, hug, apology, compliment, or threat. The AI interprets an attempt and chooses a context-sensitive NPC response. The engine validates physical reach, participants, authority, and bounded effects, then persists the chosen outcome atomically. Deterministic replay reuses that outcome; it never asks the model to decide it again.

An NPC can reciprocate, recoil, become confused, or respond neutrally. A valid attempt with an unfavorable response is a game outcome, not an unsupported-command error. The player cannot dictate another human player's feelings or claim guaranteed NPC affection by wording the prompt as a completed result.

Initial social effects: change the targeted NPC's emotion, apply a bounded relationship delta toward the acting character, record an attributed memory, optionally change an allowed NPC intent, and commit dialogue. Preserve existing inventory/health/ability rules. Contact gestures require adjacency; non-contact gestures or speech use an explicit supported reach. One resolved social attempt advances one simulation step; its speech, emoji, sound, and VFX do not cause additional hunger/fire/combat steps. Repeated positive social gestures are rate-limited in simulation state so they cannot farm unlimited relationship points.

Social memory records include actor/target attribution and an event ID. Future conversations may use the relevant jointly witnessed history without exposing memories involving other players. A reload or reconnect must retain the NPC's mood, relationship, and recollection even after the transient feedback ends.

### Presentation Primitives

- `emote`: a registered semantic emoji/emote such as affection, surprise, annoyance, confusion, sadness, or laughter; an entity anchor; bounded duration; and audience. The renderer can use an emoji glyph, icon asset, or billboard.
- `sfx`: a registered sound or approved synthesis preset, anchor, bounded gain, and audience. No arbitrary external URL supplied by a model.
- `vfx`: a registered effect preset, anchor, bounded color/intensity/duration, and audience. Examples include blush, hearts, impact, sparks, glow, and a shockwave. No generated code or shader execution.

These are structured committed presentation events, not emoji characters buried in narration. They do not independently change health, affection, or any other mechanic. A heart visual alone is not evidence that affection increased; the persisted outcome supplies that fact. Presets are replaceable presentation data, not renderer-specific scene objects inside the backend.

Clients play fresh cues once, honor mute/reduced-motion/accessibility preferences, and discard expired cues during reconnect. State snapshots remain authoritative. Actor-private thoughts and their associated cues must not be broadcast to other players. Bundled emoji/sound/particle recipes need no generative-model request, so routine reactions can appear as soon as the social result commits.

The sentinel acceptance scene must show an actual persisted NPC reaction, attributed memory, a suitable emote, sound, and VFX; speaking again must reflect the interaction. The backend produces the validated outcome/events. Visible rendering and playback must be integrated with the separate UI agent rather than claimed complete from an event payload alone.

## Fast Asset Pipeline

Gameplay must not wait for novel artwork. Our observed Claude pixel-art smoke took 22 seconds; this is evidence that cold generation is not instantaneous, not a latency guarantee.

Use this resolution order:

1. Exact cached content/style/variant match.
2. Compatible catalog asset or pre-generated variant.
3. Immediate approved visual recipe: tint/material, bounded particles, scale, known mesh composition, or a semantic proxy.
4. Asynchronous novel sprite/image request; optional 3D-model provider can follow later.

For roasted chicken, install the edible item definition and show a recognizable food proxy immediately. Queue art keyed by semantic definition, visual description, style version, and requested variant. The output's health, ownership, edibility, and location are already canonical; replacing its image cannot change those mechanics.

For fire, wind, and light, use bounded particle/material recipes in the renderer rather than generating a new bitmap for every instance. The AI supplies validated parameters such as palette, trail, size, duration, and preset; it does not generate renderer code or raw shaders.

Maintain sprite, icon, portrait, and model variants independently. A 3D client may temporarily use an existing mesh or a sprite billboard. Claude's current transport does not generate production-ready GLB meshes; native novel 3D generation is a separate provider/validation feature and must not be claimed as available.

### Queue And Cache Changes

- Content-addressed deduplication across repeated requests, with style/provenance in the cache key. Never expose another world's hidden metadata through cache lookup responses.
- Schedule likely outputs during world generation: if a cooking rule exists, request its output visual before the player encounters it.
- Prioritize visible missing assets over speculative future assets. Share one generation job across all clients requesting the same authorized content.
- Persist pending/working/ready/failed status, retry attempts, and finalized asset versions. Recover interrupted jobs after restart.
- Separate latency-sensitive DM capacity from lower-priority artwork work so background art cannot consume every model slot.
- Bound concurrent provider calls and backlog. Do not treat increasing subprocess count as a guaranteed speedup.
- Validate raster/model outputs, normalize dimensions/anchors, save atomically, and broadcast a stable asset-version update. Retain the proxy on failure; no disappearing objects.

Cache hits and proxies should require no model round trip. Measure cold generation, queue delay, cache hit rate, and time-to-first-visible-result separately. Set actual performance targets from measurements rather than promise instantaneous novel art.

## Multiplayer And UI Contract

Canonical world saves include active definition versions, persistent effect/projectile state, scheduled work, and reaction outcomes. Save them atomically with events and RNG. Reconnect supplies the authoritative state and the definitions/assets needed to present it.

Clients never independently choose reactions or calculate damage. They animate the same server result using their renderer adapter. New definitions receive a compatible fallback visual until a preferred variant is available. Validate versions/capabilities before the new mechanics contract is enabled for a client; current strict Zod clients cannot silently accept arbitrary extra fields.

Coordinate additive contract changes with the separate UI/SDK agent. Supply fixture bundles covering particles, transformations, rule installation, asset replacement, and replay/reset. Do not modify the user's in-progress UI implementation as part of this backend extension.

## Delivery Boundaries

0. First integrated milestone: the freeform sandbox scenario above. Build its mechanics in testable increments, but do not call the milestone complete after only social outcomes or a fixed dragon ability. The existing social-first plan is a reusable component plan, not the delivery priority.
1. Definition registry, authoring validation, persistence, and compatibility fixtures.
2. Bounded effect interpreter and reactive trigger resolution; port relevant existing fire/water behavior to the same rule path to avoid double application.
3. AI generation/DM authoring integration and structured rejection/repair.
4. Asset deduplication, recipes, prewarming, priority scheduling, and renderer handoff.
5. Controlled tool registry/orchestration, coherent character forms, profile updates, and optional speech adapters. Design the registry interfaces first, then deliver these capabilities incrementally through the same validation/transaction paths.

The implementation plan will name exact files and tests after review of this design. No runtime plugin execution, autonomous source-code deployment, full fluid/combustion physics, or new native 3D generation provider is included in the initial extension.

## Acceptance

- Add a water reaction to already existing fire, save/reload, and extinguish it through normal input.
- Install wind and spread fire in a saved direction with bounded counts; prove identical replay.
- Transform a chicken once into a valid edible output, preserve references/ownership, and replace the proxy asynchronously when artwork completes.
- Use the Sunshard ability with costs, range, collision, and server-owned damage, rendered consistently by clients.
- Version/update/disable a reaction; historical actions keep their original outcomes, later actions use the activated version.
- Reject unsupported effects, privilege escalation, protected-entity changes, invalid outputs, loops, and resource explosions without partial changes.
- Verify deterministic precedence for simultaneous water/wind, duplicate event delivery, timed triggers, restart recovery, and concurrent rule updates.
- Prove cache deduplication, visible-job priority, failure fallback, and no DM starvation by artwork jobs.
- Check two-client synchronization, actor-specific visibility, definition/asset version recovery, and safe renderer fallbacks.
- Transform a player into demon form and revert it: world model, portrait, and icon stay on the same appearance version; inventory, actor identity, and memories survive; form-granted abilities revert correctly.
- Reject a late demon asset attachment after reversion and preserve historical dialogue speaker versions without mutating the current profile.
- Exercise tool-loop budgets, unknown tools, typed dependency handles, duplicate calls, transactional media outbox recovery, and unavailable TTS/image providers.
- Prove profile updates cannot smuggle mechanical or ownership changes, story tools produce optional causally grounded threads, private speech is scoped, and malformed SVG cannot execute code or make network requests.
- Resolve kissing the sentinel as a valid context-sensitive social attempt; persist a relevant NPC reaction and memory; retain them across reload; recall the interaction later without forcing reciprocation.
- Verify emote/SFX/VFX do not mutate mechanics, add simulation ticks, leak private reactions, or replay stale effects on reconnect. Verify positive-gesture farming limits and exact replay of a previously resolved model outcome.
- Request a previously undefined form and ability without a prerequisite; install and execute them atomically, save/reload, and use the ability again without re-authoring it.
- Breathe fire forward without naming an enemy: use saved facing, hit the appropriate area, respect walls, and resolve object reactions identically for two clients.
- Complete, ignore, and invalidate optional story threads; ordinary actions must remain available afterward. Preserve causal history without forcing replacement quests.
- Verify generated rooms contain reachable non-quest interactions that change persistent state, and that consequences can produce an optional story thread without producing one for every action.
