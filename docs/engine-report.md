# Contracts and Engine Report

## Delivered

- `packages/contracts/index.ts`: strict Zod 4 external schemas and inferred TypeScript contracts, including world/blueprint, action, event, asset, session, and client message payloads.
- `packages/engine/index.ts`: pure atomic command batches, deterministic event IDs and seeded combat, actor-specific projection, structural/mechanical blueprint validation, deterministic instantiation.
- `packages/engine/fixtures.ts`: furnished four-map house chapter and a contrasting four-map dungeon chapter, both using the shared asset IDs.
- `packages/contracts/index.test.ts` and `packages/engine/index.test.ts`: 28 focused tests.

## Verification

Commands run after the final engine edit:

```text
npm test -- packages/contracts/index.test.ts packages/engine/index.test.ts
Test Files 2 passed (2)
Tests 28 passed (28)

npm run typecheck
Blocked by TS2322 in apps/server/service.test.ts:57 (outside engine ownership).
```

Engine tests initially failed because the engine module did not exist. Additional regressions were observed failing before corrections: bypassable latch, unreachable matching key, blocked arrival, unwitnessed dialogue leak, unrelated actor blocked by an encounter, environmental damage, solid route obstruction, and encounter escape by an unrelated actor. The initial contract test command ran before dependency installation and could not launch Vitest; the schema tests passed once dependencies were available.

Coverage includes atomic rejection and input immutability; deterministic replay/revisions/events; inventory capacity, single ownership, transfer/drop; proximity and adjacent travel; key and crowbar solutions; persistent map discoveries and reload serialization; hidden contents and private knowledge/memories/dialogue; returned keepsake and NPC recall; containers, food, water, fire, pushing, rest and bounded abilities; combat damage, victory, death, flee and surrender; a second independently acting human; schema and ownership/reference errors; locked-key dependencies; blocked arrivals and solid route obstructions; inaccessible objective ownership.

### Review Round 1

All four confirmed P2 findings were reproduced by failing tests and corrected:

- External actor, target, item, map, fact, and ownership references use own-property lookups, so inherited names such as `constructor`, `__proto__`, and `toString` cannot resolve to prototype objects. Spawn and relationship writes define explicit own properties.
- A hidden loose key cannot satisfy gate reachability. A hidden key held in an accessible, unlocked container remains usable after opening that container; the regression opens and picks up the key through actual commands.
- A nonparticipant cannot attack or use strike in another actor's active encounter, including DM-submitted physical actions. Rejected attempts leave the input unchanged.
- An active blueprint must include a living, positioned player actor. A zero-health or dead sole actor is rejected; another living actor permits validation.

An additional failing regression established that DM `say`, `think`, and `narrate` commands must not advance simulation time. They now commit dialogue/events and a revision without changing ticks, RNG, hunger, burning damage, or encounter retaliation. Mixed batches still advance time for physical actions.

### Review Round 2

A failing regression reproduced instantiation of a lost, ended blueprint whose sole player has zero health. `instantiateBlueprint` now normalizes the starting state before validation, so the active-world living-actor requirement applies to the actual returned state. An ended snapshot can still validate as an ended snapshot, but cannot become an unplayable active adventure. Focused verification passes with 28 tests. The final repository TypeScript check reports TS2322 at `apps/server/service.test.ts:57`, outside this task's ownership; no engine errors were reported.

## Replayed Solutions

House, matching key: interact with `brass-key` next to Rowan, walk to the bedroom exit `(22,8)`, walk through the hall to `(20,8)`, use `brass-key` on `garden-door`, cross the hall exit `(22,8)`, cross the conservatory stair `(21,8)`, walk to `(9,8)` in the attic, interact with `nell`. The crowbar solution substitutes `crowbar` in the pickup and door-use steps. The hall wall at `x=21` has only the gated opening at `y=8`; walking around the lock is rejected.

Optional memory branch: pick up `keepsake` in the bedroom at `(8,8)`, approach the keeper in the hall at `(8,6)`, give it to `keeper`, and speak again after serialization/reload. The keeper recalls the return and increases their relationship with the acting player. The epilogue reflects remembered helpful actions.

Dungeon: resolve or avoid the sentinel, cross the crypt, passage, and grotto exits at `(22,8)`, then pick up `ember` near `(10,8)` in the vault. Tests separately replay combat victory and the complete possession objective.

## Integration Notes and Limits

- Canonical `knownFacts` and actor `knowledge` contain fact IDs. Projected `WorldView.knownFacts` contains readable fact text; its schema permits full text.
- Map discoveries are shared world exploration. Player knowledge, memories, and witnessed dialogue are projected per actor. NPC private knowledge, memories, and dialogue scripts are removed, along with hidden entities, closed inventory contents, unseen maps, and objective/facts/secrets.
- Filter separately transmitted `WorldEvent` payloads per membership on the server. A sanitized snapshot alone cannot protect a raw event broadcast. Events include map and actor IDs for this purpose.
- Event IDs are `worldId:revision:index`; event sequence values are `revision * 1000 + index`. Batches producing more than 1000 events reject atomically to preserve sequence ordering. Event sequences can contain gaps.
- The engine has one lightweight active encounter per world. Unrelated actors can continue ordinary actions and travel; party encounter onboarding and multiple simultaneous encounters are outside this fixture implementation.
- Blueprint validation computes reachability to a fixed point across matching keys, lever tools, and switches, respecting walls and stationary solid objects. It checks IDs, ownership cycles, references, tile dimensions, exits, arrivals, facts, and accessible objective sources. Movable objects are treated as potentially movable; authored solutions are replayed separately. This is not a generic proof of arbitrary narrative or pushing-puzzle solvability.
- NPC intents, relationships, and witness memories persist. NPC pathfinding/scheduled autonomous behavior is not implemented; the DM can submit validated actor actions and intent changes.
- No renderer, network, database, wall-clock, model call, or filesystem dependency is present in the engine. No packages were installed or commits made by this task.
