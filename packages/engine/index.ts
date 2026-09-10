import { DMCommandSchema, WorldBlueprintSchema, type DMCommand, type EngineResult, type Entity, type Memory, type PlayerIntent, type Position, type WorldEvent, type WorldState, type WorldView } from '../contracts';

class RuleError extends Error { constructor(public code: string, message: string) { super(message); } }
const reject = (code: string, message: string): never => { throw new RuleError(code, message); };
const own = <T>(record: Record<string, T>, id: string): T | undefined => Object.hasOwn(record, id) ? record[id] : undefined;
const distance = (a: Position | null, b: Position | null) => !a || !b || a.mapId !== b.mapId ? Infinity : Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const active = (e: Entity) => e.hp > 0 && !e.statuses.includes('dead');
const tileOpen = (w: WorldState, p: Position) => {
  const map = own(w.maps, p.mapId);
  return !!map && p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height && !!map.tiles[p.y]?.[p.x] && map.tiles[p.y][p.x] !== '#';
};
function canStand(w: WorldState, p: Position, except?: string) {
  return tileOpen(w, p) && !Object.values(w.entities).some(e => e.id !== except && e.solid && !e.statuses.includes('open') && !e.statuses.includes('broken') && distance(e.location, p) === 0);
}

export function applyCommandBatch(input: WorldState, actorId: string, commands: DMCommand[], options: { dm?: boolean } = {}): EngineResult {
  try {
    if (!Array.isArray(commands) || !commands.length || commands.length > 32) reject('INVALID_BATCH', 'A batch must contain 1 to 32 commands.');
    const parsed = commands.map(c => DMCommandSchema.safeParse(c));
    if (parsed.some(c => !c.success)) reject('INVALID_COMMAND', 'The command does not match the action schema.');
    if (commands.filter(c => c.type === 'spawn').length > 2) reject('SPAWN_LIMIT', 'Only two introductions are allowed per batch.');
    const w = structuredClone(input);
    const actor = own(w.entities, actorId);
    if (!actor || (!w.actorIds.includes(actorId) && !(options.dm && actor.kind === 'npc'))) return reject('UNKNOWN_ACTOR', 'This actor cannot act in this world.');
    if (!active(actor)) reject('ACTOR_DEAD', 'This character can no longer act.');
    if (actor.statuses.includes('asleep') && commands.some(c => c.type !== 'wait')) reject('ACTOR_ASLEEP', 'Wait to wake before acting.');
    if (w.status !== 'active') reject('WORLD_ENDED', 'This adventure has ended.');
    const events: WorldEvent[] = [];
    const revision = input.revision + 1;
    const emit = (type: string, text: string, targetId: string | null = null, data: Record<string, unknown> = {}) => {
      if (events.length >= 1000) return reject('EVENT_LIMIT', 'This batch produces too many consequences.');
      const event: WorldEvent = { id: `${w.id}:${revision}:${events.length}`, seq: revision * 1000 + events.length, revision, tick: w.tick, type, actorId, targetId, mapId: (targetId ? own(w.entities, targetId)?.location?.mapId : null) ?? actor.location?.mapId ?? null, text, data };
      events.push(event); return event;
    };
    const speak = (text: string, speaker: Entity | null = null, kind: 'speech' | 'thought' | 'narration' = 'narration') => {
      const event = emit(kind, text, speaker?.id ?? null);
      w.dialogue.push({ id: event.id, speakerId: speaker?.id ?? null, speaker: speaker?.name ?? 'The story', text, kind });
      w.dialogue = w.dialogue.slice(-80);
      for (const e of Object.values(w.entities)) if (['npc', 'player'].includes(e.kind) && (kind === 'thought' ? e.id === speaker?.id : e.id === actorId || distance(actor.location, e.location) <= 8)) e.memories.push({ eventId: event.id, text, kind: 'observation' });
      return event;
    };
    const remember = (event: WorldEvent, kind: Memory['kind']) => {
      const memory = { eventId: event.id, text: event.text, kind };
      w.memories.push(memory);
      for (const e of Object.values(w.entities)) if (['npc', 'player'].includes(e.kind) && (e.id === actorId || distance(actor.location, e.location) <= 8)) { e.memories = e.memories.filter(m => m.eventId !== event.id); e.memories.push(memory); }
    };
    const target = (id?: string, reach = 1) => {
      const e = id ? own(w.entities, id) : undefined;
      if (!e || e.statuses.includes('hidden')) return reject('UNKNOWN_TARGET', 'That object is not visible.');
      if (e.holderId !== actorId && distance(actor.location, e.location) > reach) reject('OUT_OF_REACH', 'Move closer to reach that.');
      return e;
    };
    const held = (id?: string) => {
      const e = id ? own(w.entities, id) : undefined;
      if (!e || e.holderId !== actorId || !actor.inventory.includes(e.id)) return reject('NOT_HELD', 'That item is not in your inventory.');
      return e;
    };
    const fact = (id: string | null | undefined) => {
      if (!id || !own(w.facts, id)) return;
      if (!actor.knowledge.includes(id)) {
        actor.knowledge.push(id); if (!w.knownFacts.includes(id)) w.knownFacts.push(id);
        remember(speak(w.facts[id]), 'discovery');
      }
    };
    const transfer = (item: Entity, recipient: Entity | null) => {
      if (recipient && recipient.inventory.length >= (w.sandbox?.enabled ? 128 : 8)) reject('INVENTORY_FULL', 'The inventory storage limit has been reached.');
      if (item.holderId) w.entities[item.holderId].inventory = w.entities[item.holderId].inventory.filter(id => id !== item.id);
      item.holderId = recipient?.id ?? null; item.location = recipient ? null : structuredClone(actor.location);
      if (recipient) recipient.inventory.push(item.id);
    };
    const pickup = (e: Entity) => {
      if (!e.portable || e.kind !== 'item' || e.holderId === actorId) reject('NOT_PORTABLE', 'That cannot be picked up.');
      if (e.holderId) reject('ALREADY_OWNED', 'That belongs to another holder.');
      transfer(e, actor); fact(e.interaction?.grantsFact); speak(`You take ${e.name}.`); emit('pickUp', `${actor.name} picked up ${e.name}.`, e.id);
    };
    const unlock = (door: Entity, item?: Entity) => {
      if (door.interaction?.type !== 'door') return reject('NOT_DOOR', 'That is not a door.');
      if (door.statuses.includes('locked')) {
        const key = item ?? actor.inventory.map(id => own(w.entities, id)).find(e => e?.id === door.interaction?.requiresItemId);
        if (!key || (key.id !== door.interaction.requiresItemId && !(key.tags.includes('lever') && door.tags.includes('leverable')))) return reject('LOCKED', 'The latch is locked. Find the matching key or a tool that can lever it.');
        if (key.id !== door.interaction.requiresItemId) door.statuses.push('broken');
      }
      door.statuses = door.statuses.filter(s => s !== 'locked'); if (!door.statuses.includes('open')) door.statuses.push('open');
      door.solid = false; remember(speak(`${door.name} opens.`, null), 'discovery'); emit('door', `${door.name} opens.`, door.id);
    };
    const finishEncounter = (status: 'won' | 'fled' | 'lost') => {
      if (!w.encounter) return;
      w.encounter.status = status; w.phase = 'exploring'; emit('encounter', `The encounter is ${status}.`, null, { status });
    };
    const damage = (victim: Entity, amount: number) => {
      victim.hp = Math.max(0, victim.hp - amount); emit('damage', `${victim.name} takes ${amount} damage.`, victim.id, { amount });
      if (!victim.hp && !victim.statuses.includes('dead')) { victim.statuses.push('dead'); victim.solid = false; emit('death', `${victim.name} falls.`, victim.id); }
    };
    const random = () => { w.rng = (Math.imul(1664525, w.rng) + 1013904223) >>> 0; return w.rng / 4294967296; };
    const attack = (enemy: Entity, bonus = 0) => {
      if (w.encounter?.status === 'active' && !w.encounter.participantIds.includes(actorId)) reject('NOT_PARTICIPANT', 'This character is not part of the active encounter.');
      if (!['npc', 'player'].includes(enemy.kind) || enemy.id === actorId || !active(enemy)) reject('INVALID_ATTACK', 'That is not a living opponent.');
      if (actor.stamina < 3) reject('EXHAUSTED', 'You need to rest before attacking.');
      actor.stamina -= 3;
      if (!w.encounter || w.encounter.status !== 'active') {
        w.encounter = { id: `${w.id}:encounter:${revision}`, mapId: actor.location!.mapId, participantIds: [actorId, enemy.id], turnActorId: actorId, round: 1, status: 'active' }; w.phase = 'encounter';
        emit('encounter', `${enemy.name} stands against ${actor.name}.`, enemy.id);
      } else if (!w.encounter.participantIds.includes(enemy.id)) reject('INVALID_ATTACK', 'That character is not part of the encounter.');
      enemy.intent = 'hostile'; Object.defineProperty(enemy.relationships, actorId, { value: (own(enemy.relationships, actorId) ?? 0) - 2, enumerable: true, writable: true, configurable: true });
      remember(emit('attack', `${actor.name} attacks ${enemy.name}.`, enemy.id), 'harm'); damage(enemy, 3 + Math.floor(random() * 3) + bonus);
    };
    const step = (intent: PlayerIntent) => {
      switch (intent.type) {
        case 'move': {
          if (!actor.location || intent.x === undefined || intent.y === undefined) reject('INVALID_MOVE', 'A move needs a destination.');
          const next = { ...actor.location!, x: intent.x!, y: intent.y!, mapId: intent.mapId ?? actor.location!.mapId };
          if (distance(actor.location, next) !== 1) reject('INVALID_MOVE', 'Move one adjacent tile at a time.');
          if (!canStand(w, next, actorId)) reject('BLOCKED', 'That way is blocked.');
          actor.facing = next.x > actor.location!.x ? 'east' : next.x < actor.location!.x ? 'west' : next.y > actor.location!.y ? 'south' : 'north';
          actor.location = next; const exit = w.maps[next.mapId].exits.find(e => e.x === next.x && e.y === next.y);
          if (exit) {
            const arrival = { ...next, mapId: exit.toMapId, x: exit.toX, y: exit.toY };
            if (!canStand(w, arrival, actorId)) reject('BLOCKED_EXIT', 'The other side of that passage is blocked.');
            if (w.encounter?.status === 'active' && w.encounter.participantIds.includes(actorId)) finishEncounter('fled');
            actor.location = arrival; w.maps[arrival.mapId].discovered = true;
            speak(w.maps[arrival.mapId].description); emit('travel', `${actor.name} enters ${w.maps[arrival.mapId].name}.`, null, { fromMapId: next.mapId, toMapId: arrival.mapId });
          }
          emit('move', `${actor.name} moves.`, actorId, { location: actor.location });
          if (w.maps[actor.location.mapId].tiles[actor.location.y][actor.location.x] === '~') { actor.statuses = actor.statuses.filter(s => s !== 'burning'); if (!actor.statuses.includes('wet')) actor.statuses.push('wet'); }
          break;
        }
        case 'inspect': { const e = target(intent.targetId, 2); speak(e.description); fact(e.interaction?.grantsFact); emit('inspect', `${actor.name} examines ${e.name}.`, e.id); break; }
        case 'pickUp': pickup(target(intent.targetId)); break;
        case 'drop': { const e = held(intent.itemId ?? intent.targetId); transfer(e, null); emit('drop', `${actor.name} puts down ${e.name}.`, e.id); break; }
        case 'give': {
          const e = held(intent.itemId); const recipient = target(intent.targetId);
          if (!['npc', 'player'].includes(recipient.kind) || recipient.id === actorId || !active(recipient)) reject('INVALID_RECIPIENT', 'Choose another living character.');
          transfer(e, recipient); Object.defineProperty(recipient.relationships, actorId, { value: (own(recipient.relationships, actorId) ?? 0) + (e.tags.includes('keepsake') ? 3 : 1), enumerable: true, writable: true, configurable: true });
          remember(emit('give', `${actor.name} gave ${e.name} to ${recipient.name}.`, recipient.id), 'help');
          speak(e.tags.includes('keepsake') ? 'My locket. You brought it back. I will remember your kindness.' : `Thank you for the ${e.name.toLowerCase()}.`, recipient); break;
        }
        case 'interact': {
          const e = target(intent.targetId);
          if (e.portable) { pickup(e); break; }
          if (e.interaction?.type === 'door') { unlock(e); break; }
          if (e.interaction?.type === 'exit' && e.location) { step({ type: 'move', x: e.location.x, y: e.location.y }); break; }
          if (e.interaction?.type === 'container') {
            if (e.statuses.includes('locked')) reject('LOCKED', 'This container is locked.');
            if (!e.statuses.includes('open')) e.statuses.push('open');
            for (const id of [...e.inventory]) { const item = w.entities[id]; item.statuses = item.statuses.filter(s => s !== 'hidden'); item.holderId = null; item.location = structuredClone(e.location); }
            e.inventory = []; speak(`You open ${e.name}.`);
          } else if (e.interaction?.type === 'npc') {
            const helped = e.memories.find(m => m.kind === 'help' && m.text.includes(actor.name));
            speak(helped ? `I remember: ${helped.text} ${e.dialogue[0] ?? ''}` : e.dialogue[0] ?? `${e.name} watches you quietly.`, e);
          } else if (e.interaction?.type === 'switch') {
            const linked = e.interaction.targetId ? own(w.entities, e.interaction.targetId) : null;
            if (!linked) return reject('INVALID_SWITCH', 'The switch has no mechanism.');
            linked.statuses = linked.statuses.filter(s => s !== 'locked'); if (!linked.statuses.includes('open')) linked.statuses.push('open'); linked.solid = false; speak(`${e.name} releases ${linked.name}.`);
          } else if (e.interaction?.type === 'water') {
            actor.statuses = actor.statuses.filter(s => s !== 'burning'); if (!actor.statuses.includes('wet')) actor.statuses.push('wet'); speak('Cool water washes over your hands.');
          } else if (e.tags.includes('rest')) { actor.stamina = Math.min(100, actor.stamina + 20); actor.hp = Math.min(actor.maxHp, actor.hp + 2); speak('You rest for a moment.'); }
          else speak(e.description);
          fact(e.interaction?.grantsFact); emit('interact', `${actor.name} interacts with ${e.name}.`, e.id); break;
        }
        case 'use': {
          const item = held(intent.itemId ?? intent.targetId);
          const e = intent.targetId && intent.targetId !== item.id ? target(intent.targetId) : actor;
          if (e.interaction?.type === 'door') { unlock(e, item); break; }
          if (item.interaction?.type === 'food') {
            if (e.id !== actorId) reject('INVALID_USE', 'Give food to another character first.');
            actor.hp = Math.min(actor.maxHp, actor.hp + 5); actor.hunger = Math.max(0, actor.hunger - 30); actor.stamina = Math.min(100, actor.stamina + 15);
            transfer(item, null); delete w.entities[item.id]; speak(`You eat ${item.name}.`);
          } else if (item.tags.includes('water') || item.interaction?.type === 'water') { e.statuses = e.statuses.filter(s => s !== 'burning'); if (!e.statuses.includes('wet')) e.statuses.push('wet'); speak(`Water cools ${e.name}.`); }
          else if (item.tags.includes('fire') || item.interaction?.type === 'fire') { if (e.statuses.includes('wet')) reject('TOO_WET', 'That is too wet to ignite.'); if (!e.statuses.includes('burning')) e.statuses.push('burning'); speak(`${e.name} catches fire.`); }
          else reject('INVALID_USE', 'That item has no matching use here.');
          emit('use', `${actor.name} uses ${item.name}.`, e.id); break;
        }
        case 'push': {
          const e = target(intent.targetId); if (!e.tags.includes('pushable') || !e.location || !actor.location) reject('NOT_PUSHABLE', 'That cannot be pushed.');
          const dx = e.location!.x - actor.location!.x; const dy = e.location!.y - actor.location!.y;
          if (Math.abs(dx) + Math.abs(dy) !== 1) reject('INVALID_PUSH', 'Stand next to the object.');
          const next = { ...e.location!, x: e.location!.x + dx, y: e.location!.y + dy };
          if (!canStand(w, next, e.id) || w.maps[next.mapId].exits.some(exit => exit.x === next.x && exit.y === next.y)) reject('BLOCKED', 'There is no room to push it.');
          e.location = next; emit('push', `${actor.name} pushes ${e.name}.`, e.id); break;
        }
        case 'attack': attack(target(intent.targetId)); break;
        case 'useAbility': {
          if (!intent.abilityId || !actor.abilities.includes(intent.abilityId)) reject('NO_ABILITY', 'This character does not have that ability.');
          if (intent.abilityId === 'flee' || intent.abilityId === 'surrender') {
            if (!w.encounter || w.encounter.status !== 'active' || !w.encounter.participantIds.includes(actorId)) return reject('NO_ENCOUNTER', 'There is no encounter to leave.');
            for (const id of w.encounter.participantIds) if (id !== actorId && w.entities[id].kind === 'npc') w.entities[id].intent = 'guard';
            actor.emotion = intent.abilityId === 'flee' ? 'shaken' : 'humbled'; finishEncounter('fled');
          } else if (intent.abilityId === 'rest' || intent.abilityId === 'mend') {
            if (w.encounter?.status === 'active' && intent.abilityId === 'rest') reject('IN_COMBAT', 'You cannot rest during an encounter.');
            if (intent.abilityId === 'mend' && actor.stamina < 10) reject('EXHAUSTED', 'Mending requires ten stamina.');
            actor.hp = Math.min(actor.maxHp, actor.hp + (intent.abilityId === 'mend' ? 4 : 2)); actor.stamina = intent.abilityId === 'mend' ? actor.stamina - 10 : Math.min(100, actor.stamina + 20);
          } else if (intent.abilityId === 'strike') attack(target(intent.targetId), 2);
          else reject('UNSUPPORTED_ABILITY', 'This ability has no defined mechanic.');
          emit('ability', `${actor.name} uses ${intent.abilityId}.`, intent.targetId ?? actorId); break;
        }
        case 'wait': actor.statuses = actor.statuses.filter(s => s !== 'asleep'); actor.stamina = Math.min(100, actor.stamina + 3); emit('wait', `${actor.name} waits.`); break;
      }
    };
    for (const command of commands) {
      if (!active(actor) || w.status !== 'active') reject('WORLD_ENDED', 'No more actions can follow the ending.');
      if (w.encounter?.status === 'active' && w.encounter.participantIds.includes(actorId) && w.encounter.turnActorId !== actorId && !options.dm) reject('NOT_YOUR_TURN', 'Another character has the encounter turn.');
      const presentation = command.type === 'say' || command.type === 'think' || command.type === 'narrate';
      if (!presentation) w.tick++;
      if (command.type === 'spawn' || command.type === 'setNpcIntent' || ['say', 'think', 'narrate'].includes(command.type)) {
        if (!options.dm) reject('DM_ONLY', 'This command is reserved for the dungeon master.');
        if (command.type === 'spawn') {
          const entity = structuredClone(command.entity);
          if (own(w.entities, entity.id) || entity.kind === 'player' || entity.holderId || entity.inventory.length || !entity.location || !canStand(w, entity.location) || entity.location.mapId !== actor.location?.mapId || entity.statuses.includes('hidden')) reject('INVALID_SPAWN', 'Introductions need a unique, unowned entity in the current room.');
          Object.defineProperty(w.entities, entity.id, { value: entity, enumerable: true, writable: true, configurable: true }); emit('spawn', `${entity.name} appears.`, entity.id);
        } else if (command.type === 'setNpcIntent') {
          const e = target(command.targetId, 8); if (e.kind !== 'npc') reject('NOT_NPC', 'Only an NPC can receive that intention.'); e.intent = command.intent; emit('intent', `${e.name} becomes ${command.intent}.`, e.id);
        } else if ('speakerId' in command) {
          const e = command.speakerId ? target(command.speakerId, 8) : null;
          speak(command.text, e, command.type === 'think' ? 'thought' : command.type === 'say' ? 'speech' : 'narration');
        }
      } else step(command as PlayerIntent);
      if (presentation) continue;
      for (const e of Object.values(w.entities)) if (e.statuses.includes('burning') && active(e)) { if (e.statuses.includes('wet')) e.statuses = e.statuses.filter(s => s !== 'burning'); else damage(e, 2); }
      actor.hunger = Math.min(100, actor.hunger + (w.tick % 5 === 0 ? 1 : 0));
      if (w.encounter?.status === 'active' && w.encounter.participantIds.includes(actorId)) {
        const enemies = w.encounter.participantIds.map(id => w.entities[id]).filter(e => e.id !== actorId && !w.actorIds.includes(e.id) && active(e));
        if (!enemies.length) finishEncounter('won');
        else {
          for (const enemy of enemies) if (distance(actor.location, enemy.location) <= 1 && enemy.intent === 'hostile') damage(actor, 1 + Math.floor(random() * 3));
          w.encounter.round++; w.encounter.turnActorId = actorId;
        }
      }
      if (!active(actor) && w.actorIds.every(id => !active(w.entities[id]))) {
        finishEncounter('lost');
        if (!w.sandbox?.enabled) { w.status = 'lost'; w.phase = 'ended'; speak('Your journey ends here. The house keeps your story.'); }
      }
      const objective = w.objective;
      const won = active(actor) && (objective.type === 'fact' ? !!objective.factId && actor.knowledge.includes(objective.factId) : objective.type === 'possess' ? !!objective.targetId && actor.inventory.includes(objective.targetId) : !!objective.mapId && actor.location?.mapId === objective.mapId);
      if (won && !w.sandbox?.enabled) { w.status = 'won'; w.phase = 'ended'; speak(w.memories.some(m => m.kind === 'help') ? 'You found what you came for. The kindness you left along the way will be remembered.' : 'You found what you came for. For the first time tonight, this place feels like somewhere you can leave in peace.'); emit('objective', w.goal); }
    }
    w.revision = revision;
    return { ok: true, world: w, events };
  } catch (error) {
    if (error instanceof RuleError) return { ok: false, error: { code: error.code, message: error.message } };
    throw error;
  }
}

