import { z } from 'zod';
import { Path } from 'rot-js';
import type { AdventureBrief, Entity, MapState, WorldState } from '../../packages/contracts';
import { applyCommandBatch, validateBlueprint } from '../../packages/engine';
import { ModelProvider } from './model';
import { assetCatalog } from '../../packages/assets/catalog';

const short = z.string().min(1).max(400);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const AdventureDesignSchema = z.object({
  title: short, premise: short, goal: short,
  protagonist: z.object({ name: short, description: short, opening: short, abilities: z.array(z.enum(['rest', 'mend', 'strike', 'flee', 'surrender'])).min(1).max(5) }).strict(),
  keyName: short, gateName: short, toolName: short, ending: short, secret: short,
  rooms: z.array(z.object({ name: short, description: short, ambience: short,
    palette: z.object({ floor: color, wall: color, accent: color }).strict(),
    objects: z.array(z.object({ name: short, description: short, assetId: z.string().min(1).max(60), kind: z.enum(['npc', 'item', 'fixture']), interaction: z.enum(['inspect', 'container', 'clue', 'food', 'water', 'fire', 'npc']), portable: z.boolean(), x: z.number().int().min(3).max(19), y: z.number().int().min(2).max(13), dialogue: z.string().max(400), fact: z.string().max(400), tags: z.array(z.enum(['pushable', 'rest', 'water', 'fire', 'keepsake', 'weapon'])).max(3) }).strict()).min(8).max(10),
  }).strict()).length(4),
}).strict();
export type AdventureDesign = z.infer<typeof AdventureDesignSchema>;
export type StructuredModel = Pick<ModelProvider, 'structured'>;

function entity(id: string, name: string, assetId: string, mapId: string, x: number, y: number, extra: Partial<Entity> = {}): Entity {
  return { id, name, description: name, assetId, kind: 'fixture', location: { mapId, x, y, elevation: 0 }, holderId: null, inventory: [], tags: [], hp: 12, maxHp: 12, weight: 1, solid: false, portable: false, statuses: [], abilities: [], stamina: 100, hunger: 0, emotion: 'watchful', traits: { kindness: 0.5, curiosity: 0.5, courage: 0.5 }, relationships: {}, knowledge: [], memories: [], intent: 'idle', dialogue: [], interaction: { type: 'inspect', requiresItemId: null, grantsFact: null, targetId: null }, ...extra };
}
export function compileAdventure(design: AdventureDesign, id: string, seed: number): WorldState {
  const world: WorldState = { schemaVersion: 1, id, title: design.title, premise: design.premise, goal: design.goal, seed, rng: seed >>> 0, revision: 0, tick: 0, phase: 'exploring', status: 'active', maps: {}, entities: {}, actorIds: ['player'], objective: { type: 'fact', factId: 'resolution', targetId: null, mapId: null }, facts: { resolution: design.ending }, knownFacts: [], secrets: { mystery: design.secret }, memories: [], dialogue: [{ id: `${id}:intro`, speakerId: 'player', speaker: design.protagonist.name, text: design.protagonist.opening, kind: 'thought' }], encounter: null, style: { accent: design.rooms[0].palette.accent, ambience: design.rooms[0].ambience } };
  design.rooms.forEach((room, index) => {
    const mapId = `room-${index}`;
    const map: MapState = { id: mapId, name: room.name, description: room.description, width: 24, height: 16, tiles: Array.from({ length: 16 }, (_, y) => y === 0 || y === 15 ? '#'.repeat(24) : '#' + '.'.repeat(22) + '#'), discovered: index === 0, ambience: room.ambience, palette: room.palette, exits: [] };
    if (index > 0) map.exits.push({ x: 1, y: 8, toMapId: `room-${index-1}`, toX: 20, toY: 8 });
    if (index < 3) map.exits.push({ x: 22, y: 8, toMapId: `room-${index+1}`, toX: 2, toY: 8 });
    if (index === 1) map.tiles = map.tiles.map((row, y) => y === 8 ? row : row.slice(0,21) + '#' + row.slice(22));
    world.maps[mapId] = map;
    const occupied = new Set<string>();
    room.objects.forEach((object, n) => {
      if (object.y === 8 || occupied.has(`${object.x},${object.y}`)) throw new Error(`${mapId}: keep row 8 clear and use unique coordinates.`);
      occupied.add(`${object.x},${object.y}`);
      const eid = `${mapId}-object-${n}`;
      const factId = object.fact ? `${eid}-fact` : null;
      if(factId) world.facts[factId] = object.fact;
      const asset = assetCatalog.some(a => a.id === object.assetId) ? object.assetId : `custom-${eid}`;
      world.entities[eid] = entity(eid, object.name, asset, mapId, object.x, object.y, { description: object.description, kind: object.kind, portable: object.kind === 'item' && object.portable, solid: object.kind === 'fixture' && ['bed','table','wardrobe','chest','crate','barrel','fountain'].includes(object.assetId), tags: object.tags, dialogue: object.dialogue ? [object.dialogue] : [], interaction: { type: object.kind === 'npc' ? 'npc' : object.interaction, grantsFact: factId, requiresItemId: null, targetId: null } });
    });
  });
  world.entities.player = entity('player', design.protagonist.name, 'player', 'room-0', 4, 8, { kind: 'player', description: design.protagonist.description, hp: 24, maxHp: 24, abilities: design.protagonist.abilities });
  world.entities.key = entity('key', design.keyName, 'key', 'room-0', 5, 8, { kind: 'item', portable: true, tags: ['key'] });
  world.entities.tool = entity('tool', design.toolName, 'crowbar', 'room-0', 6, 8, { kind: 'item', portable: true, tags: ['lever'] });
  world.entities.gate = entity('gate', design.gateName, 'door', 'room-1', 21, 8, { solid: true, statuses: ['locked'], tags: ['leverable'], interaction: { type: 'door', requiresItemId: 'key', grantsFact: null, targetId: null } });
  world.entities.resolution = entity('resolution', 'The answer', 'keepsake', 'room-3', 10, 8, { description: design.ending, interaction: { type: 'clue', grantsFact: 'resolution', requiresItemId: null, targetId: null } });
  const validation = validateBlueprint(world);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  if (!verifySolution(world)) throw new Error('The solution could not be replayed.');
  return world;
}

