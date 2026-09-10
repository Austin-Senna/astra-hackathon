# AI-Authored Mechanics, Reactions, And Fast Visuals

Status: expanded design for user review; not yet implemented.

## Intent

Keep a deterministic, server-owned simulation while allowing the AI DM to invent and install new entity definitions, abilities, and reactions as validated data. The AI may change the rules of a particular adventure without editing or executing server source code. The user approved this boundary and explicitly requested mutable reactions and fast artwork for new results.

Examples to support:

- A new light projectile travels, strikes a target, deals bounded damage, and disappears.
- An existing fire with no water reaction can gain an extinguishing reaction.
- A newly introduced wind effect can spread fire downwind.
- A chicken entering fire can become a roasted-chicken item, with a newly requested visual if none exists.

These examples are adventure rules, not universal physical or biological claims. Different worlds may define different reactions.

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

World generation can submit a complete rules bundle. During play, a DM proposal may install definitions and execute the triggering action in the same validated atomic batch. Player clients cannot directly grant themselves abilities or install rules. The DM's authoring permissions, world budgets, protected entities, and objective constraints still apply.

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

Limits are explicit and independent of prose: maximum targets, range, spawn count, damage, duration, scheduled work, and rule evaluations. Protected actors, ownership, membership, required quest references, and canonical identifiers cannot be overwritten by definition data.

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

Every transform declares inventory handling: preserve only when compatible, otherwise spill contents to validated positions or reject. Do not silently delete held items. Clear incompatible AI intent/abilities/statuses according to a validated transformation policy. Relationships and historical references must not become dangling pointers. Player actors and protected objective sources cannot be transformed by an ordinary environmental rule.

Validate the output definition before consuming or transforming the input. A missing visual is allowed; a missing gameplay definition is not. Repeated delivery of the same action/reaction cannot produce duplicate roasted items.

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

1. Definition registry, authoring validation, persistence, and compatibility fixtures.
2. Bounded effect interpreter and reactive trigger resolution; port relevant existing fire/water behavior to the same rule path to avoid double application.
3. AI generation/DM authoring integration and structured rejection/repair.
4. Asset deduplication, recipes, prewarming, priority scheduling, and renderer handoff.

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