export function projectWorld(world: WorldState, actorId: string): WorldView {
  const { objective: _objective, facts, secrets: _secrets, ...view } = structuredClone(world);
  const actor = own(world.entities, actorId);
  view.maps = Object.fromEntries(Object.entries(view.maps).filter(([, m]) => m.discovered));
  // Closed containers and other characters' inventories do not expose their contents.
  view.entities = Object.fromEntries(Object.entries(view.entities).filter(([, e]) => !e.statuses.includes('hidden') && (e.holderId === actorId || (e.location && !!own(view.maps, e.location.mapId)))));
  for (const e of Object.values(view.entities)) {
    e.inventory = e.inventory.filter(id => !!own(view.entities, id));
    if (e.id !== actorId) { e.knowledge = []; e.memories = []; e.dialogue = []; }
    if (e.interaction) { e.interaction.grantsFact = null; e.interaction.requiresItemId = null; if (e.interaction.targetId && !own(view.entities, e.interaction.targetId)) e.interaction.targetId = null; }
  }
  view.knownFacts = (actor?.knowledge ?? []).map(id => own(facts, id)).filter((t): t is string => !!t);
  view.memories = structuredClone(actor?.memories ?? []);
  const witnessed = new Set((actor?.memories ?? []).map(m => m.eventId));
  view.dialogue = view.dialogue.filter(line => (line.kind !== 'thought' || line.speakerId === actorId) && (line.speakerId === actorId || witnessed.has(line.id)));
  view.actorIds = view.actorIds.filter(id => !!own(view.entities, id));
  if (view.sandbox) {
    view.sandbox.rules = view.sandbox.rules.filter(rule => !!own(view.maps, rule.mapId));
    view.sandbox.forms = view.sandbox.forms.filter(form => !!own(view.entities, form.actorId));
  }
  if (view.encounter && !own(view.maps, view.encounter.mapId)) view.encounter = null;
  return view;
}

