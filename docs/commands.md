# Command Reference

The server derives the acting character from the bearer-token membership. Clients cannot choose a different actor by adding an actor ID to an action request. Coordinates are logical tiles, not pixels.

## Player Intentions

| type | Canonical payload fields | Behavior |
| --- | --- | --- |
| move | x, y; optional mapId | One adjacent tile; crossing an exit performs room travel. |
| inspect | targetId | Description and available clue within inspection reach. |
| interact | targetId | Contextual pickup, conversation, switch, door, container, or fixture action. |
| pickUp | targetId | Take a nearby portable unowned item. |
| drop | itemId | Place a held item at the actor's coordinates. |
| give | itemId, targetId | Transfer a held item to a nearby living character. |
| use | itemId; targetId when targeting something else | Apply held food, water, fire, or a matching key/tool. |
| push | targetId | Push a nearby pushable object one tile away. |
| attack | targetId | Resolve an adjacent attack through shared encounter rules. |
| useAbility | abilityId; targetId when required by ability | Apply an ability that this character actually possesses. |
| wait | none | Advance one simulation action; can wake the character. |

Use `targetId`, not `itemId`, for `pickUp`. `itemId` describes an already-held item used by `drop`, `give`, or `use`. The engine retains a `targetId` item alias for drop/use compatibility, but new clients should use the canonical spelling above.

Unknown IDs, missing required fields, distant targets, blocked tiles, insufficient stamina, unsupported abilities, invalid turns, and ended worlds reject. A rejected atomic batch does not change state, RNG, revision, or inventory.

## Request Envelope

```json
{
  "requestId": "a-unique-id-for-this-intention",
  "expectedRevision": 12,
  "intent": {
    "type": "pickUp",
    "targetId": "brass-key"
  }
}
```

Send to POST `/api/worlds/:worldId/actions` with the session bearer token. Retry the same intention with the same request ID only if its outcome is uncertain. A genuinely changed intention needs a new ID. A stale-revision rejection should first reconcile the returned view; do not blindly replay a movement path from old coordinates.

## DM Additions

- `say`: speakerId and text. Public speech by a nearby character.
- `think`: speakerId and text. A private character thought.
- `narrate`: speakerId (usually null) and text. Presentation of supported outcomes.
- `setNpcIntent`: targetId and intent. Nearby NPC intent from the defined enum.
- `spawn`: a complete validated Entity. Bounded introduction in the acting character's current room.

Only the server's DM path can submit these. The model cannot replace canonical state or submit arbitrary JavaScript. Presentation-only speech/thought/narration commits dialogue/events but does not advance ticks, hunger, fire, or combat retaliation.

For free text, POST `/api/worlds/:worldId/dm` with requestId, expectedRevision, text, and optional targetId. Preserve the text on rejection. Ordinary walking and item interaction should call the direct endpoint without waiting for a model.

## Presentation Events

Events describe committed changes. They are useful for sound, animation, and dialogue, but they are not a second simulation to run in the browser. Render current positions, inventory, health, and encounter state from `view`.

Track the authoritative `cursor` independently of visible event IDs. See `docs/ui-handoff.md` for reconnect/reset behavior. A battle screen uses the same action endpoint, actor, and entity health as the overworld.
