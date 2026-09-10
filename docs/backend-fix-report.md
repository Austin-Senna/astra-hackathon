# Backend Review Fixes

## Completed Changes

- `GameService.dm` sends `projectWorld(world, actorId)` as its `world` context. Hidden entities, undiscovered maps, world secrets/facts, and other actors' memories are excluded. `nearbyNpcDialogue` adds only authored public dialogue for projected NPCs on the actor's map within Manhattan distance 8, matching the engine's speaking reach. Distant NPC and player dialogue is excluded.
- HTTP URL parsing now runs inside the request error boundary. Node's `ERR_INVALID_URL` returns HTTP 400; malformed `//[` request targets no longer reject the request listener or interrupt subsequent requests.
- Event projection no longer exempts `use` or `death` from target visibility. A hidden burning object cannot disclose its ID/name through death events. Visible dead objects remain in the projected world, so their destruction events remain visible. Consumed food's `use` event targets the acting character, preserving its visible event without requiring precommit state.
- Reconnects return a canonical snapshot and a bounded recent event tail with an explicit authoritative server cursor. Private payloads are never returned just to advance a cursor.
- Claude sprite output now uses 16 rows of 16 palette indices. The PNG decoder repeats each pixel into a 2-by-2 block, preserving the existing 32-by-32 PNG output, palette colors, and transparent index 0. The prompt and schema agree; missing colors and invalid dimensions are rejected. OpenAI image generation is unchanged.
- Live DM testing also found that generic optional command fields allowed `pickUp` with only `itemId`, which the engine could not execute. The shared intent schema now discriminates action types and requires their engine inputs. Model repair feedback includes both `rejectedCommands` and the engine error, with a concise field mapping in the system prompt.
- The optional OpenAI transport now uses Responses JSON object mode with the JSON schema in its system prompt, followed by `JSON.parse` and local Zod validation. The installed SDK's strict `zodTextFormat` rejected optional non-nullable command fields before making a request. This path uses local validation, not strict Structured Outputs. Public command nullability and the Claude path are unchanged.

## Action Fields

| Action | Required fields beyond `type` |
| --- | --- |
| `move` | `x`, `y` |
| `inspect`, `interact`, `pickUp`, `push`, `attack` | `targetId` |
| `give` | `itemId`, recipient `targetId` |
| `useAbility` | `abilityId` |
| `drop`, `use` | `itemId`, or the existing held-item `targetId` alias |
| `wait` | None |

The existing common optional fields remain accepted for compatibility, but cannot substitute for an action's required fields. For `use`, a separate `targetId` may identify the object receiving the held item's effect. Both held-item alternatives are expressed as schema branches so JSON-schema-based providers receive the same constraints as runtime validation. For example, `{"type":"pickUp","itemId":"brass-key"}` is invalid, while `{"type":"pickUp","targetId":"brass-key"}` is valid. No engine implementation changes were needed.

## Cursor Contract

All existing routes and message types remain available. Cursor fields are optional in shared Zod contracts for compatibility, but this server emits them for successful state responses.

| Response | Additional fields |
| --- | --- |
| World creation and authenticated world snapshot | `cursor` |
| Successful action, DM, or restore | `cursor` |
| HTTP `GET /api/worlds/:worldId/events?after=N` | `cursor`, `reset` |
| WebSocket `snapshot` | `cursor`, `reset` |
| WebSocket `commit` | `cursor` |

`cursor` is the latest persisted event sequence for the world, including events invisible to this actor. An empty world has cursor 0. Cursors may advance while `events` is empty; this reveals sequence progress, never hidden event payloads. Clients use the returned cursor for their next `after`, not the largest visible event sequence. A snapshot is authoritative even when events are omitted by visibility.

Recovery selects at most the newest 1000 persisted events strictly after `after`, orders them ascending, then filters them for the actor. If more than 1000 events were pending, older events are intentionally omitted and `reset` is true. If `after` exceeds the server cursor, `reset` is also true and the event list is empty. Otherwise `reset` is false. The bound applies to raw rows before visibility filtering; the response can contain fewer than 1000 visible events, including zero. It does not promise complete historical replay or the last 1000 visible events.

On `reset: true`, clients replace their local state with `view`, replace any event-history buffer with the supplied tail, and adopt `cursor` exactly, including a lower cursor when recovering from an invalid future value. Ordinary recovery also replaces state with `view`; its visible events may be merged by event ID. Revisions decide whether an asynchronously arriving state response is newer; an older response must not roll state/cursor backward. A replayed action receipt returns the latest canonical view/cursor plus that receipt's currently visible events, not every intervening event.

Example: 1000 private events followed by visible event 1001 returns that visible event, `cursor: 1001`, and `reset: true`. A subsequent request after 1001 returns no events, cursor 1001, and `reset: false`. A private-only live commit still includes its new cursor with an empty visible event list.

## Verification

The initial regressions failed against the old implementation for each reported bug. The 16-by-16 decoder tests also failed before changing the sprite schema and decoder. The action-contract and repair tests produced 14 expected failures before tightening the intent schema and adding rejected commands to feedback.

- `npm test`: 58 tests passed across 9 files.
- `npm run typecheck`: passed.
- Regression coverage includes provider input privacy, nearby/distant public dialogue, hidden versus visible burning destruction, consumed food use, malformed HTTP request targets, bounded HTTP/WebSocket reconnect recovery, private-only cursor advancement, Zod parsing of WebSocket cursor fields, and sprite colors/transparency/dimensions.
- Live provider/artwork verification is performed by the parent task; the unit suite uses controlled provider inputs and does not prove live model latency or output quality.

After the action-schema follow-up, all 74 backend/contracts/engine tests passed. The OpenAI follow-up added four offline tests through the installed SDK with mocked HTTP responses: a valid DM plan using optional fields, invalid JSON, a missing required pickup target, and a null target. All four failed on the old transport construction and pass after the fix. No live OpenAI key or network call was used.

The latest full run passes 82 tests across ten suites; an eleventh concurrent client SDK suite cannot yet import its `./index` implementation. Typecheck currently reports only errors in that SDK test file. Backend/contracts/model verification is clean. Final integration verification should run after the SDK work lands.

No dependencies were installed, no development server was stopped, and this backend subtask created no commit. Git metadata was absent during the original review fixes; repository initialization and integration are handled by the parent task.