export function validateBlueprint(value: unknown): { ok: true; world: WorldState } | { ok: false; errors: string[] } {
  const parsed = WorldBlueprintSchema.safeParse(value);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  const w = parsed.data; const errors: string[] = [];
  const issue = (text: string) => errors.push(text);
  if (!w.actorIds.length || new Set(w.actorIds).size !== w.actorIds.length) issue('At least one unique player actor is required.');
  for (const id of w.actorIds) { const actor = own(w.entities, id); if (actor?.kind !== 'player' || !actor.location) issue(`Invalid player actor ${id}.`); }
  if (w.status === 'active' && !w.actorIds.some(id => { const actor = own(w.entities, id); return actor?.kind === 'player' && !!actor.location && active(actor); })) issue('An active blueprint requires a living playable actor.');
  for (const [id, map] of Object.entries(w.maps)) {
    if (map.id !== id) issue(`Map ID mismatch ${id}.`);
    if (map.tiles.length !== map.height || map.tiles.some(row => row.length !== map.width || /[^#.,~]/.test(row))) issue(`Map ${id} dimensions or tiles are invalid.`);
    for (const exit of map.exits) {
      if (!tileOpen(w, { mapId: id, x: exit.x, y: exit.y, elevation: 0 }) || !tileOpen(w, { mapId: exit.toMapId, x: exit.toX, y: exit.toY, elevation: 0 })) issue(`Map ${id} has an invalid exit.`);
      else if (Object.values(w.entities).some(e => e.solid && e.interaction?.type !== 'door' && distance(e.location, { mapId: exit.toMapId, x: exit.toX, y: exit.toY, elevation: 0 }) === 0)) issue(`Map ${id} has a blocked arrival.`);
    }
  }
  for (const [id, e] of Object.entries(w.entities)) {
    if (id !== e.id) issue(`Entity ID mismatch ${id}.`);
    if ((e.location === null) === (e.holderId === null)) issue(`Entity ${id} must have exactly one location or holder.`);
    if (e.location && !tileOpen(w, e.location)) issue(`Entity ${id} has an invalid position.`);
    if (e.hp > e.maxHp) issue(`Entity ${id} health exceeds maximum.`);
    if (e.inventory.length > (w.sandbox?.enabled ? 128 : 8) || new Set(e.inventory).size !== e.inventory.length) issue(`Entity ${id} has invalid inventory capacity or duplicates.`);
    if (e.holderId && (!own(w.entities, e.holderId)?.inventory.includes(id) || e.kind !== 'item')) issue(`Entity ${id} has inconsistent ownership.`);
    for (const child of e.inventory) if (own(w.entities, child)?.holderId !== id) issue(`Entity ${id} inventory ownership mismatch.`);
    const seen = new Set([id]); let holder = e.holderId;
    while (holder && own(w.entities, holder)) { if (seen.has(holder)) { issue(`Entity ${id} has cyclic ownership.`); break; } seen.add(holder); holder = own(w.entities, holder)!.holderId; }
    if (e.interaction?.requiresItemId && !own(w.entities, e.interaction.requiresItemId)) issue(`Entity ${id} requires a missing item.`);
    if (e.interaction?.targetId && !own(w.entities, e.interaction.targetId)) issue(`Entity ${id} references a missing target.`);
    if (e.interaction?.grantsFact && !own(w.facts, e.interaction.grantsFact)) issue(`Entity ${id} grants a missing fact.`);
    for (const fact of e.knowledge) if (!own(w.facts, fact)) issue(`Entity ${id} knows a missing fact.`);
  }
  if (w.objective.type === 'fact' && (!w.objective.factId || !own(w.facts, w.objective.factId) || !Object.values(w.entities).some(e => e.interaction?.grantsFact === w.objective.factId))) issue('Fact objective needs a fact and a discoverable source.');
  if (w.objective.type === 'possess' && (!w.objective.targetId || !own(w.entities, w.objective.targetId)?.portable)) issue('Possession objective needs a portable target.');
  if (w.objective.type === 'reach' && (!w.objective.mapId || !own(w.maps, w.objective.mapId))) issue('Reach objective needs a map.');
  // Solve reachable key/lever/switch gates to a fixed point. Authored narrative solutions are separately replayed.
  const start = w.actorIds.map(id => own(w.entities, id)).find(e => e && active(e))?.location;
  if (start && !errors.length) {
    const visited = new Set<string>();
    const key = (p: Position) => `${p.mapId}:${p.x}:${p.y}`;
    const gates = Object.values(w.entities).filter(e => e.location && e.statuses.includes('locked') && e.interaction?.type === 'door');
    const obstructions = Object.values(w.entities).filter(e => e.location && e.solid && e.interaction?.type !== 'door' && !e.tags.includes('pushable') && !e.statuses.includes('broken') && !e.statuses.includes('open'));
    const opened = new Set<string>();
    const adjacentReachable = (p: Position) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => visited.has(key({ ...p, x: p.x + dx, y: p.y + dy })));
    const accessible = (e: Entity): boolean => {
      if (e.location) return !e.statuses.includes('hidden') && adjacentReachable(e.location);
      const holder = e.holderId ? own(w.entities, e.holderId) : undefined;
      return !!holder && (w.actorIds.includes(holder.id) || (!holder.statuses.includes('locked') && holder.interaction?.type === 'container' && accessible(holder)));
    };
    let changed = true;
    while (changed) {
      changed = false; visited.clear(); const queue: Position[] = [start];
      const blocked = (p: Position) => gates.some(e => !opened.has(e.id) && distance(e.location, p) === 0) || obstructions.some(e => distance(e.location, p) === 0);
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i]; if (visited.has(key(p))) continue; visited.add(key(p));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = { ...p, x: p.x + dx, y: p.y + dy }; if (tileOpen(w, n) && !blocked(n) && !visited.has(key(n))) queue.push(n); }
        for (const exit of w.maps[p.mapId].exits) if (exit.x === p.x && exit.y === p.y) { const n = { mapId: exit.toMapId, x: exit.toX, y: exit.toY, elevation: 0 }; if (!blocked(n) && !visited.has(key(n))) queue.push(n); }
      }
      for (const gate of gates) {
        if (opened.has(gate.id) || !adjacentReachable(gate.location!)) continue;
        const matchingKey = gate.interaction?.requiresItemId ? own(w.entities, gate.interaction.requiresItemId) : null;
        const canUnlock = matchingKey?.portable && accessible(matchingKey);
        const canLever = gate.tags.includes('leverable') && Object.values(w.entities).some(e => e.portable && e.tags.includes('lever') && accessible(e));
        const canSwitch = Object.values(w.entities).some(e => e.interaction?.type === 'switch' && e.interaction.targetId === gate.id && accessible(e));
        if (canUnlock || canLever || canSwitch) { opened.add(gate.id); changed = true; }
      }
    }
    for (const map of Object.values(w.maps)) {
      if (![...visited].some(k => k.startsWith(`${map.id}:`))) issue(`Map ${map.id} is unreachable.`);
      for (const exit of map.exits) if (!visited.has(`${map.id}:${exit.x}:${exit.y}`)) issue(`Map ${map.id} has an unreachable exit.`);
    }
    for (const e of Object.values(w.entities)) if (e.location && !adjacentReachable(e.location)) issue(`Entity ${e.id} is unreachable.`);
    if (w.objective.type === 'possess' && w.objective.targetId && !accessible(w.entities[w.objective.targetId])) issue('The objective item has no accessible owner or location.');
    if (w.objective.type === 'fact' && !Object.values(w.entities).some(e => e.interaction?.grantsFact === w.objective.factId && accessible(e))) issue('The objective fact has no accessible source.');
  }
  return errors.length ? { ok: false, errors } : { ok: true, world: w };
}

export function instantiateBlueprint(blueprint: WorldState, id: string, seed: number): WorldState {
  const validation = validateBlueprint({ ...blueprint, id, seed, rng: seed >>> 0, revision: 0, tick: 0, phase: 'exploring', status: 'active', encounter: null });
  if (!validation.ok) throw new Error(validation.errors.join('\n'));
  const world = structuredClone(validation.world);
  world.dialogue = world.dialogue.map((line, i) => ({ ...line, id: `${id}:intro:${i}` }));
  return world;
}