export function verifySolution(input: WorldState): boolean {
  let world = structuredClone(input);
  const actorId = world.actorIds[0];
  const apply = (intent: Parameters<typeof applyCommandBatch>[2][number]) => { const next = applyCommandBatch(world, actorId, [intent]); if (!next.ok) throw new Error(next.error.message); world = next.world; };
  const walk = (x: number, y: number) => {
    const position = world.entities[actorId].location!; const map = world.maps[position.mapId]; const points: number[][] = [];
    new Path.AStar(x,y,(tx,ty) => map.tiles[ty]?.[tx] !== undefined && map.tiles[ty][tx] !== '#' && !Object.values(world.entities).some(e => e.solid && e.location?.mapId === map.id && e.location.x === tx && e.location.y === ty), { topology: 4 }).compute(position.x,position.y,(tx,ty) => points.push([tx,ty]));
    if (!points.length) throw new Error('No path');
    for(const [tx,ty] of points.slice(1)) apply({ type: 'move', x: tx, y: ty });
  };
  try {
    apply({ type: 'pickUp', targetId: 'key' }); walk(22,8); walk(20,8); apply({ type: 'use', itemId: 'key', targetId: 'gate' }); walk(22,8); walk(22,8); walk(9,8); apply({ type: 'interact', targetId: 'resolution' });
    return world.status === 'won';
  } catch { return false; }
}

export async function generateAdventure(model: StructuredModel, brief: AdventureBrief, id: string, seed: number): Promise<WorldState> {
  let feedback = '';
  for(let attempt = 0; attempt < 3; attempt++) {
    try {
      const design = await model.structured(AdventureDesignSchema, `Design a complete original intimate 10-minute narrative RPG chapter from the player's brief. Four distinct furnished rooms in a linear connected route. One clear goal communicated in the opening thought, gradual diegetic clues, around three meaningful NPCs across the chapter, choice-sensitive characterization. A matching key and lever tool will be placed in the first room; the second room has a gate; the fourth has the resolution. Make these parts fit your fiction and foreshadow both solutions through object descriptions/NPC speech. Each room needs 8-10 unique tangible objects. Coordinates x=3..19,y=2..13, NEVER y=8, no duplicate coordinates. Rich furniture near walls, not a field of identical objects. Use different room palettes. Objects can provide facts via interaction. Only defined abilities are allowed. Do not invent quest branches or claim unsupported mechanics. Available asset IDs: ${assetCatalog.filter(a => !a.id.includes('-')).map(a=>a.id).join(', ')}. Up to two unusual objects may request new asset IDs; these will generate art asynchronously.`, JSON.stringify({ brief, repair: feedback }), 150000);
      return compileAdventure(design,id,seed);
    } catch(error) { feedback = error instanceof Error ? error.message : 'Invalid design'; if(attempt === 2) throw new Error(`Adventure generation failed validation: ${feedback}`); }
  }
  throw new Error('Adventure generation failed.');
}
