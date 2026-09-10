import { createHash } from 'node:crypto';
import { Path } from 'rot-js';
import { WorldStateSchema, type EngineResult, type Entity, type Position, type WorldEvent, type WorldState } from '../contracts';
import { SandboxProposalSchema } from '../contracts/sandbox';
import { fixtureEntity } from './fixtures';

class SandboxError extends Error {}
const fail = (message: string): never => { throw new SandboxError(message); };
const own = <T>(record: Record<string, T>, id: string): T | undefined => Object.hasOwn(record, id) ? record[id] : undefined;
const set = <T>(record: Record<string, T>, id: string, value: T) => Object.defineProperty(record, id, { value, enumerable: true, writable: true, configurable: true });
const near = (a: Position | null, b: Position | null, reach: number) => !!a && !!b && a.mapId === b.mapId && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= reach;
const appearance = (prefix: string, description: string) => `${prefix}-${createHash('sha256').update(description).digest('hex').slice(0, 24)}`;

/** Resolve one model decision, not model prose, into one replayable atomic world revision. */
export function resolveSandboxTurn(input: WorldState, actorId: string, value: unknown): EngineResult {
  const parsed = SandboxProposalSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: { code: 'INVALID_SANDBOX_PROPOSAL', message: parsed.error.message } };
  try {
    const proposal = parsed.data;
    if (!proposal.changes.length && !proposal.dialogue.length && !proposal.rules.length) fail('A resolution needs an actual change or dialogue.');
    const world = structuredClone(input);
    const actor = own(world.entities, actorId);
    if (!actor?.location || !world.actorIds.includes(actorId)) fail('Unknown player actor.');
    const player = actor!;
    const mapId = player.location!.mapId;
    const map = own(world.maps, mapId)!;
    world.sandbox ??= { enabled: true, rules: [], forms: [] };
    const sandbox = world.sandbox;
    world.revision++;
    if (proposal.changes.length) world.tick++;
    // A sandbox has no terminal quest state. Character health still remains canonical.
    world.status = 'active';
    world.phase = world.encounter?.status === 'active' ? 'encounter' : 'exploring';
    const events: WorldEvent[] = [];
    const emit = (type: string, text: string, targetId: string | null, data: Record<string, unknown> = {}): WorldEvent => {
      const event = { id: `${world.id}:${world.revision}:${events.length}`, seq: 0, revision: world.revision, tick: world.tick, type, actorId, targetId, mapId, text, data };
      events.push(event); return event;
    };
    const target = (id: string, writable = true): Entity => {
      const entity = own(world.entities, id);
      if (!entity || entity.statuses.includes('hidden') || !(entity.holderId === actorId || entity.location?.mapId === mapId)) return fail('Target is not visible in this scene.');
      if (writable && entity.kind === 'player' && entity.id !== actorId) fail('Cannot rewrite another player character.');
      if (writable && world.encounter?.status === 'active' && !world.encounter.participantIds.includes(actorId) && world.encounter.participantIds.includes(id)) fail('Another party owns that active encounter participant.');
      return entity;
    };
    const open = (x: number, y: number, except?: string, collide = true) => x >= 0 && y >= 0 && x < map.width && y < map.height && !!map.tiles[y]?.[x] && map.tiles[y][x] !== '#' && (!collide || !Object.values(world.entities).some(e => e.id !== except && e.solid && !e.statuses.includes('broken') && !e.statuses.includes('open') && e.location?.mapId === mapId && e.location.x === x && e.location.y === y));
    const remember = (event: WorldEvent, privateActor?: string) => {
      const memory = { eventId: event.id, text: event.text, kind: 'observation' as const };
      if (!privateActor) world.memories = [...world.memories, memory].slice(-256);
      for (const entity of Object.values(world.entities)) {
        if (!['npc', 'player'].includes(entity.kind)) continue;
        if (privateActor ? entity.id === privateActor : entity.id === actorId || entity.id === event.targetId || near(entity.location, player.location, 8)) entity.memories = [...entity.memories, memory].slice(-128);
      }
    };
    for (const change of proposal.changes) {
      if (change.type === 'encounter') {
        if (world.encounter?.status === 'active' && !world.encounter.participantIds.includes(actorId)) fail('Another party owns the active encounter.');
        if (change.outcome === 'active') {
          const enemies = [...new Set(change.enemyIds)].map(id => target(id));
          if (!enemies.length || enemies.some(enemy => enemy.kind !== 'npc')) fail('An encounter needs one or more NPC participants.');
          const ongoing = world.encounter?.status === 'active';
          world.encounter = { id: ongoing ? world.encounter!.id : `${world.id}:encounter:${world.revision}`, mapId, participantIds: [actorId, ...enemies.map(enemy => enemy.id)], turnActorId: actorId, round: ongoing ? world.encounter!.round : 1, status: 'active' };
          for (const enemy of enemies) enemy.intent = 'hostile';
          world.phase = 'encounter';
        } else if (world.encounter) {
          world.encounter.status = change.outcome; world.phase = 'exploring';
          for (const id of world.encounter.participantIds) {
            const enemy = own(world.entities, id);
            if (enemy?.kind === 'npc' && enemy.location?.mapId === mapId && !enemy.statuses.includes('hidden')) enemy.intent = 'idle';
          }
        }
        emit('encounter', change.outcome === 'active' ? 'An encounter begins.' : `The encounter is ${change.outcome}.`, null, { status: change.outcome });
        continue;
      }
      if (change.type === 'terrain') {
        if (change.x < 0 || change.y < 0 || change.x >= map.width || change.y >= map.height) fail('Terrain coordinates are outside this map.');
        if (change.terrain === 'wall' && Object.values(world.entities).some(entity => entity.location?.mapId === mapId && entity.location.x === change.x && entity.location.y === change.y)) fail('That wall placement conflicts with occupied scene state.');
        const tile = change.terrain === 'wall' ? '#' : change.terrain === 'water' ? '~' : '.';
        map.tiles[change.y] = map.tiles[change.y].slice(0, change.x) + tile + map.tiles[change.y].slice(change.x + 1);
        map.tileStates ??= {};
        const key = `${change.x},${change.y}`;
        if (change.state) set(map.tileStates, key, change.state); else delete map.tileStates[key];
        emit('terrain', change.state || `The ground becomes ${change.terrain}.`, null, { location: { mapId, x: change.x, y: change.y, elevation: 0 } });
        continue;
      }
      if (change.type === 'spawn') {
        const count = change.count ?? 1;
        if (!open(change.x, change.y, undefined, change.solid) || Object.values(world.entities).filter(e => e.location?.mapId === mapId && !e.statuses.includes('hidden')).length + count > 512) fail('Spawn requires a valid floor tile within the scene budget.');
        const occupied = new Set(Object.values(world.entities).filter(entity => entity.location?.mapId === mapId).map(entity => `${entity.location!.x},${entity.location!.y}`));
        const positions = count === 1 ? [{ x: change.x, y: change.y }] : Array.from({ length: map.width * map.height }, (_, index) => ({ x: index % map.width, y: Math.floor(index / map.width) }))
          .filter(p => !occupied.has(`${p.x},${p.y}`) && open(p.x, p.y, undefined, change.solid))
          .sort((a, b) => (Math.abs(a.x - change.x) + Math.abs(a.y - change.y)) - (Math.abs(b.x - change.x) + Math.abs(b.y - change.y)) || a.y - b.y || a.x - b.x);
        if (positions.length < count) fail('The current map does not have enough floor cells for this group.');
        for (let index = 0; index < count; index++) {
          const id = count === 1 ? change.id : `${change.id}-${index + 1}`;
          if (Object.hasOwn(world.entities, id)) fail('Spawn IDs must be unique; use a new group ID.');
          const entity = fixtureEntity(id, change.name, change.assetId, mapId, positions[index].x, positions[index].y, {
            description: change.description, kind: change.kind, tags: change.tags, solid: change.solid, portable: change.portable, properties: change.properties,
          });
          if (entity.kind !== 'item' && entity.portable) fail('Portable objects must be items.');
          set(world.entities, entity.id, entity); emit('spawn', `${entity.name} appears.`, entity.id);
        }
        continue;
      }
      const entity = target(change.targetId);
      switch (change.type) {
        case 'open': {
          if (entity.kind === 'player' || !(entity.inventory.length || entity.interaction?.type === 'container' || entity.tags.includes('container')) || !entity.location) fail('Opening requires a visible container or NPC pack.');
          entity.statuses = entity.statuses.filter(status => status !== 'locked');
          if (!entity.statuses.includes('open')) entity.statuses.push('open');
          for (const id of entity.inventory) {
            const item = own(world.entities, id);
            if (!item || item.holderId !== entity.id || item.kind !== 'item') fail('Container ownership is inconsistent.');
            const position = entity.location!;
            const destination = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({ ...position, x: position.x + dx, y: position.y + dy })).find(p => open(p.x, p.y, item!.id, item!.solid));
            if (!destination) fail('There is no room to expose the container contents.');
            item!.holderId = null; item!.location = destination!;
            item!.statuses = item!.statuses.filter(status => status !== 'hidden');
          }
          entity.inventory = [];
          emit('interact', `${entity.name} opens.`, entity.id); break;
        }
        case 'update': {
          if (entity.kind === 'player' && (change.values.kind || change.values.portable)) fail('Character identity cannot be changed by an object update.');
          if (change.values.statuses?.includes('hidden')) fail('Use remove for disappearing objects; hidden content cannot be authored through an update.');
          Object.assign(entity, change.values);
          if (entity.hp > entity.maxHp || entity.kind !== 'item' && entity.portable || entity.holderId && entity.kind !== 'item') fail('Entity health or ownership is inconsistent.');
          if (entity.solid && entity.location && !open(entity.location.x, entity.location.y, entity.id)) fail('A solid object cannot intersect another solid object.');
          if (Object.keys(entity.properties ?? {}).length > 64) fail('Too many entity properties.');
          if (entity.hp === 0) { entity.solid = false; if (!entity.statuses.includes('dead')) entity.statuses.push('dead'); }
          else entity.statuses = entity.statuses.filter(status => status !== 'dead');
          emit('change', `${entity.name} changes.`, entity.id); break;
        }
        case 'transform': {
          if (!sandbox.forms.some(form => form.actorId === entity.id)) sandbox.forms.push({ actorId: entity.id, assetId: entity.assetId, description: entity.description, tags: [...entity.tags], grantedAbilities: [] });
          const saved = sandbox.forms.find(form => form.actorId === entity.id)!;
          entity.abilities = entity.abilities.filter(id => !saved.grantedAbilities.includes(id));
          saved.grantedAbilities = change.abilities.filter(id => !entity.abilities.includes(id));
          entity.abilities = [...new Set([...entity.abilities, ...change.abilities])];
          entity.assetId = appearance('form', `${change.form}:${change.description}`);
          entity.description = change.description;
          entity.tags = [...entity.tags.filter(tag => !tag.startsWith('form:')), `form:${change.form}`];
          emit('transform', `${entity.name} becomes ${change.form}.`, entity.id, { form: change.form }); break;
        }
        case 'revert': {
          const saved = sandbox.forms.find(form => form.actorId === entity.id);
          if (!saved) fail('There is no previous form to restore.');
          entity.assetId = saved!.assetId; entity.description = saved!.description; entity.tags = saved!.tags;
          entity.abilities = entity.abilities.filter(id => !saved!.grantedAbilities.includes(id));
          sandbox.forms = sandbox.forms.filter(form => form.actorId !== entity.id);
          emit('transform', `${entity.name} returns to their earlier form.`, entity.id, { form: 'original' }); break;
        }
        case 'relocate': {
          if (!entity.location && entity.holderId === actorId && player.location!.x === change.x && player.location!.y === change.y) {
            emit('move', `${entity.name} arrives in ${player.name}'s hand.`, entity.id, { location: player.location });
            break;
          }
          if (!entity.location) fail('That item is carried. Transfer already places it with its holder; use transfer with recipientId null before moving it elsewhere.');
          if (!open(change.x, change.y, entity.id)) fail('Destination is outside the map or blocked.');
          let path: [number, number][] = [];
          if (change.mode === 'walk') {
            new Path.AStar(change.x, change.y, (x, y) => open(x, y, entity.id), { topology: 4 }).compute(entity.location!.x, entity.location!.y, (x, y) => path.push([x, y]));
            if (!path.length) fail('No walkable path reaches that destination.');
          }
          const from = path.length > 1 ? path[path.length - 2] : [entity.location!.x, entity.location!.y];
          const dx = change.x - from[0], dy = change.y - from[1];
          if (dx || dy) entity.facing = Math.abs(dx) >= Math.abs(dy) ? dx > 0 ? 'east' : 'west' : dy > 0 ? 'south' : 'north';
          entity.location = { ...entity.location!, x: change.x, y: change.y };
          emit('move', `${entity.name} moves.`, entity.id, { location: entity.location }); break;
        }
        case 'transfer': {
          if (entity.kind !== 'item' || !entity.portable || entity.holderId && entity.holderId !== actorId) fail('Only accessible portable items can be transferred.');
          const recipient = change.recipientId ? target(change.recipientId) : null;
          if (recipient?.id === entity.id || recipient && recipient.inventory.length >= 128) fail('Invalid recipient or storage budget reached.');
          if (recipient && recipient.kind === 'item') fail('An item cannot hold another item.');
          if (recipient?.kind === 'fixture' && recipient.interaction?.type !== 'container' && !recipient.tags.includes('container')) fail('Choose a container or character to hold the item.');
          const position = player.location!;
          const drop = recipient ? null : [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({ ...position, x: position.x + dx, y: position.y + dy })).find(p => open(p.x, p.y, entity.id, entity.solid));
          if (!recipient && !drop) fail('There is no free floor space to put that item down.');
          if (entity.holderId) world.entities[entity.holderId].inventory = world.entities[entity.holderId].inventory.filter(id => id !== entity.id);
          entity.holderId = recipient?.id ?? null; entity.location = drop ?? null;
          if (recipient && !recipient.inventory.includes(entity.id)) recipient.inventory.push(entity.id);
          emit('transfer', `${entity.name} ${recipient ? `is given to ${recipient.name}` : 'is put down'}.`, entity.id); break;
        }
        case 'remove': {
          if (entity.kind === 'player' || entity.inventory.length) fail('Cannot remove a player or an occupied container. Empty its contents first.');
          if (entity.holderId) world.entities[entity.holderId].inventory = world.entities[entity.holderId].inventory.filter(id => id !== entity.id);
          remember(emit('remove', `${entity.name} disappears.`, null, { location: entity.location }));
          // Keep a non-visible tombstone so remote mechanics and historical memories retain valid IDs.
          entity.holderId = null;
          entity.location ??= structuredClone(player.location);
          entity.hp = 0; entity.solid = false; entity.statuses = ['dead', 'hidden'];
          entity.properties = { ...entity.properties, removed: true };
          sandbox.forms = sandbox.forms.filter(form => form.actorId !== entity.id);
          if (world.encounter?.participantIds.includes(entity.id)) { world.encounter.status = 'fled'; world.phase = 'exploring'; }
          break;
        }
        case 'social': {
          if (entity.kind !== 'npc') fail('Social reactions require an NPC.');
          entity.emotion = change.emotion;
          set(entity.relationships, actorId, Math.max(-100, Math.min(100, (own(entity.relationships, actorId) ?? 0) + change.relationshipDelta)));
          remember(emit('social', change.memory, entity.id)); break;
        }
      }
    }
    for (const rule of proposal.rules) {
      const previous = sandbox.rules.filter(item => item.id === rule.id && item.mapId === mapId).at(-1);
      if (previous?.description === rule.description) continue;
      if (sandbox.rules.length >= 128) fail('The saved rule history is full.');
      sandbox.rules.push({ ...rule, mapId, version: (previous?.version ?? 0) + 1 });
      emit('rule', rule.description, null);
    }
    for (const line of proposal.dialogue) {
      const speaker = line.speakerId ? target(line.speakerId, false) : null;
      if (line.kind === 'thought' && speaker?.id !== actorId) fail('Only the acting player can have private thoughts in this resolution.');
      if (speaker?.kind === 'player' && speaker.id !== actorId || speaker && !['player', 'npc'].includes(speaker.kind)) fail('Dialogue requires the acting player or an NPC.');
      const event = emit(line.kind === 'speech' ? 'speech' : line.kind, line.text, speaker?.id ?? null);
      world.dialogue.push({ id: event.id, speakerId: speaker?.id ?? null, speaker: speaker?.name ?? 'The story', text: line.text, kind: line.kind });
      remember(event, line.kind === 'thought' ? actorId : undefined);
    }
    world.dialogue = world.dialogue.slice(-80);
    if (input.encounter?.status === 'active' && world.encounter?.status === 'active' && world.encounter.id === input.encounter.id && world.encounter.mapId === mapId && world.encounter.participantIds.includes(actorId) && proposal.changes.length) world.encounter.round++;
    const validated = WorldStateSchema.safeParse(world);
    if (!validated.success) fail('Resolved world does not satisfy the state contract.');
    return { ok: true, world: validated.data!, events };
  } catch (error) {
    if (error instanceof SandboxError) return { ok: false, error: { code: 'INVALID_SANDBOX_CHANGE', message: error.message } };
    throw error;
  }
}
